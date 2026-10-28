import { withAdmin } from "@/lib/admin/http";
import { adminCount, adminSelect } from "@/lib/admin/db";
import { seoBaseUrl } from "@/lib/admin/seo-scan";

export const dynamic = "force-dynamic";

/** Recommended UK home-care listings / citations. `listed` is derived from the backlink tracker. */
const DIRECTORIES: { name: string; domain: string; url: string; why: string }[] = [
  { name: "Google Business Profile", domain: "google.com", url: "https://business.google.com", why: "Local pack visibility and reviews" },
  { name: "CQC provider profile", domain: "cqc.org.uk", url: "https://www.cqc.org.uk", why: "Regulator listing — high-trust link" },
  { name: "Trustpilot", domain: "trustpilot.com", url: "https://www.trustpilot.com", why: "Review signals shown in search" },
  { name: "Yell", domain: "yell.com", url: "https://www.yell.com", why: "Established UK business citation" },
  { name: "homecare.co.uk", domain: "homecare.co.uk", url: "https://www.homecare.co.uk", why: "Care-specific directory" },
  { name: "Care Choices", domain: "carechoices.co.uk", url: "https://www.carechoices.co.uk", why: "Care-specific directory" },
  { name: "UKHCA", domain: "ukhca.co.uk", url: "https://www.ukhca.co.uk", why: "Home care trade association" },
  { name: "LinkedIn company page", domain: "linkedin.com", url: "https://www.linkedin.com", why: "Brand profile and recruitment" },
  { name: "Facebook business page", domain: "facebook.com", url: "https://www.facebook.com", why: "Brand profile and local reach" },
  { name: "Bing Places", domain: "bing.com", url: "https://www.bingplaces.com", why: "Local listing on Bing / Copilot" },
];

async function probe(url: string): Promise<{ ok: boolean; status: number | null; body?: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "UniqueCareUK-SEO-Scanner/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok, status: res.status, body: res.ok ? await res.text() : undefined };
  } catch {
    return { ok: false, status: null };
  }
}

/** GET /api/admin/seo/offpage — technical off-page signals + directory checklist. */
export async function GET() {
  return withAdmin(async () => {
    const base = seoBaseUrl();
    const [robots, sitemap, pending, acquired, links] = await Promise.all([
      probe(`${base}/robots.txt`),
      probe(`${base}/sitemap.xml`),
      adminCount("website_backlinks", { status: "eq.pending" }),
      adminCount("website_backlinks", { status: "eq.acquired" }),
      adminSelect<{ domain: string; status: string }>("website_backlinks", { select: "domain,status", limit: 1000 }),
    ]);

    const acquiredDomains = links
      .filter((l) => l.status === "acquired")
      .map((l) => l.domain.toLowerCase().replace(/^www\./, ""));
    const trackedDomains = new Set(links.map((l) => l.domain.toLowerCase().replace(/^www\./, "")));

    return {
      base,
      https: base.startsWith("https://"),
      robotsTxt: { ok: robots.ok, status: robots.status, referencesSitemap: /sitemap:/i.test(robots.body ?? "") },
      sitemapXml: {
        ok: sitemap.ok,
        status: sitemap.status,
        urlCount: sitemap.body ? (sitemap.body.match(/<loc>/gi) ?? []).length : 0,
      },
      backlinks: { total: pending + acquired, pending, acquired },
      directories: DIRECTORIES.map((d) => ({
        ...d,
        listed: acquiredDomains.includes(d.domain),
        tracked: trackedDomains.has(d.domain),
      })),
    };
  });
}
