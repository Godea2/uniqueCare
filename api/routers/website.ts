import { z } from "zod";
import { createHmac } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import { getStaff, type StaffCtx } from "../util";
import { sendEmail } from "../lib/mailer";
import { bumpWebsiteJobsCache } from "../lib/website-revalidate";
import { writeWebsiteAudit, humaniseAuditAction } from "../lib/website-audit";
import {
  WebsiteDbError,
  websiteCount,
  websiteDelete,
  websiteInsert,
  websiteSelect,
  websiteSelectOne,
  websiteUpdate,
  type WebsiteFilter,
  type WebsiteTable,
} from "../lib/website-db";
import type { StaffRole } from "@db/schema";

/* ── Row types (snake_case, as stored) ─────────────────────────────────────── */

type EnquiryRow = {
  id: string; full_name: string; email: string; phone: string | null; enquiry_type: string;
  care_type: string | null; message: string; status: string; created_at: string;
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

/* ── Constants ─────────────────────────────────────────────────────────────── */

export const ENQUIRY_STATUSES = ["new", "read", "replied"] as const;
export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export const APPLICATION_STATUSES = ["new", "reviewing", "shortlisted", "rejected"] as const;
export const SUBSCRIBER_STATUSES = ["active", "unsubscribed"] as const;
export const NEWSLETTER_STATUSES = ["draft", "sent"] as const;
export const POST_STATUSES = ["draft", "published", "archived"] as const;
export const POST_CATEGORIES = ["Care Advice", "Company News", "Health Tips", "Industry Updates"] as const;
export const BACKLINK_STATUSES = ["pending", "acquired"] as const;

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
  careType: e.care_type, message: e.message, status: e.status, createdAt: e.created_at,
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

/* ── Newsletter email ──────────────────────────────────────────────────────── */

/**
 * Must match the website's lib/newsletter.ts so unsubscribe links verify there.
 * Set WEBSITE_UNSUBSCRIBE_SECRET on BOTH apps (same value); the fallbacks mirror the
 * website's legacy chain.
 */
function unsubscribeSecret(): string {
  return (
    process.env.WEBSITE_UNSUBSCRIBE_SECRET
    || process.env.WEBSITE_ADMIN_SESSION_SECRET
    || process.env.REVIEW_MODERATION_SECRET
    || process.env.WEBSITE_REVALIDATE_SECRET
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
        ["ID", "Name", "Email", "Phone", "Enquiry type", "Care type", "Message", "Status", "Received"],
        ...rows.map((e) => [e.id, e.full_name, e.email, e.phone, e.enquiry_type, e.care_type, e.message, e.status, e.created_at]),
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
      const subscribers = await websiteSelect<{ id: number; email: string }>("website_subscribers", {
        columns: "id,email", eq: { status: "active" }, order: { column: "id", ascending: true }, limit: 10000,
      });
      if (subscribers.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "There are no active subscribers to send to." });
      }
      // Claim the draft atomically so a double-click cannot send twice.
      const claimed = await websiteUpdate<NewsletterRow>(
        "website_newsletters", { eq: { id: input.id, status: "draft" } },
        { status: "sent", sent_at: new Date().toISOString() },
      );
      const nl = claimed[0];
      if (!nl) throw new TRPCError({ code: "CONFLICT", message: "Newsletter not found or already sent." });

      let delivered = 0;
      let failed = 0;
      const CONCURRENCY = 5;
      for (let i = 0; i < subscribers.length; i += CONCURRENCY) {
        const batch = subscribers.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map((s) =>
          sendEmail({
            to: s.email,
            subject: nl.subject,
            body: `${nl.content}\n\nUnsubscribe: ${unsubscribeUrl(s.email)}`,
            html: newsletterEmailHtml({ subject: nl.subject, content: nl.content, email: s.email }),
            kind: "website_newsletter",
            relatedType: "website_newsletter",
            relatedId: nl.id,
            // Unsubscribe links are per-recipient; never leave them queued for a resend.
            privateLink: true,
          }).then((r) => r.delivered).catch(() => false)));
        for (const ok of results) { if (ok) delivered++; else failed++; }
      }

      if (delivered === 0) {
        await websiteUpdate("website_newsletters", { eq: { id: input.id } }, { status: "draft", sent_at: null });
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "No emails could be sent. Check the SMTP settings (SMTP_HOST, SMTP_USER, SMTP_PASSWORD).",
        });
      }
      const rows = await websiteUpdate<NewsletterRow>("website_newsletters", { eq: { id: input.id } }, { recipients_count: delivered });
      await writeWebsiteAudit({
        action: "newsletter.sent", entityType: "newsletter", entityId: input.id, actorName: ctx.staffCtx.staff.fullName,
        details: { subject: nl.subject, delivered, failed, subscribers: subscribers.length },
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
});
