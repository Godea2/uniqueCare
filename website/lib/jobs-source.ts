import { fallbackJobs, type FallbackJob } from "@/content/jobs-fallback";
import { adminPortalUrl } from "@/content/site";

/**
 * Read-only adapter to the existing application's jobs.
 * The application stores jobs in `job_postings`; a job is published when
 * status = 'live' (the same filter its own public careers endpoint uses).
 * Anonymous (public) key only — read-only, server-side, cached via ISR.
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
  /** External apply URL on the existing application, when available. */
  applyUrl: string | null;
  isFallback: boolean;
  listedInGrid: boolean;
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

function slugFrom(row: JobPostingRow): string {
  if (row.public_slug) return row.public_slug;
  const base = row.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base}-${row.id}`;
}

function mapRow(row: JobPostingRow): WebsiteJob {
  const applySlug = row.apply_link_enabled ? row.apply_slug ?? row.public_slug : null;
  return {
    slug: slugFrom(row),
    title: row.title,
    location: row.location,
    type: row.employment_type,
    statusLabel: "Always open",
    summary: summaryFromMarkdown(row.description_md),
    descriptionMd: row.description_md,
    requirements: requirementsToList(row.requirements),
    salary: row.salary_text,
    closesAt: row.closes_at,
    postedAt: row.created_at,
    applyUrl: applySlug && adminPortalUrl ? `${adminPortalUrl.replace(/\/$/, "")}/apply/${applySlug}` : null,
    isFallback: false,
    listedInGrid: true,
  };
}

async function fetchLiveJobs(): Promise<WebsiteJob[]> {
  const base = process.env.NEXT_PUBLIC_JOBS_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_JOBS_SUPABASE_ANON_KEY;
  if (!base || !key) return [];
  const url =
    `${base}/rest/v1/job_postings?status=eq.live` +
    `&select=id,title,location,salary_text,employment_type,description_md,requirements,status,closes_at,created_at,public_slug,apply_slug,apply_link_enabled` +
    `&order=created_at.desc`;
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`jobs source responded ${res.status}`);
  const rows = (await res.json()) as JobPostingRow[];
  return rows.map(mapRow);
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
 * Live published jobs. Falls back to the brief's six roles only when the
 * source is unreachable or returns nothing (per brief 0.3).
 */
export async function getJobs(): Promise<WebsiteJob[]> {
  try {
    const live = await fetchLiveJobs();
    if (live.length > 0) return live;
  } catch {
    // fall through to fallback content
  }
  return fallbackJobs.map(mapFallback);
}

/** Live jobs only — no fallback (used for sitemap & generateStaticParams). */
export async function getLiveJobsOnly(): Promise<WebsiteJob[]> {
  try {
    return await fetchLiveJobs();
  } catch {
    return [];
  }
}

export async function getJob(slug: string): Promise<WebsiteJob | undefined> {
  // The General Application page is always available (brief 0.3).
  if (slug === "general-application") {
    const ga = fallbackJobs.find((j) => j.slug === "general-application")!;
    return mapFallback(ga);
  }
  const jobs = await getJobs();
  return jobs.find((j) => j.slug === slug);
}

/** The fallback job definition, for structured sections on fallback pages. */
export function getFallbackDefinition(slug: string): FallbackJob | undefined {
  return fallbackJobs.find((j) => j.slug === slug);
}
