import { z } from "zod";
import { createHmac } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import { getStaff, type StaffCtx } from "../util";
import { mailProvider, sendEmail } from "../lib/mailer";
import { bumpWebsiteJobsCache } from "../lib/website-revalidate";
import { writeWebsiteAudit, humaniseAuditAction } from "../lib/website-audit";
import {
  WebsiteDbError,
  WEBSITE_AI_MIGRATION_HINT,
  isMissingWebsiteTable,
  websiteCount,
  websiteDelete,
  websiteInsert,
  websiteSelect,
  websiteSelectOne,
  websiteUpdate,
  type WebsiteFilter,
  type WebsiteTable,
} from "../lib/website-db";
import {
  publicMediaUrl,
  removeWebsiteMedia,
  sniffWebsiteMedia,
  websiteMediaUploadTarget,
} from "../lib/website-media";
import {
  removeWebsiteKb,
  signedWebsiteKbUrl,
  websiteKbUploadTarget,
} from "../lib/website-kb-store";
import { indexWebsiteKbDocument } from "../lib/website-kb-index";
import { answerWebsiteChat, getWebsiteAiPublicConfig } from "../ai/website-chat";
import { AiMisconfigured, AiUnavailable } from "../ai/ai-client";
import type { StaffRole } from "@db/schema";

/* ── Row types (snake_case, as stored) ─────────────────────────────────────── */

type EnquiryRow = {
  id: string; full_name: string; email: string; phone: string | null; enquiry_type: string;
  care_type: string | null; message: string; source_page: string | null; status: string; created_at: string;
};
type ReviewRow = {
  id: string; name: string; relationship: string; rating: number; title: string; body: string;
  status: string; approved_at: string | null; reviewed_at: string | null; created_at: string;
};
type ApplicationRow = {
  id: number; name: string; email: string; phone: string | null; job_slug: string; cover_letter: string;
  right_to_work: boolean; driving_licence: boolean; status: string; created_at: string;
};
type SubscriberRow = { id: number; email: string; status: string; created_at: string };
type NewsletterRow = {
  id: number; subject: string; content: string; recipients_count: number | null; status: string;
  sent_at: string | null; created_at: string;
};
type PostRow = {
  id: number; title: string; slug: string; category: string; image_url: string | null; excerpt: string;
  content: string; status: string; created_at: string; updated_at: string;
};
type AuditRow = {
  id: number; action: string; entity_type: string; entity_id: string | null; details: string | null; created_at: string;
};
type BacklinkRow = {
  id: number; domain: string; url: string | null; notes: string | null; status: string; created_at: string;
};
type SiteSettingsRow = { id: string; payload: Record<string, unknown>; updated_at: string };
type ServiceRow = {
  id: number; slug: string; name: string; short: string; image: string; image_alt: string; icon: string;
  badge: string | null; body: unknown; sort_order: number; status: string;
  seo_title: string | null; seo_description: string | null; created_at: string; updated_at: string;
};
type AreaRow = {
  id: number; slug: string; name: string; region: string; intro: string; surrounding: string;
  image?: string; image_alt?: string;
  sort_order: number; status: string; seo_title: string | null; seo_description: string | null;
  created_at: string; updated_at: string;
};
type SectionRow = {
  id: number; page_key: string; section_key: string; label: string; content: unknown;
  sort_order: number; status: string; updated_at: string;
};
type BranchRow = {
  id: number; name: string; address: string; city: string; postcode: string;
  phone: string; phone_display: string; email: string; hours: string; maps_url: string;
  image: string; image_alt: string; sort_order: number; status: string;
  created_at: string; updated_at: string;
};
type MediaRow = {
  id: number; kind: string; url: string; storage_key: string | null; file_name: string;
  alt: string; folder: string; width: number | null; height: number | null;
  bytes: number | null; mime_type: string; created_by: string | null; created_at: string;
};
type NavRow = {
  id: number; menu: string; label: string; href: string; dropdown: string;
  sort_order: number; visible: boolean; created_at: string; updated_at: string;
};
type CertRow = {
  id: number; code: string; label: string; image: string; image_alt: string; url: string;
  sort_order: number; status: string; created_at: string; updated_at: string;
};

/* ── Constants ─────────────────────────────────────────────────────────────── */

/** new=New, read=In Progress, replied=Responded, closed=Closed */
export const ENQUIRY_STATUSES = ["new", "read", "replied", "closed"] as const;
export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export const APPLICATION_STATUSES = ["new", "reviewing", "shortlisted", "rejected"] as const;
export const SUBSCRIBER_STATUSES = ["active", "unsubscribed"] as const;
export const NEWSLETTER_STATUSES = ["draft", "sent"] as const;
export const POST_STATUSES = ["draft", "published", "archived"] as const;
export const POST_CATEGORIES = ["Care Advice", "Company News", "Health Tips", "Industry Updates"] as const;
export const BACKLINK_STATUSES = ["pending", "acquired"] as const;
export const CMS_STATUSES = ["draft", "published", "archived"] as const;

const EXPORT_CAP = 5000;

/* ── Access control: Registered Manager only ───────────────────────────────── */

function assertRegisteredManager(sc: StaffCtx) {
  const realRole = (sc.staff.homeRole ?? sc.staff.role) as StaffRole;
  if (realRole !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Website admin is for the Registered Manager only." });
  }
}

/** Every website procedure: signed in + approved staff + real role is Registered Manager. */
const websiteProcedure = authedQuery.use(async ({ ctx, next }) => {
  const sc = await getStaff(ctx);
  assertRegisteredManager(sc);
  return next({ ctx: { ...ctx, staffCtx: sc } });
});

/** Run a block, turning DB failures into tRPC errors. */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    if (e instanceof WebsiteDbError) {
      if (e.code === "23505") throw new TRPCError({ code: "CONFLICT", message: "That value already exists." });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message });
    }
    throw e;
  }
}

