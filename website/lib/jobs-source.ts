import { fallbackJobs, type FallbackJob } from "@/content/jobs-fallback";
import { adminPortalUrl } from "@/content/site";

/**
 * Live jobs for the marketing site come from the UniqueCare Connect portal
 * public API (`hr.publicJobs`) — the same list as /careers on the portal.
 * That avoids needing an anon SELECT policy on `job_postings` (RLS denies
 * direct Supabase reads). Optional Supabase REST remains as a secondary path.
 */

export type WebsiteJob = {
  slug: string;
  title: string;
  location: string | null;
  type: string | null;
  statusLabel: string;
  summary: string | null;
  descriptionMd: string | null;
  requirements: string[];
  salary: string | null;
  closesAt: string | null;
  postedAt: string | null;
  /** External apply URL on the portal application form. */
  applyUrl: string | null;
  isFallback: boolean;
  listedInGrid: boolean;
};

type PortalPublicJob = {
  id: number;
  title: string;
  location: string | null;
  salaryText: string | null;
  employmentType: string | null;
  descriptionMd: string | null;
  publicSlug: string | null;
  applySlug: string | null;
  applyLinkEnabled: boolean | null;
  closesAt: string | null;
};

type JobPostingRow = {
  id: number;
  title: string;
  location: string | null;
  salary_text: string | null;
  employment_type: string | null;
  description_md: string | null;
  requirements: unknown;
  status: string;
  closes_at: string | null;
  created_at: string | null;
  public_slug: string | null;
  apply_slug: string | null;
  apply_link_enabled: boolean | null;
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  nights: "Nights",
  bank: "Bank / Flexible",
  temporary: "Temporary",
  permanent: "Permanent",
};

export function employmentLabel(v: string | null): string {
  if (!v) return "Full-time";
  return EMPLOYMENT_LABELS[v] ?? v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function requirementsToList(req: unknown): string[] {
  if (Array.isArray(req)) return req.filter((x): x is string => typeof x === "string");
  if (req && typeof req === "object") {
    const vals = Object.values(req as Record<string, unknown>);
    return vals.filter((x): x is string => typeof x === "string");
  }
  return [];
}

/** First non-heading paragraph of the markdown, used as the card summary. */
function summaryFromMarkdown(md: string | null): string | null {
  if (!md) return null;
  const para = md
    .split("\n\n")
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith("#") && !s.startsWith("-") && !s.startsWith("*"));
  if (!para) return null;
  return para.replace(/\*\*/g, "").slice(0, 220);
}

