import { site } from "@/content/site";
import { services } from "@/content/services";
import { areas } from "@/content/areas";
import { getAllPosts } from "@/lib/posts-source";

export type SeoIssue = { level: "error" | "warn"; message: string };

export type SeoPage = {
  path: string;
  url: string;
  group: string;
  httpStatus: number | null;
  title: string | null;
  titleLength: number;
  description: string | null;
  descriptionLength: number;
  canonical: string | null;
  robots: string | null;
  h1Count: number;
  og: { title: string | null; description: string | null; image: string | null };
  issues: SeoIssue[];
  score: number;
};

export function seoBaseUrl(): string {
  return (process.env.SEO_SCAN_BASE_URL || site.url).replace(/\/+$/, "");
}

const STATIC_PATHS: { path: string; group: string }[] = [
  { path: "/", group: "Core" },
  { path: "/about", group: "Core" },
  { path: "/services", group: "Core" },
  { path: "/areas", group: "Core" },
  { path: "/careers", group: "Careers" },
  { path: "/careers/jobs", group: "Careers" },
  { path: "/blog", group: "Blog" },
  { path: "/reviews", group: "Core" },
  { path: "/contact", group: "Core" },
  { path: "/privacy", group: "Legal" },
  { path: "/terms", group: "Legal" },
  { path: "/modern-slavery", group: "Legal" },
  { path: "/carbon-reduction-plan", group: "Legal" },
];

export async function listScanTargets(): Promise<{ path: string; group: string }[]> {
  const posts = await getAllPosts();
  return [
    ...STATIC_PATHS,
    ...services.map((s) => ({ path: `/services/${s.slug}`, group: "Services" })),
    ...areas.map((a) => ({ path: `/areas/${a.slug}`, group: "Areas" })),
    ...posts.map((p) => ({ path: `/blog/${p.slug}`, group: "Blog" })),
  ];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Reads the `content` attribute of the first <meta> whose name/property matches. */
function metaContent(html: string, attr: "name" | "property", key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const k = tag.match(new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, "i"));
    if (!k || k[1].toLowerCase() !== key) continue;
    const c = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (c) return decodeEntities(c[1] ?? c[2] ?? "");
  }
  return null;
}

function linkHref(html: string, rel: string): string | null {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const r = tag.match(/\brel\s*=\s*["']([^"']+)["']/i);
    if (!r || r[1].toLowerCase() !== rel) continue;
    const h = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (h) return decodeEntities(h[1]);
  }
  return null;
}

export function parseSeo(html: string): Omit<SeoPage, "path" | "url" | "group" | "httpStatus" | "issues" | "score"> {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = t ? decodeEntities(t[1]) : null;
  const description = metaContent(html, "name", "description");
  return {
    title,
    titleLength: title?.length ?? 0,
    description,
    descriptionLength: description?.length ?? 0,
    canonical: linkHref(html, "canonical"),
    robots: metaContent(html, "name", "robots"),
    h1Count: (html.match(/<h1[\s>]/gi) ?? []).length,
    og: {
      title: metaContent(html, "property", "og:title"),
      description: metaContent(html, "property", "og:description"),
      image: metaContent(html, "property", "og:image"),
    },
  };
}

export function evaluate(p: Pick<SeoPage, "title" | "titleLength" | "description" | "descriptionLength" | "canonical" | "robots" | "h1Count" | "og">): {
  issues: SeoIssue[];
  score: number;
} {
  const issues: SeoIssue[] = [];
  let score = 100;
  const hit = (level: SeoIssue["level"], message: string, cost: number) => {
    issues.push({ level, message });
    score -= cost;
  };

  if (!p.title) hit("error", "Missing <title>", 25);
  else if (p.titleLength < 30) hit("warn", `Title is short (${p.titleLength} chars, aim for 30–60)`, 8);
  else if (p.titleLength > 65) hit("warn", `Title may be truncated (${p.titleLength} chars, aim for ≤ 60)`, 8);

  if (!p.description) hit("error", "Missing meta description", 20);
  else if (p.descriptionLength < 70) hit("warn", `Description is short (${p.descriptionLength} chars, aim for 120–160)`, 6);
  else if (p.descriptionLength > 165) hit("warn", `Description may be truncated (${p.descriptionLength} chars, aim for ≤ 160)`, 6);

  if (!p.canonical) hit("warn", "No canonical URL", 8);
  if (p.robots && /noindex/i.test(p.robots)) hit("error", "Page is set to noindex", 25);
  if (p.h1Count === 0) hit("error", "No <h1> heading", 12);
  else if (p.h1Count > 1) hit("warn", `${p.h1Count} <h1> headings (use one)`, 6);

  if (!p.og.title) hit("warn", "Missing og:title", 4);
  if (!p.og.description) hit("warn", "Missing og:description", 4);
  if (!p.og.image) hit("warn", "Missing og:image", 6);

  return { issues, score: Math.max(0, score) };
}

async function scanOne(base: string, target: { path: string; group: string }): Promise<SeoPage> {
  const url = `${base}${target.path === "/" ? "" : target.path}`;
  const empty = {
    title: null, titleLength: 0, description: null, descriptionLength: 0, canonical: null,
    robots: null, h1Count: 0, og: { title: null, description: null, image: null },
  };
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "UniqueCareUK-SEO-Scanner/1.0", Accept: "text/html" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return {
        path: target.path, url, group: target.group, httpStatus: res.status, ...empty,
        issues: [{ level: "error", message: `HTTP ${res.status}` }], score: 0,
      };
    }
    const html = await res.text();
    const parsed = parseSeo(html);
    const { issues, score } = evaluate(parsed);
    return { path: target.path, url, group: target.group, httpStatus: res.status, ...parsed, issues, score };
  } catch (e) {
    return {
      path: target.path, url, group: target.group, httpStatus: null, ...empty,
      issues: [{ level: "error", message: e instanceof Error ? `Fetch failed: ${e.message}` : "Fetch failed" }],
      score: 0,
    };
  }
}

export async function scanSite(): Promise<{
  base: string;
  scannedAt: string;
  pages: SeoPage[];
  summary: { pages: number; avgScore: number; withErrors: number; withWarnings: number; clean: number };
}> {
  const base = seoBaseUrl();
  const targets = await listScanTargets();
  const pages: SeoPage[] = [];
  const CONCURRENCY = 6;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    pages.push(...(await Promise.all(batch.map((t) => scanOne(base, t)))));
  }
  const withErrors = pages.filter((p) => p.issues.some((i) => i.level === "error")).length;
  const withWarnings = pages.filter(
    (p) => !p.issues.some((i) => i.level === "error") && p.issues.some((i) => i.level === "warn"),
  ).length;
  return {
    base,
    scannedAt: new Date().toISOString(),
    pages,
    summary: {
      pages: pages.length,
      avgScore: pages.length ? Math.round(pages.reduce((a, p) => a + p.score, 0) / pages.length) : 0,
      withErrors,
      withWarnings,
      clean: pages.length - withErrors - withWarnings,
    },
  };
}