function notFound(what: string): never {
  throw new TRPCError({ code: "NOT_FOUND", message: `${what} not found` });
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

const listInput = z.object({
  status: z.string().max(40).optional(),
  q: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
}).optional();

const exportInput = z.object({ status: z.string().max(40).optional(), q: z.string().max(100).optional() }).optional();

type ListInput = z.infer<typeof listInput>;

function baseFilter(
  statuses: readonly string[], searchColumns: string[], input: { status?: string; q?: string } | undefined,
  applyStatus: boolean,
): WebsiteFilter {
  const f: WebsiteFilter = {};
  if (applyStatus && input?.status && input.status !== "all" && statuses.includes(input.status)) {
    f.eq = { status: input.status };
  }
  const q = input?.q?.trim();
  if (q && searchColumns.length) f.search = { columns: searchColumns, q };
  return f;
}

async function listTable<Row, Out>(opts: {
  table: WebsiteTable;
  statuses: readonly string[];
  searchColumns: string[];
  input: ListInput;
  map: (row: Row) => Out;
}) {
  const limit = opts.input?.limit ?? 25;
  const offset = opts.input?.offset ?? 0;
  const filter = baseFilter(opts.statuses, opts.searchColumns, opts.input, true);
  const countBase = baseFilter(opts.statuses, opts.searchColumns, opts.input, false);

  const [rows, total, all, ...perStatus] = await Promise.all([
    websiteSelect<Row>(opts.table, { ...filter, order: { column: "created_at", ascending: false }, limit, offset }),
    websiteCount(opts.table, filter),
    websiteCount(opts.table, countBase),
    ...opts.statuses.map((s) => websiteCount(opts.table, { ...countBase, eq: { status: s } })),
  ]);
  const counts: Record<string, number> = { all };
  opts.statuses.forEach((s, i) => { counts[s] = perStatus[i] ?? 0; });
  return { items: rows.map(opts.map), total, hasMore: offset + rows.length < total, counts, limit, offset };
}

async function exportTable<Row>(opts: {
  table: WebsiteTable;
  statuses: readonly string[];
  searchColumns: string[];
  input: { status?: string; q?: string } | undefined;
}): Promise<Row[]> {
  const filter = baseFilter(opts.statuses, opts.searchColumns, opts.input, true);
  return websiteSelect<Row>(opts.table, {
    ...filter, order: { column: "created_at", ascending: false }, limit: EXPORT_CAP,
  });
}

/** Neutralise spreadsheet formula injection in exported cells. */
function csvSafe(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /^[=@\t\r]|^[+-](?![\d\s])/.test(s) ? `'${s}` : s;
}

function toCsv(rows: unknown[][]): string {
  const escape = (c: string) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return rows.map((r) => r.map((c) => escape(csvSafe(c))).join(",")).join("\n");
}

function csvResult(prefix: string, rows: unknown[][]) {
  const stamp = new Date().toISOString().slice(0, 10);
  return { filename: `${prefix}-${stamp}.csv`, csv: toCsv(rows), count: rows.length - 1 };
}

function humaniseSlug(slug: string): string {
  return slug.split("-").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function websiteBaseUrl(): string {
  return (process.env.WEBSITE_URL || "https://uniquecareuk.com").replace(/\/+$/, "");
}

const slugify = (s: string): string =>
  s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/* ── Mappers ───────────────────────────────────────────────────────────────── */

const mapEnquiry = (e: EnquiryRow) => ({
  id: e.id, name: e.full_name, email: e.email, phone: e.phone, enquiryType: e.enquiry_type,
  careType: e.care_type, message: e.message, sourcePage: e.source_page, status: e.status, createdAt: e.created_at,
});
const mapReview = (r: ReviewRow) => ({
  id: r.id, name: r.name, relationship: r.relationship, rating: r.rating, title: r.title, body: r.body,
  status: r.status, approvedAt: r.approved_at, reviewedAt: r.reviewed_at, createdAt: r.created_at,
});
const mapApplication = (a: ApplicationRow) => ({
  id: a.id, name: a.name, email: a.email, phone: a.phone, jobSlug: a.job_slug, jobTitle: humaniseSlug(a.job_slug),
  coverLetter: a.cover_letter, rightToWork: a.right_to_work, drivingLicence: a.driving_licence,
  status: a.status, createdAt: a.created_at,
});
const mapSubscriber = (s: SubscriberRow) => ({ id: s.id, email: s.email, status: s.status, createdAt: s.created_at });
const mapNewsletter = (n: NewsletterRow) => ({
  id: n.id, subject: n.subject, content: n.content, recipientsCount: n.recipients_count,
  status: n.status, sentAt: n.sent_at, createdAt: n.created_at,
});
const mapPost = (p: PostRow) => ({
  id: p.id, title: p.title, slug: p.slug, category: p.category, imageUrl: p.image_url, excerpt: p.excerpt,
  content: p.content, status: p.status, createdAt: p.created_at, updatedAt: p.updated_at,
});
const mapBacklink = (b: BacklinkRow) => ({
  id: b.id, domain: b.domain, url: b.url, notes: b.notes, status: b.status, createdAt: b.created_at,
});
const mapService = (s: ServiceRow | undefined) => {
  if (!s) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Service row missing" });
  const body = Array.isArray(s.body) ? s.body.map(String) : [];
  return {
    id: s.id, slug: s.slug, name: s.name, short: s.short, image: s.image, imageAlt: s.image_alt,
    icon: s.icon, badge: s.badge, body, sortOrder: s.sort_order, status: s.status,
    seoTitle: s.seo_title, seoDescription: s.seo_description,
    createdAt: s.created_at, updatedAt: s.updated_at,
  };
};
const mapArea = (a: AreaRow | undefined) => {
  if (!a) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Area row missing" });
  return {
    id: a.id, slug: a.slug, name: a.name, region: a.region, intro: a.intro, surrounding: a.surrounding,
    image: a.image ?? "", imageAlt: a.image_alt ?? "",
    sortOrder: a.sort_order, status: a.status, seoTitle: a.seo_title, seoDescription: a.seo_description,
    createdAt: a.created_at, updatedAt: a.updated_at,
  };
};
const mapSection = (s: SectionRow | undefined) => {
  if (!s) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Section row missing" });
  return {
    id: s.id, pageKey: s.page_key, sectionKey: s.section_key, label: s.label,
    content: (s.content && typeof s.content === "object" ? s.content : {}) as Record<string, unknown>,
    sortOrder: s.sort_order, status: s.status, updatedAt: s.updated_at,
  };
};
const mapBranch = (b: BranchRow | undefined) => {
  if (!b) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Branch row missing" });
  return {
    id: b.id, name: b.name, address: b.address, city: b.city, postcode: b.postcode,
    phone: b.phone, phoneDisplay: b.phone_display, email: b.email, hours: b.hours, mapsUrl: b.maps_url,
    image: b.image, imageAlt: b.image_alt, sortOrder: b.sort_order, status: b.status,
    createdAt: b.created_at, updatedAt: b.updated_at,
  };
};
const mapMedia = (m: MediaRow | undefined) => {
  if (!m) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Media row missing" });
  return {
    id: m.id, kind: m.kind, url: m.url, storageKey: m.storage_key, fileName: m.file_name,
    alt: m.alt, folder: m.folder, width: m.width, height: m.height, bytes: m.bytes,
    mimeType: m.mime_type, createdBy: m.created_by, createdAt: m.created_at,
  };
};
const mapNav = (n: NavRow | undefined) => {
  if (!n) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Nav row missing" });
  return {
    id: n.id, menu: n.menu, label: n.label, href: n.href, dropdown: n.dropdown,
    sortOrder: n.sort_order, visible: n.visible, createdAt: n.created_at, updatedAt: n.updated_at,
  };
};
const mapCert = (c: CertRow | undefined) => {
  if (!c) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Certification row missing" });
  return {
    id: c.id, code: c.code, label: c.label, image: c.image, imageAlt: c.image_alt, url: c.url,
    sortOrder: c.sort_order, status: c.status, createdAt: c.created_at, updatedAt: c.updated_at,
  };
};

/** Keep site_settings.offices in sync so older readers still work. */
async function syncOfficesFromBranches() {
  const rows = await websiteSelect<BranchRow>("website_branches", {
    eq: { status: "published" },
    order: { column: "sort_order", ascending: true },
    limit: 100,
  });
  const offices = rows.map((b) => ({ name: b.name, address: b.address }));
  const settings = await websiteSelectOne<SiteSettingsRow>("website_site_settings", { eq: { id: "default" } });
  const payload = { ...(settings?.payload ?? {}), offices };
  if (settings) {
    await websiteUpdate("website_site_settings", { eq: { id: "default" } }, {
      payload: payload as never, updated_at: new Date().toISOString(),
    });
  } else {
    await websiteInsert("website_site_settings", {
      id: "default", payload: payload as never, updated_at: new Date().toISOString(),
    });
  }
}

/* ── Newsletter email ──────────────────────────────────────────────────────── */

/**
 * Must match the website's lib/newsletter.ts so unsubscribe links verify there.
 * Set WEBSITE_UNSUBSCRIBE_SECRET on BOTH apps (same value); the fallbacks mirror the
 * website's legacy chain.
 */
/** Must match website/lib/newsletter.ts exactly (same fallback order). */
function unsubscribeSecret(): string {
  return (
    process.env.WEBSITE_UNSUBSCRIBE_SECRET
    || process.env.WEBSITE_ADMIN_SESSION_SECRET
    || process.env.REVIEW_MODERATION_SECRET
    || process.env.REVALIDATE_SECRET
    || "dev-only-change-me"
  );
}

function unsubscribeUrl(email: string): string {
  const token = createHmac("sha256", unsubscribeSecret()).update(`unsubscribe:${email.toLowerCase()}`).digest("base64url");
  return `${websiteBaseUrl()}/api/unsubscribe?${new URLSearchParams({ email, token }).toString()}`;
}

function newsletterBodyHtml(content: string): string {
  return content
    .split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
    .map((block) => {
      const safe = escapeHtml(block).replace(/\n/g, "<br/>");
      const linked = safe.replace(/\bhttps?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#124b99">${u}</a>`);
      return `<p style="margin:0 0 16px;line-height:1.65">${linked}</p>`;
    })
    .join("");
}

function newsletterEmailHtml(opts: { subject: string; content: string; email: string }): string {
  const host = websiteBaseUrl().replace(/^https?:\/\//, "");
  return `<!doctype html><html><body style="margin:0;background:#f7f8f7;font-family:Arial,Helvetica,sans-serif;color:#1a1f24">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#124b99;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
      <strong style="font-size:18px">Unique Care UK</strong>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e3e7e6;border-top:none;border-radius:0 0 12px 12px">
      <h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(opts.subject)}</h1>
      ${newsletterBodyHtml(opts.content)}
    </div>
    <p style="text-align:center;color:#5b6670;font-size:12px;margin-top:16px">
      Unique Resourcing Ltd · 280 Mare Street, Hackney, London E8 1HE<br/>
      You are receiving this because you subscribed on ${escapeHtml(host)}.
      <a href="${unsubscribeUrl(opts.email)}" style="color:#124b99">Unsubscribe</a>
    </p>
  </div></body></html>`;
}

/* ── SEO scan (simple) ─────────────────────────────────────────────────────── */

const SEO_PATHS = [
  "/", "/about", "/services", "/areas", "/careers", "/careers/jobs", "/blog", "/reviews", "/contact",
  "/privacy", "/terms", "/modern-slavery", "/carbon-reduction-plan",
];

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function metaContent(html: string, attr: "name" | "property", key: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const k = tag.match(new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, "i"));
    if (!k || k[1].toLowerCase() !== key) continue;
    const c = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (c) return decodeEntities(c[1] ?? c[2] ?? "");
  }
  return null;
}

type SeoIssue = { level: "error" | "warn"; message: string };

async function scanPage(base: string, path: string) {
  const url = `${base}${path === "/" ? "" : path}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "UniqueCareUK-SEO-Scanner/1.0", Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return { path, url, httpStatus: res.status, title: null, description: null, score: 0,
        issues: [{ level: "error", message: `HTTP ${res.status}` }] as SeoIssue[] };
    }
    const html = await res.text();
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = t ? decodeEntities(t[1]) : null;
    const description = metaContent(html, "name", "description");
    const robots = metaContent(html, "name", "robots");
    const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
    const issues: SeoIssue[] = [];
    let score = 100;
    const hit = (level: SeoIssue["level"], message: string, cost: number) => { issues.push({ level, message }); score -= cost; };
    if (!title) hit("error", "Missing <title>", 25);
    else if (title.length < 30 || title.length > 65) hit("warn", `Title length is ${title.length} chars (aim for 30–60)`, 8);
    if (!description) hit("error", "Missing meta description", 20);
    else if (description.length < 70 || description.length > 165) hit("warn", `Description length is ${description.length} chars (aim for 120–160)`, 6);
    if (robots && /noindex/i.test(robots)) hit("error", "Page is set to noindex", 25);
    if (h1Count === 0) hit("error", "No <h1> heading", 12);
    else if (h1Count > 1) hit("warn", `${h1Count} <h1> headings (use one)`, 6);
    if (!metaContent(html, "property", "og:image")) hit("warn", "Missing og:image", 6);
    return { path, url, httpStatus: res.status, title, description, score: Math.max(0, score), issues };
  } catch (e) {
    return { path, url, httpStatus: null as number | null, title: null, description: null, score: 0,
      issues: [{ level: "error", message: e instanceof Error ? `Fetch failed: ${e.message}` : "Fetch failed" }] as SeoIssue[] };
  }
}

/* ── Input schemas ─────────────────────────────────────────────────────────── */

const uuid = z.string().uuid();
const intId = z.number().int().positive();

const newsletterInput = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(200),
  content: z.string().trim().min(1, "Content is required").max(50000),
});

const imageUrl = z.string().trim().max(2000)
  .refine((v) => v === "" || /^https:\/\//i.test(v) || v.startsWith("/"), "Image must be an https:// URL or a /path")
  .optional();

const postInput = z.object({
  title: z.string().trim().min(2, "Title is required").max(200),
  slug: z.string().trim().max(80).optional(),
  category: z.enum(POST_CATEGORIES),
  imageUrl,
  excerpt: z.string().trim().max(500).default(""),
  content: z.string().max(100000).default(""),
  status: z.enum(POST_STATUSES).default("draft"),
});

const backlinkInput = z.object({
  domain: z.string().trim().min(3, "Domain is required").max(200),
  url: z.string().trim().max(2000)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "URL must start with http:// or https://").optional(),
  notes: z.string().trim().max(1000).optional(),
  status: z.enum(BACKLINK_STATUSES).default("pending"),
});

const cleanDomain = (v: string) => v.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();

async function uniqueSlug(wanted: string, excludeId?: number): Promise<string> {
  const slug = wanted || "post";
  const clash = await websiteSelectOne<{ id: number }>("website_posts", {
    columns: "id", eq: { slug }, ...(excludeId ? { neq: { id: excludeId } } : {}),
  });
  if (clash) throw new TRPCError({ code: "CONFLICT", message: `A post with the slug “${slug}” already exists.` });
  return slug;
}

async function uniqueServiceSlug(wanted: string, excludeId?: number): Promise<string> {
  const slug = wanted || "service";
  const clash = await websiteSelectOne<{ id: number }>("website_services", {
    columns: "id", eq: { slug }, ...(excludeId ? { neq: { id: excludeId } } : {}),
  });
  if (clash) throw new TRPCError({ code: "CONFLICT", message: `A service with the slug “${slug}” already exists.` });
  return slug;
}

async function uniqueAreaSlug(wanted: string, excludeId?: number): Promise<string> {
  const slug = wanted || "area";
  const clash = await websiteSelectOne<{ id: number }>("website_areas", {
    columns: "id", eq: { slug }, ...(excludeId ? { neq: { id: excludeId } } : {}),
  });
  if (clash) throw new TRPCError({ code: "CONFLICT", message: `An area with the slug “${slug}” already exists.` });
  return slug;
}

function sectionRevalidatePaths(pageKey: string): string[] {
  if (pageKey === "home") return ["/", "/careers", "/about"];
  if (pageKey === "about") return ["/about"];
  if (pageKey === "careers") return ["/careers", "/careers/jobs"];
  if (pageKey === "contact") return ["/contact"];
  return ["/", `/${pageKey}`];
}

const serviceInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().max(80).optional(),
  short: z.string().trim().max(800).default(""),
  image: z.string().trim().max(500).default(""),
  imageAlt: z.string().trim().max(200).default(""),
  icon: z.string().trim().max(40).default("home"),
  badge: z.string().trim().max(80).optional(),
  body: z.array(z.string().max(5000)).max(12).default([]),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(CMS_STATUSES).default("draft"),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(400).optional(),
});

const areaInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().max(80).optional(),
  region: z.string().trim().max(120).default(""),
  intro: z.string().trim().max(2000).default(""),
  surrounding: z.string().trim().max(500).default(""),
  image: z.string().trim().max(500).default(""),
  imageAlt: z.string().trim().max(200).default(""),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(CMS_STATUSES).default("draft"),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(400).optional(),
});

const sectionInput = z.object({
  pageKey: z.string().trim().min(1).max(60),
  sectionKey: z.string().trim().min(1).max(60),
  label: z.string().trim().max(120).default(""),
  content: z.record(z.string(), z.unknown()).default({}),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(CMS_STATUSES).default("published"),
});

const NAV_MENUS = ["header", "footer_company", "footer_legal", "mobile_cta"] as const;
const MEDIA_KINDS = ["image", "video", "document", "other"] as const;

const branchInput = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(400).default(""),
  city: z.string().trim().max(120).default(""),
  postcode: z.string().trim().max(40).default(""),
  phone: z.string().trim().max(40).default(""),
  phoneDisplay: z.string().trim().max(40).default(""),
  email: z.string().trim().max(200).default(""),
  hours: z.string().trim().max(200).default(""),
  mapsUrl: z.string().trim().max(1000).default(""),
  image: z.string().trim().max(500).default(""),
  imageAlt: z.string().trim().max(200).default(""),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(CMS_STATUSES).default("published"),
});

const navInput = z.object({
  menu: z.enum(NAV_MENUS),
  label: z.string().trim().min(1).max(80),
  href: z.string().trim().min(1).max(500),
  dropdown: z.enum(["", "services", "areas"]).default(""),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  visible: z.boolean().default(true),
});

const certInput = z.object({
  code: z.string().trim().min(1).max(80),
  label: z.string().trim().max(160).default(""),
  image: z.string().trim().max(500).default(""),
  imageAlt: z.string().trim().max(200).default(""),
  url: z.string().trim().max(1000).default(""),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(CMS_STATUSES).default("published"),
});

/* ── Router ────────────────────────────────────────────────────────────────── */

export const websiteRouter = createRouter({
  /* Overview */
  dashboard: websiteProcedure.query(() => guard(async () => {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [
      enquiryNew, enquiryRead, enquiryReplied, enquiryTotal,
      reviewPending, reviewApproved, reviewRejected,
      subActive, subUnsub,
      appNew, appReviewing, appShortlisted, appRejected, appTotal,
      postDraft, postPublished, newsletterDrafts,
      weekEnq, weekRev, weekApp, weekSub,
      recentEnquiries, recentApplications, recentReviews,
    ] = await Promise.all([
      websiteCount("website_enquiries", { eq: { status: "new" } }),
      websiteCount("website_enquiries", { eq: { status: "read" } }),
      websiteCount("website_enquiries", { eq: { status: "replied" } }),
      websiteCount("website_enquiries"),
      websiteCount("website_reviews", { eq: { status: "pending" } }),
      websiteCount("website_reviews", { eq: { status: "approved" } }),
      websiteCount("website_reviews", { eq: { status: "rejected" } }),
      websiteCount("website_subscribers", { eq: { status: "active" } }),
      websiteCount("website_subscribers", { eq: { status: "unsubscribed" } }),
      websiteCount("website_applications", { eq: { status: "new" } }),
      websiteCount("website_applications", { eq: { status: "reviewing" } }),
      websiteCount("website_applications", { eq: { status: "shortlisted" } }),
      websiteCount("website_applications", { eq: { status: "rejected" } }),
      websiteCount("website_applications"),
      websiteCount("website_posts", { eq: { status: "draft" } }),
      websiteCount("website_posts", { eq: { status: "published" } }),
      websiteCount("website_newsletters", { eq: { status: "draft" } }),
      websiteCount("website_enquiries", { gt: { created_at: weekAgo } }),
      websiteCount("website_reviews", { gt: { created_at: weekAgo } }),
      websiteCount("website_applications", { gt: { created_at: weekAgo } }),
      websiteCount("website_subscribers", { gt: { created_at: weekAgo } }),
      websiteSelect<EnquiryRow>("website_enquiries", { order: { column: "created_at" }, limit: 5 }),
      websiteSelect<ApplicationRow>("website_applications", { order: { column: "created_at" }, limit: 5 }),
      websiteSelect<ReviewRow>("website_reviews", { order: { column: "created_at" }, limit: 5 }),
    ]);
    const mail = mailProvider();
    return {
      enquiryCounts: { new: enquiryNew, read: enquiryRead, replied: enquiryReplied, total: enquiryTotal },
      reviewCounts: { pending: reviewPending, approved: reviewApproved, rejected: reviewRejected },
      subscriberCounts: { active: subActive, unsubscribed: subUnsub },
      applicationCounts: { new: appNew, reviewing: appReviewing, shortlisted: appShortlisted, rejected: appRejected, total: appTotal },
      postCounts: { draft: postDraft, published: postPublished },
      newsletterDrafts,
      lastSevenDays: { enquiries: weekEnq, reviews: weekRev, applications: weekApp, subscribers: weekSub },
      recentEnquiries: recentEnquiries.map(mapEnquiry),
      recentApplications: recentApplications.map(mapApplication),
      recentReviews: recentReviews.map(mapReview),
      ops: {
        mailProvider: mail.provider,
        mailFrom: mail.from,
        websiteUrlConfigured: Boolean((process.env.WEBSITE_URL ?? "").trim()),
        revalidateSecretConfigured: Boolean((process.env.WEBSITE_REVALIDATE_SECRET ?? "").trim()),
        unsubscribeSecretConfigured: Boolean((process.env.WEBSITE_UNSUBSCRIBE_SECRET ?? "").trim()),
      },
    };
  })),

  /* Enquiries */
  enquiries: createRouter({
    list: websiteProcedure.input(listInput).query(({ input }) => guard(() => listTable<EnquiryRow, ReturnType<typeof mapEnquiry>>({
      table: "website_enquiries", statuses: ENQUIRY_STATUSES, input, map: mapEnquiry,
      searchColumns: ["full_name", "email", "message", "phone"],
    }))),

    patch: websiteProcedure
      .input(z.object({ id: uuid, status: z.enum(ENQUIRY_STATUSES) }))
      .mutation(({ ctx, input }) => guard(async () => {
        const rows = await websiteUpdate<EnquiryRow>("website_enquiries", { eq: { id: input.id } }, { status: input.status });
        if (!rows[0]) notFound("Enquiry");
        await writeWebsiteAudit({
          action: `enquiry.${input.status}`, entityType: "enquiry", entityId: input.id,
          actorName: ctx.staffCtx.staff.fullName, details: { name: rows[0].full_name },
        });
        return mapEnquiry(rows[0]);
      })),

    delete: websiteProcedure.input(z.object({ id: uuid })).mutation(({ ctx, input }) => guard(async () => {
      const row = await websiteSelectOne<EnquiryRow>("website_enquiries", { eq: { id: input.id } });
      if (!row) notFound("Enquiry");
      await websiteDelete("website_enquiries", { eq: { id: input.id } });
      await writeWebsiteAudit({
        action: "enquiry.deleted", entityType: "enquiry", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { name: row.full_name, email: row.email },
      });
      return { ok: true as const };
    })),

    /** Emails the enquirer through the portal mailer and marks the enquiry replied. */
    reply: websiteProcedure
      .input(z.object({
        id: uuid,
        subject: z.string().trim().min(1, "Subject is required").max(200),
        message: z.string().trim().min(1, "Message is required").max(10000),
      }))
      .mutation(({ ctx, input }) => guard(async () => {
        const enquiry = await websiteSelectOne<EnquiryRow>("website_enquiries", { eq: { id: input.id } });
        if (!enquiry) notFound("Enquiry");
        const body =
          `Dear ${enquiry.full_name},\n\n${input.message}\n\nKind regards,\nThe Unique Care UK team\n\n` +
          `— Your original message —\n${enquiry.message}`;
        const sent = await sendEmail({
          to: enquiry.email, subject: input.subject, body,
          kind: "website_enquiry_reply", relatedType: "website_enquiry",
        });
        if (!sent.delivered) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: `The email could not be sent${sent.error ? ` (${sent.error})` : ""}. It has been queued in the email outbox (Settings) and the enquiry was not marked replied.`,
          });
        }
        const rows = await websiteUpdate<EnquiryRow>("website_enquiries", { eq: { id: input.id } }, { status: "replied" });
        await writeWebsiteAudit({
          action: "enquiry.replied", entityType: "enquiry", entityId: input.id,
          actorName: ctx.staffCtx.staff.fullName, details: { to: enquiry.email, subject: input.subject },
        });
        return { ok: true as const, enquiry: mapEnquiry(rows[0] ?? { ...enquiry, status: "replied" }) };
      })),

    exportCsv: websiteProcedure.input(exportInput).query(({ input }) => guard(async () => {
      const rows = await exportTable<EnquiryRow>({
        table: "website_enquiries", statuses: ENQUIRY_STATUSES, input, searchColumns: ["full_name", "email", "message", "phone"],
      });
      return csvResult("website-enquiries", [
        ["ID", "Name", "Email", "Phone", "Enquiry type", "Care type", "Message", "Source page", "Status", "Received"],
        ...rows.map((e) => [e.id, e.full_name, e.email, e.phone, e.enquiry_type, e.care_type, e.message, e.source_page, e.status, e.created_at]),
      ]);
    })),
  }),

  /* Reviews */
  reviews: createRouter({
    list: websiteProcedure.input(listInput).query(({ input }) => guard(() => listTable<ReviewRow, ReturnType<typeof mapReview>>({
      table: "website_reviews", statuses: REVIEW_STATUSES, input, map: mapReview,
      searchColumns: ["name", "title", "body", "relationship"],
    }))),

    patch: websiteProcedure
      .input(z.object({ id: uuid, status: z.enum(REVIEW_STATUSES) }))
      .mutation(({ ctx, input }) => guard(async () => {
        const now = new Date().toISOString();
        const patch =
          input.status === "approved" ? { status: input.status, reviewed_at: now, approved_at: now }
          : input.status === "rejected" ? { status: input.status, reviewed_at: now, approved_at: null }
          : { status: input.status, reviewed_at: null, approved_at: null };
        const rows = await websiteUpdate<ReviewRow>("website_reviews", { eq: { id: input.id } }, patch);
        if (!rows[0]) notFound("Review");
        await writeWebsiteAudit({
          action: input.status === "approved" ? "review.approved" : input.status === "rejected" ? "review.rejected" : "review.reopened",
          entityType: "review", entityId: input.id, actorName: ctx.staffCtx.staff.fullName,
          details: { name: rows[0].name, title: rows[0].title },
        });
        bumpWebsiteJobsCache(["/reviews", "/"]);
        return mapReview(rows[0]);
      })),

    delete: websiteProcedure.input(z.object({ id: uuid })).mutation(({ ctx, input }) => guard(async () => {
      const row = await websiteSelectOne<ReviewRow>("website_reviews", { eq: { id: input.id } });
      if (!row) notFound("Review");
      await websiteDelete("website_reviews", { eq: { id: input.id } });
      await writeWebsiteAudit({
        action: "review.deleted", entityType: "review", entityId: input.id, actorName: ctx.staffCtx.staff.fullName,
        details: { name: row.name, title: row.title, wasStatus: row.status },
      });
      bumpWebsiteJobsCache(["/reviews", "/"]);
      return { ok: true as const };
    })),

    exportCsv: websiteProcedure.input(exportInput).query(({ input }) => guard(async () => {
      const rows = await exportTable<ReviewRow>({
        table: "website_reviews", statuses: REVIEW_STATUSES, input, searchColumns: ["name", "title", "body", "relationship"],
      });
      return csvResult("website-reviews", [
        ["ID", "Name", "Relationship", "Rating", "Title", "Review", "Status", "Submitted", "Reviewed"],
        ...rows.map((r) => [r.id, r.name, r.relationship, r.rating, r.title, r.body, r.status, r.created_at, r.reviewed_at]),
      ]);
    })),
  }),

  /* Applications (website form submissions; portal Apply flow is separate) */
  applications: createRouter({
    list: websiteProcedure.input(listInput).query(({ input }) => guard(() => listTable<ApplicationRow, ReturnType<typeof mapApplication>>({
      table: "website_applications", statuses: APPLICATION_STATUSES, input, map: mapApplication,
      searchColumns: ["name", "email", "job_slug", "phone"],
    }))),

    patch: websiteProcedure
      .input(z.object({ id: intId, status: z.enum(APPLICATION_STATUSES) }))
      .mutation(({ ctx, input }) => guard(async () => {
        const rows = await websiteUpdate<ApplicationRow>("website_applications", { eq: { id: input.id } }, { status: input.status });
        if (!rows[0]) notFound("Application");
        await writeWebsiteAudit({
          action: `application.${input.status}`, entityType: "application", entityId: input.id,
          actorName: ctx.staffCtx.staff.fullName, details: { name: rows[0].name, job: rows[0].job_slug },
        });
        return mapApplication(rows[0]);
      })),

    delete: websiteProcedure.input(z.object({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const row = await websiteSelectOne<ApplicationRow>("website_applications", { eq: { id: input.id } });
      if (!row) notFound("Application");
      await websiteDelete("website_applications", { eq: { id: input.id } });
      await writeWebsiteAudit({
        action: "application.deleted", entityType: "application", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { name: row.name, job: row.job_slug },
      });
      return { ok: true as const };
    })),

    exportCsv: websiteProcedure.input(exportInput).query(({ input }) => guard(async () => {
      const rows = await exportTable<ApplicationRow>({
        table: "website_applications", statuses: APPLICATION_STATUSES, input, searchColumns: ["name", "email", "job_slug", "phone"],
      });
      return csvResult("website-applications", [
        ["ID", "Name", "Email", "Phone", "Job", "Right to work", "Driving licence", "Cover letter", "Status", "Received"],
        ...rows.map((a) => [
          a.id, a.name, a.email, a.phone, humaniseSlug(a.job_slug), a.right_to_work ? "Yes" : "No",
          a.driving_licence ? "Yes" : "No", a.cover_letter, a.status, a.created_at,
        ]),
      ]);
    })),
  }),

  /* Subscribers */
  subscribers: createRouter({
    list: websiteProcedure.input(listInput).query(({ input }) => guard(() => listTable<SubscriberRow, ReturnType<typeof mapSubscriber>>({
      table: "website_subscribers", statuses: SUBSCRIBER_STATUSES, input, map: mapSubscriber, searchColumns: ["email"],
    }))),

    patch: websiteProcedure
      .input(z.object({ id: intId, status: z.enum(SUBSCRIBER_STATUSES) }))
      .mutation(({ ctx, input }) => guard(async () => {
        const rows = await websiteUpdate<SubscriberRow>("website_subscribers", { eq: { id: input.id } }, { status: input.status });
        if (!rows[0]) notFound("Subscriber");
        await writeWebsiteAudit({
          action: `subscriber.${input.status}`, entityType: "subscriber", entityId: input.id,
          actorName: ctx.staffCtx.staff.fullName, details: { email: rows[0].email },
        });
        return mapSubscriber(rows[0]);
      })),

    delete: websiteProcedure.input(z.object({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const row = await websiteSelectOne<SubscriberRow>("website_subscribers", { eq: { id: input.id } });
      if (!row) notFound("Subscriber");
      await websiteDelete("website_subscribers", { eq: { id: input.id } });
      await writeWebsiteAudit({
        action: "subscriber.deleted", entityType: "subscriber", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { email: row.email },
      });
      return { ok: true as const };
    })),

    exportCsv: websiteProcedure.input(exportInput).query(({ input }) => guard(async () => {
      const rows = await exportTable<SubscriberRow>({
        table: "website_subscribers", statuses: SUBSCRIBER_STATUSES, input, searchColumns: ["email"],
      });
      return csvResult("website-subscribers", [
        ["ID", "Email", "Status", "Subscribed"],
        ...rows.map((s) => [s.id, s.email, s.status, s.created_at]),
      ]);
    })),
  }),

  /* Newsletters */
  newsletters: createRouter({
    list: websiteProcedure.input(listInput).query(({ input }) => guard(() => listTable<NewsletterRow, ReturnType<typeof mapNewsletter>>({
      table: "website_newsletters", statuses: NEWSLETTER_STATUSES, input, map: mapNewsletter, searchColumns: ["subject"],
    }))),

    create: websiteProcedure.input(newsletterInput).mutation(({ ctx, input }) => guard(async () => {
      const [row] = await websiteInsert<NewsletterRow>("website_newsletters", {
        subject: input.subject, content: input.content, status: "draft",
      });
      await writeWebsiteAudit({
        action: "newsletter.created", entityType: "newsletter", entityId: row?.id,
        actorName: ctx.staffCtx.staff.fullName, details: { subject: input.subject },
      });
      return mapNewsletter(row);
    })),

    /** Drafts only. */
    update: websiteProcedure
      .input(newsletterInput.extend({ id: intId }))
      .mutation(({ ctx, input }) => guard(async () => {
        const rows = await websiteUpdate<NewsletterRow>(
          "website_newsletters", { eq: { id: input.id, status: "draft" } },
          { subject: input.subject, content: input.content },
        );
        if (!rows[0]) {
          const exists = await websiteSelectOne<NewsletterRow>("website_newsletters", { eq: { id: input.id } });
          throw new TRPCError({
            code: exists ? "CONFLICT" : "NOT_FOUND",
            message: exists ? "Sent newsletters cannot be edited." : "Newsletter not found",
          });
        }
        await writeWebsiteAudit({
          action: "newsletter.updated", entityType: "newsletter", entityId: input.id,
          actorName: ctx.staffCtx.staff.fullName, details: { subject: input.subject },
        });
        return mapNewsletter(rows[0]);
      })),

    /** Emails every active subscriber through the portal mailer. */
    send: websiteProcedure.input(z.object({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const draft = await websiteSelectOne<NewsletterRow>("website_newsletters", { eq: { id: input.id, status: "draft" } });
      if (!draft) throw new TRPCError({ code: "CONFLICT", message: "Newsletter not found or already sent." });

      const subscribers = await websiteSelect<{ id: number; email: string }>("website_subscribers", {
        columns: "id,email", eq: { status: "active" }, order: { column: "id", ascending: true }, limit: 10000,
      });
      if (subscribers.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "There are no active subscribers to send to." });
      }

      // Soft lock: mark sent immediately so a double-click cannot start a second blast.
      // If nothing delivers, we roll back to draft below.
      const claimed = await websiteUpdate<NewsletterRow>(
        "website_newsletters", { eq: { id: input.id, status: "draft" } },
        { status: "sent", sent_at: new Date().toISOString(), recipients_count: 0 },
      );
      const nl = claimed[0];
      if (!nl) throw new TRPCError({ code: "CONFLICT", message: "Newsletter not found or already sent." });

      let delivered = 0;
      let failed = 0;
      const failedEmails: string[] = [];
      const CONCURRENCY = 5;
      for (let i = 0; i < subscribers.length; i += CONCURRENCY) {
        const batch = subscribers.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(async (s) => {
          try {
            const r = await sendEmail({
              to: s.email,
              subject: nl.subject,
              body: `${nl.content}\n\nUnsubscribe: ${unsubscribeUrl(s.email)}`,
              html: newsletterEmailHtml({ subject: nl.subject, content: nl.content, email: s.email }),
              kind: "website_newsletter",
              relatedType: "website_newsletter",
              relatedId: nl.id,
              // Per-recipient unsubscribe tokens must not be stored for blind resend.
              privateLink: true,
            });
            return { email: s.email, ok: r.delivered };
          } catch {
            return { email: s.email, ok: false };
          }
        }));
        for (const r of results) {
          if (r.ok) delivered++;
          else { failed++; failedEmails.push(r.email); }
        }
      }

      if (delivered === 0) {
        await websiteUpdate("website_newsletters", { eq: { id: input.id } }, {
          status: "draft", sent_at: null, recipients_count: null,
        });
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "No emails could be sent. Check SMTP settings under System → Settings (SMTP_HOST, SMTP_USER, SMTP_PASSWORD), then try again.",
        });
      }
      const rows = await websiteUpdate<NewsletterRow>("website_newsletters", { eq: { id: input.id } }, {
        recipients_count: delivered,
      });
      await writeWebsiteAudit({
        action: "newsletter.sent", entityType: "newsletter", entityId: input.id, actorName: ctx.staffCtx.staff.fullName,
        details: {
          subject: nl.subject, delivered, failed, subscribers: subscribers.length,
          failedEmails: failedEmails.slice(0, 50),
        },
      });
      return { ok: true as const, delivered, failed, newsletter: mapNewsletter(rows[0] ?? nl) };
    })),

    delete: websiteProcedure.input(z.object({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const row = await websiteSelectOne<NewsletterRow>("website_newsletters", { eq: { id: input.id } });
      if (!row) notFound("Newsletter");
      await websiteDelete("website_newsletters", { eq: { id: input.id } });
      await writeWebsiteAudit({
        action: "newsletter.deleted", entityType: "newsletter", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { subject: row.subject, wasStatus: row.status },
      });
      return { ok: true as const };
    })),
  }),

  /* Blog posts */
  posts: createRouter({
    list: websiteProcedure.input(listInput).query(({ input }) => guard(async () => {
      const res = await listTable<PostRow, ReturnType<typeof mapPost>>({
        table: "website_posts", statuses: POST_STATUSES, input, map: mapPost, searchColumns: ["title", "slug", "excerpt"],
      });
      return res;
    })),

    create: websiteProcedure.input(postInput).mutation(({ ctx, input }) => guard(async () => {
      const slug = await uniqueSlug(slugify(input.slug || input.title));
      const [row] = await websiteInsert<PostRow>("website_posts", {
        title: input.title, slug, category: input.category, image_url: input.imageUrl || null,
        excerpt: input.excerpt, content: input.content, status: input.status,
      });
      await writeWebsiteAudit({
        action: "post.created", entityType: "post", entityId: row?.id,
        actorName: ctx.staffCtx.staff.fullName, details: { title: input.title, status: input.status },
      });
      bumpWebsiteJobsCache(["/blog", `/blog/${slug}`]);
      return mapPost(row);
    })),

    update: websiteProcedure.input(postInput.extend({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const before = await websiteSelectOne<PostRow>("website_posts", { eq: { id: input.id } });
      if (!before) notFound("Post");
      const slug = await uniqueSlug(slugify(input.slug || input.title), input.id);
      const rows = await websiteUpdate<PostRow>("website_posts", { eq: { id: input.id } }, {
        title: input.title, slug, category: input.category, image_url: input.imageUrl || null,
        excerpt: input.excerpt, content: input.content, status: input.status, updated_at: new Date().toISOString(),
      });
      if (!rows[0]) notFound("Post");
      await writeWebsiteAudit({
        action: before.status !== input.status ? `post.${input.status}` : "post.updated", entityType: "post", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { title: input.title },
      });
      bumpWebsiteJobsCache(["/blog", `/blog/${slug}`, `/blog/${before.slug}`]);
      return mapPost(rows[0]);
    })),

    delete: websiteProcedure.input(z.object({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const row = await websiteSelectOne<PostRow>("website_posts", { eq: { id: input.id } });
      if (!row) notFound("Post");
      await websiteDelete("website_posts", { eq: { id: input.id } });
      await writeWebsiteAudit({
        action: "post.deleted", entityType: "post", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { title: row.title },
      });
      bumpWebsiteJobsCache(["/blog", `/blog/${row.slug}`]);
      return { ok: true as const };
    })),
  }),

  /* Audit log */
  audit: createRouter({
    list: websiteProcedure
      .input(z.object({
        entityType: z.string().max(40).optional(),
        q: z.string().max(100).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }).optional())
      .query(({ input }) => guard(async () => {
        const limit = input?.limit ?? 50;
        const offset = input?.offset ?? 0;
        const filter: WebsiteFilter = {};
        if (input?.entityType && input.entityType !== "all") filter.eq = { entity_type: input.entityType };
        const q = input?.q?.trim();
        if (q) filter.search = { columns: ["action", "details", "entity_id"], q };
        const [rows, total] = await Promise.all([
          websiteSelect<AuditRow>("website_audit_log", { ...filter, order: { column: "created_at" }, limit, offset }),
          websiteCount("website_audit_log", filter),
        ]);
        return {
          items: rows.map((a) => ({
            id: a.id, action: a.action, label: humaniseAuditAction(a.action), entityType: a.entity_type,
            entityId: a.entity_id, details: a.details, createdAt: a.created_at,
          })),
          total, hasMore: offset + rows.length < total, limit, offset,
        };
      })),
  }),

  /* SEO (simple on-page scan of the live site) */
  seo: createRouter({
    scan: websiteProcedure.mutation(({ ctx }) => guard(async () => {
      const base = (process.env.SEO_SCAN_BASE_URL || websiteBaseUrl()).replace(/\/+$/, "");
      const posts = await websiteSelect<{ slug: string }>("website_posts", {
        columns: "slug", eq: { status: "published" }, order: { column: "created_at" }, limit: 50,
      });
      const paths = [...SEO_PATHS, ...posts.map((p) => `/blog/${p.slug}`)];
      const pages: Awaited<ReturnType<typeof scanPage>>[] = [];
      for (let i = 0; i < paths.length; i += 6) {
        pages.push(...(await Promise.all(paths.slice(i, i + 6).map((p) => scanPage(base, p)))));
      }
      await writeWebsiteAudit({
        action: "seo.scanned", entityType: "seo", actorName: ctx.staffCtx.staff.fullName, details: { pages: pages.length },
      });
      return {
        base, scannedAt: new Date().toISOString(), pages,
        avgScore: pages.length ? Math.round(pages.reduce((a, p) => a + p.score, 0) / pages.length) : 0,
      };
    })),
  }),

  /* Backlinks (off-page SEO) */
  backlinks: createRouter({
    list: websiteProcedure.input(listInput).query(({ input }) => guard(() => listTable<BacklinkRow, ReturnType<typeof mapBacklink>>({
      table: "website_backlinks", statuses: BACKLINK_STATUSES, input, map: mapBacklink, searchColumns: ["domain", "notes", "url"],
    }))),

    create: websiteProcedure.input(backlinkInput).mutation(({ ctx, input }) => guard(async () => {
      const domain = cleanDomain(input.domain);
      const [row] = await websiteInsert<BacklinkRow>("website_backlinks", {
        domain, url: input.url || null, notes: input.notes || null, status: input.status,
      });
      await writeWebsiteAudit({
        action: "backlink.created", entityType: "backlink", entityId: row?.id,
        actorName: ctx.staffCtx.staff.fullName, details: { domain },
      });
      return mapBacklink(row);
    })),

    update: websiteProcedure
      .input(backlinkInput.partial().extend({ id: intId }))
      .mutation(({ ctx, input }) => guard(async () => {
        const patch: Record<string, unknown> = {};
        if (input.domain !== undefined) patch.domain = cleanDomain(input.domain);
        if (input.url !== undefined) patch.url = input.url || null;
        if (input.notes !== undefined) patch.notes = input.notes || null;
        if (input.status !== undefined) patch.status = input.status;
        if (Object.keys(patch).length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to update" });
        const rows = await websiteUpdate<BacklinkRow>("website_backlinks", { eq: { id: input.id } }, patch);
        if (!rows[0]) notFound("Backlink");
        await writeWebsiteAudit({
          action: input.status ? `backlink.${input.status}` : "backlink.updated", entityType: "backlink", entityId: input.id,
          actorName: ctx.staffCtx.staff.fullName, details: { domain: rows[0].domain },
        });
        return mapBacklink(rows[0]);
      })),

    delete: websiteProcedure.input(z.object({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const row = await websiteSelectOne<BacklinkRow>("website_backlinks", { eq: { id: input.id } });
      if (!row) notFound("Backlink");
      await websiteDelete("website_backlinks", { eq: { id: input.id } });
      await writeWebsiteAudit({
        action: "backlink.deleted", entityType: "backlink", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { domain: row.domain },
      });
      return { ok: true as const };
    })),
  }),

  /* ── CMS: site settings, services, areas, page sections ─────────────────── */
  siteSettings: createRouter({
    get: websiteProcedure.query(() => guard(async () => {
      const row = await websiteSelectOne<SiteSettingsRow>("website_site_settings", { eq: { id: "default" } });
      return {
        id: "default" as const,
        payload: (row?.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>,
        updatedAt: row?.updated_at ?? null,
      };
    })),
    update: websiteProcedure.input(z.object({ payload: z.record(z.string(), z.unknown()) })).mutation(({ ctx, input }) => guard(async () => {
      const existing = await websiteSelectOne<SiteSettingsRow>("website_site_settings", { eq: { id: "default" } });
      const now = new Date().toISOString();
      if (existing) {
        await websiteUpdate<SiteSettingsRow>("website_site_settings", { eq: { id: "default" } }, {
          payload: input.payload as never, updated_at: now,
        });
      } else {
        await websiteInsert<SiteSettingsRow>("website_site_settings", {
          id: "default", payload: input.payload as never, updated_at: now,
        });
      }
      await writeWebsiteAudit({
        action: "cms.site_settings.updated", entityType: "site_settings", entityId: "default",
        actorName: ctx.staffCtx.staff.fullName,
      });
      bumpWebsiteJobsCache(["/", "/contact", "/about", "/careers", "/services", "/areas", "/blog", "/reviews"]);
      return { ok: true as const, updatedAt: now };
    })),
  }),

  services: createRouter({
    list: websiteProcedure.input(listInput).query(({ input }) => guard(async () => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;
      const filter = baseFilter(CMS_STATUSES, ["name", "slug", "short"], input, true);
      const countBase = baseFilter(CMS_STATUSES, ["name", "slug", "short"], input, false);
      const [rows, total, all, ...perStatus] = await Promise.all([
        websiteSelect<ServiceRow>("website_services", {
          ...filter, order: { column: "sort_order", ascending: true }, limit, offset,
        }),
        websiteCount("website_services", filter),
        websiteCount("website_services", countBase),
        ...CMS_STATUSES.map((s) => websiteCount("website_services", { ...countBase, eq: { status: s } })),
      ]);
      const counts: Record<string, number> = { all };
      CMS_STATUSES.forEach((s, i) => { counts[s] = perStatus[i] ?? 0; });
      return { items: rows.map(mapService), total, hasMore: offset + rows.length < total, counts, limit, offset };
    })),
    create: websiteProcedure.input(serviceInput).mutation(({ ctx, input }) => guard(async () => {
      const slug = await uniqueServiceSlug(slugify(input.slug || input.name));
      const [row] = await websiteInsert<ServiceRow>("website_services", {
        slug, name: input.name, short: input.short, image: input.image, image_alt: input.imageAlt,
        icon: input.icon, badge: input.badge || null, body: input.body as never,
        sort_order: input.sortOrder, status: input.status,
        seo_title: input.seoTitle || null, seo_description: input.seoDescription || null,
      });
      await writeWebsiteAudit({
        action: "cms.service.created", entityType: "service", entityId: row?.id,
        actorName: ctx.staffCtx.staff.fullName, details: { slug, status: input.status },
      });
      bumpWebsiteJobsCache(["/", "/services", `/services/${slug}`]);
      return mapService(row);
    })),
    update: websiteProcedure.input(serviceInput.extend({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const before = await websiteSelectOne<ServiceRow>("website_services", { eq: { id: input.id } });
      if (!before) notFound("Service");
      const slug = await uniqueServiceSlug(slugify(input.slug || input.name), input.id);
      const rows = await websiteUpdate<ServiceRow>("website_services", { eq: { id: input.id } }, {
        slug, name: input.name, short: input.short, image: input.image, image_alt: input.imageAlt,
        icon: input.icon, badge: input.badge || null, body: input.body as never,
        sort_order: input.sortOrder, status: input.status,
        seo_title: input.seoTitle || null, seo_description: input.seoDescription || null,
        updated_at: new Date().toISOString(),
      });
      if (!rows[0]) notFound("Service");
      await writeWebsiteAudit({
        action: "cms.service.updated", entityType: "service", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { slug },
      });
      bumpWebsiteJobsCache(["/", "/services", `/services/${slug}`, `/services/${before.slug}`]);
      return mapService(rows[0]);
    })),
    delete: websiteProcedure.input(z.object({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const row = await websiteSelectOne<ServiceRow>("website_services", { eq: { id: input.id } });
      if (!row) notFound("Service");
      await websiteDelete("website_services", { eq: { id: input.id } });
      await writeWebsiteAudit({
        action: "cms.service.deleted", entityType: "service", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { slug: row.slug },
      });
      bumpWebsiteJobsCache(["/", "/services", `/services/${row.slug}`]);
      return { ok: true as const };
    })),
  }),

  areasCms: createRouter({
    list: websiteProcedure.input(listInput).query(({ input }) => guard(async () => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;
      const filter = baseFilter(CMS_STATUSES, ["name", "slug", "region", "intro"], input, true);
      const countBase = baseFilter(CMS_STATUSES, ["name", "slug", "region", "intro"], input, false);
      const [rows, total, all, ...perStatus] = await Promise.all([
        websiteSelect<AreaRow>("website_areas", {
          ...filter, order: { column: "sort_order", ascending: true }, limit, offset,
        }),
        websiteCount("website_areas", filter),
        websiteCount("website_areas", countBase),
        ...CMS_STATUSES.map((s) => websiteCount("website_areas", { ...countBase, eq: { status: s } })),
      ]);
      const counts: Record<string, number> = { all };
      CMS_STATUSES.forEach((s, i) => { counts[s] = perStatus[i] ?? 0; });
      return { items: rows.map(mapArea), total, hasMore: offset + rows.length < total, counts, limit, offset };
    })),
    create: websiteProcedure.input(areaInput).mutation(({ ctx, input }) => guard(async () => {
      const slug = await uniqueAreaSlug(slugify(input.slug || input.name));
      const [row] = await websiteInsert<AreaRow>("website_areas", {
        slug, name: input.name, region: input.region, intro: input.intro, surrounding: input.surrounding,
        image: input.image, image_alt: input.imageAlt,
        sort_order: input.sortOrder, status: input.status,
        seo_title: input.seoTitle || null, seo_description: input.seoDescription || null,
      });
      await writeWebsiteAudit({
        action: "cms.area.created", entityType: "area", entityId: row?.id,
        actorName: ctx.staffCtx.staff.fullName, details: { slug },
      });
      bumpWebsiteJobsCache(["/", "/areas", `/areas/${slug}`]);
      return mapArea(row);
    })),
    update: websiteProcedure.input(areaInput.extend({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const before = await websiteSelectOne<AreaRow>("website_areas", { eq: { id: input.id } });
      if (!before) notFound("Area");
      const slug = await uniqueAreaSlug(slugify(input.slug || input.name), input.id);
      const rows = await websiteUpdate<AreaRow>("website_areas", { eq: { id: input.id } }, {
        slug, name: input.name, region: input.region, intro: input.intro, surrounding: input.surrounding,
        image: input.image, image_alt: input.imageAlt,
        sort_order: input.sortOrder, status: input.status,
        seo_title: input.seoTitle || null, seo_description: input.seoDescription || null,
        updated_at: new Date().toISOString(),
      });
      if (!rows[0]) notFound("Area");
      await writeWebsiteAudit({
        action: "cms.area.updated", entityType: "area", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { slug },
      });
      bumpWebsiteJobsCache(["/", "/areas", `/areas/${slug}`, `/areas/${before.slug}`]);
      return mapArea(rows[0]);
    })),
    delete: websiteProcedure.input(z.object({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const row = await websiteSelectOne<AreaRow>("website_areas", { eq: { id: input.id } });
      if (!row) notFound("Area");
      await websiteDelete("website_areas", { eq: { id: input.id } });
      await writeWebsiteAudit({
        action: "cms.area.deleted", entityType: "area", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { slug: row.slug },
      });
      bumpWebsiteJobsCache(["/", "/areas", `/areas/${row.slug}`]);
      return { ok: true as const };
    })),
  }),

  sections: createRouter({
    list: websiteProcedure
      .input(z.object({ pageKey: z.string().max(60).optional() }).optional())
      .query(({ input }) => guard(async () => {
        const filter: WebsiteFilter = {};
        if (input?.pageKey) filter.eq = { page_key: input.pageKey };
        const rows = await websiteSelect<SectionRow>("website_page_sections", {
          ...filter, order: { column: "sort_order", ascending: true }, limit: 200,
        });
        return { items: rows.map(mapSection) };
      })),
    upsert: websiteProcedure.input(sectionInput).mutation(({ ctx, input }) => guard(async () => {
      const existing = await websiteSelectOne<SectionRow>("website_page_sections", {
        eq: { page_key: input.pageKey, section_key: input.sectionKey },
      });
      const now = new Date().toISOString();
      let row: SectionRow | undefined;
      if (existing) {
        const rows = await websiteUpdate<SectionRow>("website_page_sections", { eq: { id: existing.id } }, {
          label: input.label, content: input.content as never, sort_order: input.sortOrder,
          status: input.status, updated_at: now,
        });
        row = rows[0];
      } else {
        const inserted = await websiteInsert<SectionRow>("website_page_sections", {
          page_key: input.pageKey, section_key: input.sectionKey, label: input.label,
          content: input.content as never, sort_order: input.sortOrder, status: input.status, updated_at: now,
        });
        row = inserted[0];
      }
      await writeWebsiteAudit({
        action: existing ? "cms.section.updated" : "cms.section.created",
        entityType: "page_section", entityId: row?.id,
        actorName: ctx.staffCtx.staff.fullName,
        details: { pageKey: input.pageKey, sectionKey: input.sectionKey },
      });
      const paths = sectionRevalidatePaths(input.pageKey);
      bumpWebsiteJobsCache(paths);
      return mapSection(row);
    })),
    delete: websiteProcedure.input(z.object({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const row = await websiteSelectOne<SectionRow>("website_page_sections", { eq: { id: input.id } });
      if (!row) notFound("Section");
      await websiteDelete("website_page_sections", { eq: { id: input.id } });
      await writeWebsiteAudit({
        action: "cms.section.deleted", entityType: "page_section", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName,
        details: { pageKey: row.page_key, sectionKey: row.section_key },
      });
      bumpWebsiteJobsCache(sectionRevalidatePaths(row.page_key));
      return { ok: true as const };
    })),
  }),

  /* ── Branches ───────────────────────────────────────────────────────────── */
  branches: createRouter({
    list: websiteProcedure.input(listInput).query(({ input }) => guard(async () => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;
      const filter = baseFilter(CMS_STATUSES, ["name", "city", "address", "postcode"], input, true);
      const countBase = baseFilter(CMS_STATUSES, ["name", "city", "address", "postcode"], input, false);
      const [rows, total, all, ...perStatus] = await Promise.all([
        websiteSelect<BranchRow>("website_branches", {
          ...filter, order: { column: "sort_order", ascending: true }, limit, offset,
        }),
        websiteCount("website_branches", filter),
        websiteCount("website_branches", countBase),
        ...CMS_STATUSES.map((s) => websiteCount("website_branches", { ...countBase, eq: { status: s } })),
      ]);
      const counts: Record<string, number> = { all };
      CMS_STATUSES.forEach((s, i) => { counts[s] = perStatus[i] ?? 0; });
      return { items: rows.map(mapBranch), total, hasMore: offset + rows.length < total, counts, limit, offset };
    })),
    create: websiteProcedure.input(branchInput).mutation(({ ctx, input }) => guard(async () => {
      const [row] = await websiteInsert<BranchRow>("website_branches", {
        name: input.name, address: input.address, city: input.city, postcode: input.postcode,
        phone: input.phone, phone_display: input.phoneDisplay, email: input.email, hours: input.hours,
        maps_url: input.mapsUrl, image: input.image, image_alt: input.imageAlt,
        sort_order: input.sortOrder, status: input.status,
      });
      await syncOfficesFromBranches();
      await writeWebsiteAudit({
        action: "cms.branch.created", entityType: "branch", entityId: row?.id,
        actorName: ctx.staffCtx.staff.fullName, details: { name: input.name },
      });
      bumpWebsiteJobsCache(["/", "/contact", "/about"]);
      return mapBranch(row);
    })),
    update: websiteProcedure.input(branchInput.extend({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const before = await websiteSelectOne<BranchRow>("website_branches", { eq: { id: input.id } });
      if (!before) notFound("Branch");
      const rows = await websiteUpdate<BranchRow>("website_branches", { eq: { id: input.id } }, {
        name: input.name, address: input.address, city: input.city, postcode: input.postcode,
        phone: input.phone, phone_display: input.phoneDisplay, email: input.email, hours: input.hours,
        maps_url: input.mapsUrl, image: input.image, image_alt: input.imageAlt,
        sort_order: input.sortOrder, status: input.status, updated_at: new Date().toISOString(),
      });
      if (!rows[0]) notFound("Branch");
      await syncOfficesFromBranches();
      await writeWebsiteAudit({
        action: "cms.branch.updated", entityType: "branch", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { name: input.name },
      });
      bumpWebsiteJobsCache(["/", "/contact", "/about"]);
      return mapBranch(rows[0]);
    })),
    delete: websiteProcedure.input(z.object({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const row = await websiteSelectOne<BranchRow>("website_branches", { eq: { id: input.id } });
      if (!row) notFound("Branch");
      await websiteDelete("website_branches", { eq: { id: input.id } });
      await syncOfficesFromBranches();
      await writeWebsiteAudit({
        action: "cms.branch.deleted", entityType: "branch", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { name: row.name },
      });
      bumpWebsiteJobsCache(["/", "/contact", "/about"]);
      return { ok: true as const };
    })),
  }),

  /* ── Media library ──────────────────────────────────────────────────────── */
  media: createRouter({
    list: websiteProcedure
      .input(z.object({
        folder: z.string().max(60).optional(),
        kind: z.enum(MEDIA_KINDS).optional(),
        q: z.string().max(100).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }).optional())
      .query(({ input }) => guard(async () => {
        const limit = input?.limit ?? 60;
        const offset = input?.offset ?? 0;
        const filter: WebsiteFilter = {};
        if (input?.folder) filter.eq = { ...(filter.eq ?? {}), folder: input.folder };
        if (input?.kind) filter.eq = { ...(filter.eq ?? {}), kind: input.kind };
        if (input?.q) filter.search = { columns: ["file_name", "alt", "url"], q: input.q };
        const [rows, total] = await Promise.all([
          websiteSelect<MediaRow>("website_media_assets", {
            ...filter, order: { column: "created_at", ascending: false }, limit, offset,
          }),
          websiteCount("website_media_assets", filter),
        ]);
        return { items: rows.map(mapMedia), total, hasMore: offset + rows.length < total, limit, offset };
      })),
    prepareUpload: websiteProcedure
      .input(z.object({
        fileName: z.string().trim().min(1).max(200),
        folder: z.string().trim().max(40).default("general"),
        mimeType: z.string().trim().max(120).optional(),
      }))
      .mutation(({ input }) => guard(async () => {
        const target = await websiteMediaUploadTarget(input.fileName, input.folder);
        const sniffed = sniffWebsiteMedia(input.fileName, input.mimeType);
        return { ...target, kind: sniffed.kind, mimeType: sniffed.mime };
      })),
    register: websiteProcedure
      .input(z.object({
        key: z.string().trim().min(1).max(500),
        fileName: z.string().trim().min(1).max(200),
        folder: z.string().trim().max(40).default("general"),
        alt: z.string().trim().max(300).default(""),
        mimeType: z.string().trim().max(120).optional(),
        bytes: z.number().int().min(0).optional(),
        width: z.number().int().min(0).optional(),
        height: z.number().int().min(0).optional(),
      }))
      .mutation(({ ctx, input }) => guard(async () => {
        const sniffed = sniffWebsiteMedia(input.fileName, input.mimeType);
        const url = publicMediaUrl(input.key);
        const [row] = await websiteInsert<MediaRow>("website_media_assets", {
          kind: sniffed.kind, url, storage_key: input.key, file_name: input.fileName,
          alt: input.alt, folder: input.folder, width: input.width ?? null, height: input.height ?? null,
          bytes: input.bytes ?? null, mime_type: sniffed.mime,
          created_by: ctx.staffCtx.staff.fullName,
        });
        await writeWebsiteAudit({
          action: "cms.media.uploaded", entityType: "media", entityId: row?.id,
          actorName: ctx.staffCtx.staff.fullName, details: { fileName: input.fileName, folder: input.folder },
        });
        return mapMedia(row);
      })),
    createExternal: websiteProcedure
      .input(z.object({
        url: z.string().trim().url().max(2000),
        fileName: z.string().trim().max(200).optional(),
        alt: z.string().trim().max(300).default(""),
        folder: z.string().trim().max(40).default("general"),
        kind: z.enum(MEDIA_KINDS).optional(),
      }))
      .mutation(({ ctx, input }) => guard(async () => {
        const name = input.fileName || input.url.split("/").pop() || "asset";
        const sniffed = sniffWebsiteMedia(name);
        const [row] = await websiteInsert<MediaRow>("website_media_assets", {
          kind: input.kind ?? sniffed.kind, url: input.url, storage_key: null, file_name: name,
          alt: input.alt, folder: input.folder, mime_type: sniffed.mime,
          created_by: ctx.staffCtx.staff.fullName,
        });
        await writeWebsiteAudit({
          action: "cms.media.linked", entityType: "media", entityId: row?.id,
          actorName: ctx.staffCtx.staff.fullName, details: { url: input.url },
        });
        return mapMedia(row);
      })),
    update: websiteProcedure
      .input(z.object({
        id: intId,
        alt: z.string().trim().max(300).optional(),
        folder: z.string().trim().max(40).optional(),
      }))
      .mutation(({ ctx, input }) => guard(async () => {
        const before = await websiteSelectOne<MediaRow>("website_media_assets", { eq: { id: input.id } });
        if (!before) notFound("Media");
        const patch: Record<string, unknown> = {};
        if (input.alt !== undefined) patch.alt = input.alt;
        if (input.folder !== undefined) patch.folder = input.folder;
        const rows = await websiteUpdate<MediaRow>("website_media_assets", { eq: { id: input.id } }, patch);
        if (!rows[0]) notFound("Media");
        await writeWebsiteAudit({
          action: "cms.media.updated", entityType: "media", entityId: input.id,
          actorName: ctx.staffCtx.staff.fullName,
        });
        return mapMedia(rows[0]);
      })),
    delete: websiteProcedure.input(z.object({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const row = await websiteSelectOne<MediaRow>("website_media_assets", { eq: { id: input.id } });
      if (!row) notFound("Media");
      if (row.storage_key) await removeWebsiteMedia(row.storage_key);
      await websiteDelete("website_media_assets", { eq: { id: input.id } });
      await writeWebsiteAudit({
        action: "cms.media.deleted", entityType: "media", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { fileName: row.file_name },
      });
      return { ok: true as const };
    })),
  }),

  /* ── Navigation ─────────────────────────────────────────────────────────── */
  nav: createRouter({
    list: websiteProcedure
      .input(z.object({ menu: z.enum(NAV_MENUS).optional() }).optional())
      .query(({ input }) => guard(async () => {
        const filter: WebsiteFilter = {};
        if (input?.menu) filter.eq = { menu: input.menu };
        const rows = await websiteSelect<NavRow>("website_nav_items", {
          ...filter, order: { column: "sort_order", ascending: true }, limit: 200,
        });
        return { items: rows.map(mapNav) };
      })),
    create: websiteProcedure.input(navInput).mutation(({ ctx, input }) => guard(async () => {
      const [row] = await websiteInsert<NavRow>("website_nav_items", {
        menu: input.menu, label: input.label, href: input.href, dropdown: input.dropdown,
        sort_order: input.sortOrder, visible: input.visible,
      });
      await writeWebsiteAudit({
        action: "cms.nav.created", entityType: "nav", entityId: row?.id,
        actorName: ctx.staffCtx.staff.fullName, details: { menu: input.menu, label: input.label },
      });
      bumpWebsiteJobsCache(["/", "/about", "/services", "/areas", "/careers", "/blog", "/reviews", "/contact"]);
      return mapNav(row);
    })),
    update: websiteProcedure.input(navInput.extend({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const before = await websiteSelectOne<NavRow>("website_nav_items", { eq: { id: input.id } });
      if (!before) notFound("Nav item");
      const rows = await websiteUpdate<NavRow>("website_nav_items", { eq: { id: input.id } }, {
        menu: input.menu, label: input.label, href: input.href, dropdown: input.dropdown,
        sort_order: input.sortOrder, visible: input.visible, updated_at: new Date().toISOString(),
      });
      if (!rows[0]) notFound("Nav item");
      await writeWebsiteAudit({
        action: "cms.nav.updated", entityType: "nav", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { label: input.label },
      });
      bumpWebsiteJobsCache(["/", "/about", "/services", "/areas", "/careers", "/blog", "/reviews", "/contact"]);
      return mapNav(rows[0]);
    })),
    delete: websiteProcedure.input(z.object({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const row = await websiteSelectOne<NavRow>("website_nav_items", { eq: { id: input.id } });
      if (!row) notFound("Nav item");
      await websiteDelete("website_nav_items", { eq: { id: input.id } });
      await writeWebsiteAudit({
        action: "cms.nav.deleted", entityType: "nav", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { label: row.label },
      });
      bumpWebsiteJobsCache(["/", "/about", "/services", "/areas", "/careers", "/blog", "/reviews", "/contact"]);
      return { ok: true as const };
    })),
  }),

  /* ── Certifications ─────────────────────────────────────────────────────── */
  certifications: createRouter({
    list: websiteProcedure.input(listInput).query(({ input }) => guard(async () => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;
      const filter = baseFilter(CMS_STATUSES, ["code", "label"], input, true);
      const countBase = baseFilter(CMS_STATUSES, ["code", "label"], input, false);
      const [rows, total, all, ...perStatus] = await Promise.all([
        websiteSelect<CertRow>("website_certifications", {
          ...filter, order: { column: "sort_order", ascending: true }, limit, offset,
        }),
        websiteCount("website_certifications", filter),
        websiteCount("website_certifications", countBase),
        ...CMS_STATUSES.map((s) => websiteCount("website_certifications", { ...countBase, eq: { status: s } })),
      ]);
      const counts: Record<string, number> = { all };
      CMS_STATUSES.forEach((s, i) => { counts[s] = perStatus[i] ?? 0; });
      return { items: rows.map(mapCert), total, hasMore: offset + rows.length < total, counts, limit, offset };
    })),
    create: websiteProcedure.input(certInput).mutation(({ ctx, input }) => guard(async () => {
      const [row] = await websiteInsert<CertRow>("website_certifications", {
        code: input.code, label: input.label, image: input.image, image_alt: input.imageAlt,
        url: input.url, sort_order: input.sortOrder, status: input.status,
      });
      await writeWebsiteAudit({
        action: "cms.cert.created", entityType: "certification", entityId: row?.id,
        actorName: ctx.staffCtx.staff.fullName, details: { code: input.code },
      });
      bumpWebsiteJobsCache(["/", "/about"]);
      return mapCert(row);
    })),
    update: websiteProcedure.input(certInput.extend({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const before = await websiteSelectOne<CertRow>("website_certifications", { eq: { id: input.id } });
      if (!before) notFound("Certification");
      const rows = await websiteUpdate<CertRow>("website_certifications", { eq: { id: input.id } }, {
        code: input.code, label: input.label, image: input.image, image_alt: input.imageAlt,
        url: input.url, sort_order: input.sortOrder, status: input.status,
        updated_at: new Date().toISOString(),
      });
      if (!rows[0]) notFound("Certification");
      await writeWebsiteAudit({
        action: "cms.cert.updated", entityType: "certification", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { code: input.code },
      });
      bumpWebsiteJobsCache(["/", "/about"]);
      return mapCert(rows[0]);
    })),
    delete: websiteProcedure.input(z.object({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const row = await websiteSelectOne<CertRow>("website_certifications", { eq: { id: input.id } });
      if (!row) notFound("Certification");
      await websiteDelete("website_certifications", { eq: { id: input.id } });
      await writeWebsiteAudit({
        action: "cms.cert.deleted", entityType: "certification", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { code: row.code },
      });
      bumpWebsiteJobsCache(["/", "/about"]);
      return { ok: true as const };
    })),
  }),

  /* ── AI Assistant (knowledge base, prompt, test console) ────────────────── */
  ai: createRouter({
    config: websiteProcedure.query(() => guard(async () => getWebsiteAiPublicConfig())),

    settingsGet: websiteProcedure.query(() => guard(async () => {
      try {
        const row = await websiteSelectOne<{
          id: string; enabled: boolean; welcome_message: string; system_prompt: string;
          updated_at: string; updated_by: string | null;
        }>("website_ai_settings", { eq: { id: "default" } });
        return {
          enabled: row?.enabled !== false,
          welcomeMessage: row?.welcome_message ?? "",
          systemPrompt: row?.system_prompt ?? "",
          updatedAt: row?.updated_at ?? null,
          updatedBy: row?.updated_by ?? null,
          migrationRequired: false as const,
        };
      } catch (e) {
        if (isMissingWebsiteTable(e, "website_ai_settings")) {
          return {
            enabled: false,
            welcomeMessage: "",
            systemPrompt: "",
            updatedAt: null,
            updatedBy: null,
            migrationRequired: true as const,
            migrationHint: WEBSITE_AI_MIGRATION_HINT,
          };
        }
        throw e;
      }
    })),

    settingsUpdate: websiteProcedure
      .input(z.object({
        enabled: z.boolean(),
        welcomeMessage: z.string().trim().min(1).max(1000),
        systemPrompt: z.string().trim().min(20).max(20000),
        note: z.string().trim().max(200).optional(),
      }))
      .mutation(({ ctx, input }) => guard(async () => {
        const now = new Date().toISOString();
        const actor = ctx.staffCtx.staff.fullName;
        try {
          const existing = await websiteSelectOne("website_ai_settings", { eq: { id: "default" } });
          const payload = {
            enabled: input.enabled,
            welcome_message: input.welcomeMessage,
            system_prompt: input.systemPrompt,
            updated_at: now,
            updated_by: actor,
          };
          if (existing) {
            await websiteUpdate("website_ai_settings", { eq: { id: "default" } }, payload);
          } else {
            await websiteInsert("website_ai_settings", { id: "default", ...payload });
          }
          await websiteInsert("website_ai_prompt_versions", {
            prompt: input.systemPrompt,
            note: input.note || "Prompt updated",
            created_by: actor,
          });
        } catch (e) {
          if (isMissingWebsiteTable(e)) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: WEBSITE_AI_MIGRATION_HINT });
          }
          throw e;
        }
        await writeWebsiteAudit({
          action: "cms.ai.settings_updated", entityType: "ai_settings", entityId: "default",
          actorName: actor, details: { enabled: input.enabled },
        });
        return { ok: true as const, updatedAt: now };
      })),

    promptVersions: websiteProcedure.query(() => guard(async () => {
      try {
        const rows = await websiteSelect<{
          id: number; prompt: string; note: string; created_at: string; created_by: string | null;
        }>("website_ai_prompt_versions", {
          order: { column: "created_at", ascending: false }, limit: 30,
        });
        return {
          items: rows.map((r) => ({
            id: r.id, prompt: r.prompt, note: r.note, createdAt: r.created_at, createdBy: r.created_by,
          })),
        };
      } catch (e) {
        if (isMissingWebsiteTable(e, "website_ai_prompt_versions")) return { items: [] };
        throw e;
      }
    })),

    restorePrompt: websiteProcedure.input(z.object({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const ver = await websiteSelectOne<{ id: number; prompt: string }>("website_ai_prompt_versions", {
        eq: { id: input.id },
      });
      if (!ver) notFound("Prompt version");
      const now = new Date().toISOString();
      const actor = ctx.staffCtx.staff.fullName;
      await websiteUpdate("website_ai_settings", { eq: { id: "default" } }, {
        system_prompt: ver.prompt, updated_at: now, updated_by: actor,
      });
      await websiteInsert("website_ai_prompt_versions", {
        prompt: ver.prompt, note: `Restored version #${ver.id}`, created_by: actor,
      });
      await writeWebsiteAudit({
        action: "cms.ai.prompt_restored", entityType: "ai_settings", entityId: "default",
        actorName: actor, details: { versionId: ver.id },
      });
      return { ok: true as const, systemPrompt: ver.prompt, updatedAt: now };
    })),

    documentsList: websiteProcedure
      .input(z.object({ q: z.string().max(100).optional() }).optional())
      .query(({ input }) => guard(async () => {
        try {
          const filter: WebsiteFilter = {};
          if (input?.q) filter.search = { columns: ["title", "file_name"], q: input.q };
          const rows = await websiteSelect<{
            id: number; title: string; file_name: string; storage_key: string; mime_type: string;
            bytes: number | null; status: string; error_message: string | null; chunk_count: number;
            created_at: string; updated_at: string; created_by: string | null;
          }>("website_ai_documents", {
            ...filter, order: { column: "created_at", ascending: false }, limit: 100,
          });
          return {
            migrationRequired: false as const,
            items: rows.map((r) => ({
              id: r.id, title: r.title, fileName: r.file_name, mimeType: r.mime_type, bytes: r.bytes,
              status: r.status, errorMessage: r.error_message, chunkCount: r.chunk_count,
              createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by,
            })),
          };
        } catch (e) {
          if (isMissingWebsiteTable(e, "website_ai_documents")) {
            return { migrationRequired: true as const, items: [], migrationHint: WEBSITE_AI_MIGRATION_HINT };
          }
          throw e;
        }
      })),

    documentsPrepareUpload: websiteProcedure
      .input(z.object({
        fileName: z.string().trim().min(1).max(200),
        mimeType: z.string().trim().max(120).optional(),
        title: z.string().trim().max(200).optional(),
      }))
      .mutation(({ input }) => guard(async () => {
        const target = await websiteKbUploadTarget(input.fileName);
        return { ...target, title: input.title || input.fileName.replace(/\.[^.]+$/, "") };
      })),

    documentsRegister: websiteProcedure
      .input(z.object({
        key: z.string().trim().min(1).max(500),
        fileName: z.string().trim().min(1).max(200),
        title: z.string().trim().min(1).max(200),
        mimeType: z.string().trim().max(120).default("application/octet-stream"),
        bytes: z.number().int().min(0).optional(),
      }))
      .mutation(({ ctx, input }) => guard(async () => {
        const [row] = await websiteInsert<{
          id: number; title: string; file_name: string; storage_key: string; mime_type: string;
          bytes: number | null; status: string; chunk_count: number; created_at: string; updated_at: string;
        }>("website_ai_documents", {
          title: input.title,
          file_name: input.fileName,
          storage_key: input.key,
          mime_type: input.mimeType,
          bytes: input.bytes ?? null,
          status: "pending",
          created_by: ctx.staffCtx.staff.fullName,
        });
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not register document." });
        try {
          await indexWebsiteKbDocument({
            id: row.id, storage_key: input.key, mime_type: input.mimeType, file_name: input.fileName,
          });
        } catch (e) {
          // Status already set to error inside indexer
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: e instanceof Error ? e.message : "Could not index this document.",
          });
        }
        await writeWebsiteAudit({
          action: "cms.ai.document_uploaded", entityType: "ai_document", entityId: row.id,
          actorName: ctx.staffCtx.staff.fullName, details: { fileName: input.fileName },
        });
        const fresh = await websiteSelectOne<{
          id: number; title: string; file_name: string; mime_type: string; bytes: number | null;
          status: string; error_message: string | null; chunk_count: number; created_at: string; updated_at: string;
          created_by: string | null;
        }>("website_ai_documents", { eq: { id: row.id } });
        return {
          id: fresh!.id, title: fresh!.title, fileName: fresh!.file_name, mimeType: fresh!.mime_type,
          bytes: fresh!.bytes, status: fresh!.status, errorMessage: fresh!.error_message,
          chunkCount: fresh!.chunk_count, createdAt: fresh!.created_at, updatedAt: fresh!.updated_at,
          createdBy: fresh!.created_by,
        };
      })),

    documentsReindex: websiteProcedure.input(z.object({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const row = await websiteSelectOne<{
        id: number; storage_key: string; mime_type: string; file_name: string;
      }>("website_ai_documents", { eq: { id: input.id } });
      if (!row) notFound("Document");
      await websiteUpdate("website_ai_documents", { eq: { id: input.id } }, {
        status: "pending", error_message: null, updated_at: new Date().toISOString(),
      });
      const result = await indexWebsiteKbDocument(row);
      await writeWebsiteAudit({
        action: "cms.ai.document_reindexed", entityType: "ai_document", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { chunkCount: result.chunkCount },
      });
      return { ok: true as const, chunkCount: result.chunkCount };
    })),

    documentsReindexAll: websiteProcedure.mutation(({ ctx }) => guard(async () => {
      const rows = await websiteSelect<{
        id: number; storage_key: string; mime_type: string; file_name: string; status: string;
      }>("website_ai_documents", { order: { column: "id", ascending: true }, limit: 200 });
      let ok = 0;
      let failed = 0;
      for (const row of rows) {
        if (row.status === "archived") continue;
        try {
          await indexWebsiteKbDocument(row);
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      await writeWebsiteAudit({
        action: "cms.ai.reindex_all", entityType: "ai_settings", entityId: "default",
        actorName: ctx.staffCtx.staff.fullName, details: { ok, failed },
      });
      return { ok: true as const, indexed: ok, failed };
    })),

    documentsPreviewUrl: websiteProcedure.input(z.object({ id: intId })).mutation(({ input }) => guard(async () => {
      const row = await websiteSelectOne<{ storage_key: string }>("website_ai_documents", { eq: { id: input.id } });
      if (!row) notFound("Document");
      const url = await signedWebsiteKbUrl(row.storage_key);
      return { url };
    })),

    documentsDelete: websiteProcedure.input(z.object({ id: intId })).mutation(({ ctx, input }) => guard(async () => {
      const row = await websiteSelectOne<{ id: number; storage_key: string; file_name: string }>(
        "website_ai_documents", { eq: { id: input.id } },
      );
      if (!row) notFound("Document");
      await websiteDelete("website_ai_chunks", { eq: { document_id: input.id } });
      await websiteDelete("website_ai_documents", { eq: { id: input.id } });
      await removeWebsiteKb(row.storage_key);
      await writeWebsiteAudit({
        action: "cms.ai.document_deleted", entityType: "ai_document", entityId: input.id,
        actorName: ctx.staffCtx.staff.fullName, details: { fileName: row.file_name },
      });
      return { ok: true as const };
    })),

    testChat: websiteProcedure
      .input(z.object({
        messages: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().trim().min(1).max(4000),
        })).min(1).max(20),
      }))
      .mutation(({ input }) => guard(async () => {
        try {
          return await answerWebsiteChat({ messages: input.messages, bypassEnabled: true });
        } catch (e) {
          if (e instanceof AiMisconfigured || e instanceof AiUnavailable) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message });
          }
          throw e;
        }
      })),
  }),
});