function slugFrom(opts: { publicSlug: string | null; title: string; id: number }): string {
  if (opts.publicSlug) return opts.publicSlug;
  const base = opts.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base}-${opts.id}`;
}

function statusLabel(closesAt: string | null): string {
  if (!closesAt) return "Open";
  const today = new Date().toISOString().slice(0, 10);
  if (closesAt < today) return "Closed";
  return `Closes ${closesAt}`;
}

function formatSalary(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  if (/^£|\/\s*h|per\s*hour|annum|k\b/i.test(t)) return t;
  if (/^\d+(\.\d+)?$/.test(t)) return `£${t} per hour`;
  return t;
}

function portalBase(): string {
  return (adminPortalUrl || process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL || "").replace(/\/$/, "");
}

function mapPortalJob(j: PortalPublicJob): WebsiteJob {
  const slug = slugFrom({ publicSlug: j.publicSlug, title: j.title, id: j.id });
  const applySlug = j.applyLinkEnabled ? j.applySlug ?? j.publicSlug : null;
  const base = portalBase();
  return {
    slug,
    title: j.title.trim(),
    location: j.location,
    type: j.employmentType,
    statusLabel: statusLabel(j.closesAt),
    summary: summaryFromMarkdown(j.descriptionMd),
    descriptionMd: j.descriptionMd,
    requirements: [],
    salary: formatSalary(j.salaryText),
    closesAt: j.closesAt,
    postedAt: null,
    applyUrl: applySlug && base ? `${base}/apply/${applySlug}` : null,
    isFallback: false,
    listedInGrid: statusLabel(j.closesAt) !== "Closed",
  };
}

function mapRow(row: JobPostingRow): WebsiteJob {
  const applySlug = row.apply_link_enabled ? row.apply_slug ?? row.public_slug : null;
  const base = portalBase();
  return {
    slug: slugFrom({ publicSlug: row.public_slug, title: row.title, id: row.id }),
    title: row.title.trim(),
    location: row.location,
    type: row.employment_type,
    statusLabel: statusLabel(row.closes_at),
    summary: summaryFromMarkdown(row.description_md),
    descriptionMd: row.description_md,
    requirements: requirementsToList(row.requirements),
    salary: formatSalary(row.salary_text),
    closesAt: row.closes_at,
    postedAt: row.created_at,
    applyUrl: applySlug && base ? `${base}/apply/${applySlug}` : null,
    isFallback: false,
    listedInGrid: statusLabel(row.closes_at) !== "Closed",
  };
}

async function fetchFromPortal(): Promise<WebsiteJob[] | null> {
  const base = portalBase();
  if (!base) return null;
  const url = `${base}/api/trpc/hr.publicJobs`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 60, tags: ["jobs"] },
  });
  if (!res.ok) throw new Error(`portal publicJobs responded ${res.status}`);
  const body = (await res.json()) as { result?: { data?: { json?: PortalPublicJob[] } } };
  const rows = body.result?.data?.json;
  if (!Array.isArray(rows)) throw new Error("portal publicJobs: unexpected payload");
  return rows.map(mapPortalJob);
}

async function fetchFromSupabase(): Promise<WebsiteJob[] | null> {
  const base = process.env.NEXT_PUBLIC_JOBS_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_JOBS_SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  const url =
    `${base}/rest/v1/job_postings?status=eq.live` +
    `&select=id,title,location,salary_text,employment_type,description_md,requirements,status,closes_at,created_at,public_slug,apply_slug,apply_link_enabled` +
    `&order=created_at.desc`;
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    next: { revalidate: 60, tags: ["jobs"] },
  });
  if (!res.ok) throw new Error(`jobs supabase responded ${res.status}`);
  const rows = (await res.json()) as JobPostingRow[];
  return rows.map(mapRow);
}

async function fetchLiveJobs(): Promise<WebsiteJob[]> {
  try {
    const fromPortal = await fetchFromPortal();
    if (fromPortal) return fromPortal;
  } catch {
    // try Supabase secondary
  }
  try {
    const fromSb = await fetchFromSupabase();
    if (fromSb) return fromSb;
  } catch {
    // fall through
  }
  return [];
}

function mapFallback(j: FallbackJob): WebsiteJob {
  return {
    slug: j.slug,
    title: j.title,
    location: j.location,
    type: j.type,
    statusLabel: j.statusLabel,
    summary: j.summary,
    descriptionMd: null,
    requirements: j.requirements ?? [],
    salary: null,
    closesAt: null,
    postedAt: null,
    applyUrl: null,
    isFallback: true,
    listedInGrid: j.listedInGrid,
  };
}

/**
 * Live published jobs from the portal. Empty array if none / unreachable —
 * UI shows the empty state (no dummy catalogue).
 */
export async function getJobs(): Promise<WebsiteJob[]> {
  return fetchLiveJobs();
}

/** Live jobs only (sitemap & generateStaticParams). */
export async function getLiveJobsOnly(): Promise<WebsiteJob[]> {
  return fetchLiveJobs();
}

export async function getJob(slug: string): Promise<WebsiteJob | undefined> {
  // General application stays as a static marketing page (brief 0.3).
  if (slug === "general-application") {
    const ga = fallbackJobs.find((j) => j.slug === "general-application");
    return ga ? mapFallback(ga) : undefined;
  }
  const jobs = await getJobs();
  return jobs.find((j) => j.slug === slug);
}

/** Structured sections for the general-application (fallback) page only. */
export function getFallbackDefinition(slug: string): FallbackJob | undefined {
  return fallbackJobs.find((j) => j.slug === slug);
}
