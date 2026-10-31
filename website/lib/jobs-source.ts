import { adminPortalUrl } from "@/content/site";

/**
 * Careers listings come only from UniqueCare Connect live job postings.
 * The marketing site calls the portal public API (service-role on the portal),
 * so it is not blocked by Supabase anon RLS on job_postings.
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
  /** Portal apply URL when the job has an open apply link. */
  applyUrl: string | null;
  listedInGrid: boolean;
};

type PortalJob = {
  id: number;
  title: string;
  location: string | null;
  salaryText: string | null;
  employmentType: string | null;
  descriptionMd: string | null;
  publicSlug: string;
  applySlug: string | null;
  applyLinkEnabled: boolean;
  closesAt: string | null;
  createdAt: string | null;
  requirements: string[];
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

function summaryFromMarkdown(md: string | null): string | null {
  if (!md) return null;
  const para = md
    .split("\n\n")
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith("#") && !s.startsWith("-") && !s.startsWith("*"));
  if (!para) return null;
  return para.replace(/\*\*/g, "").slice(0, 220);
}

function statusLabel(closesAt: string | null): string {
  if (!closesAt) return "Open";
  return `Closes ${closesAt}`;
}

function mapPortalJob(row: PortalJob): WebsiteJob {
  const slug = row.publicSlug || `job-${row.id}`;
  const applySlug = row.applyLinkEnabled ? (row.applySlug || row.publicSlug) : null;
  const portal = (adminPortalUrl || process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL || "").replace(/\/$/, "");
  return {
    slug,
    title: row.title,
    location: row.location,
    type: row.employmentType,
    statusLabel: statusLabel(row.closesAt),
    summary: summaryFromMarkdown(row.descriptionMd),
    descriptionMd: row.descriptionMd,
    requirements: Array.isArray(row.requirements) ? row.requirements.filter((x) => typeof x === "string") : [],
    salary: row.salaryText,
    closesAt: row.closesAt,
    postedAt: row.createdAt,
    applyUrl: applySlug && portal ? `${portal}/apply/${applySlug}` : null,
    listedInGrid: true,
  };
}

function portalBase(): string {
  return (
    process.env.JOBS_PORTAL_URL
    || process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL
    || adminPortalUrl
    || ""
  ).replace(/\/$/, "");
}

async function fetchLiveJobs(): Promise<WebsiteJob[]> {
  const base = portalBase();
  if (!base) {
    console.warn("[jobs] NEXT_PUBLIC_ADMIN_PORTAL_URL is not set — careers list will be empty");
    return [];
  }
  const res = await fetch(`${base}/api/public/jobs`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 60, tags: ["website-jobs"] },
  });
  if (!res.ok) {
    console.warn(`[jobs] portal /api/public/jobs responded ${res.status}`);
    return [];
  }
  const body = (await res.json()) as { jobs?: PortalJob[] };
  return (body.jobs ?? []).map(mapPortalJob);
}

/** Live published jobs from the portal — never falls back to dummy content. */
export async function getJobs(): Promise<WebsiteJob[]> {
  try {
    return await fetchLiveJobs();
  } catch (e) {
    console.warn("[jobs] fetch failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function getLiveJobsOnly(): Promise<WebsiteJob[]> {
  return getJobs();
}

export async function getJob(slug: string): Promise<WebsiteJob | undefined> {
  const jobs = await getJobs();
  return jobs.find((j) => j.slug === slug);
}
