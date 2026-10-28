import { withAdmin } from "@/lib/admin/http";
import { AdminDbError } from "@/lib/admin/db";
import { seoBaseUrl } from "@/lib/admin/seo-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

type Cat = { score: number | null };
type Audit = { numericValue?: number; displayValue?: string };
type PsiResponse = {
  lighthouseResult?: {
    categories?: Record<string, Cat>;
    audits?: Record<string, Audit>;
  };
  error?: { message?: string };
};

const NO_SCORES = { performance: null, accessibility: null, bestPractices: null, seo: null };

/**
 * GET /api/admin/seo/offpage/pagespeed?path=/&strategy=mobile|desktop
 * Uses the Google PageSpeed Insights API. Without PAGESPEED_API_KEY it returns
 * a stub (all scores null, `stubbed: true`) rather than invented numbers.
 */
export async function GET(req: Request) {
  return withAdmin(async () => {
    const u = new URL(req.url);
    const path = u.searchParams.get("path") ?? "/";
    if (!path.startsWith("/") || path.startsWith("//") || path.length > 300) {
      throw new AdminDbError("path must start with a single /", 400);
    }
    const strategy = u.searchParams.get("strategy") === "desktop" ? "desktop" : "mobile";
    const target = `${seoBaseUrl()}${path === "/" ? "" : path}`;
    const key = process.env.PAGESPEED_API_KEY;

    if (!key) {
      return {
        url: target,
        strategy,
        stubbed: true,
        message: "Set PAGESPEED_API_KEY to enable live PageSpeed Insights scores.",
        scores: NO_SCORES,
        metrics: null,
        fetchedAt: new Date().toISOString(),
      };
    }

    const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    api.searchParams.set("url", target);
    api.searchParams.set("strategy", strategy);
    api.searchParams.set("key", key);
    for (const c of ["performance", "accessibility", "best-practices", "seo"]) {
      api.searchParams.append("category", c);
    }

    const res = await fetch(api, { cache: "no-store", signal: AbortSignal.timeout(80000) });
    const data = (await res.json().catch(() => ({}))) as PsiResponse;
    if (!res.ok) {
      throw new AdminDbError(data.error?.message ?? `PageSpeed API error (${res.status})`, 502);
    }
    const cats = data.lighthouseResult?.categories ?? {};
    const audits = data.lighthouseResult?.audits ?? {};
    const pct = (c?: Cat) => (c?.score == null ? null : Math.round(c.score * 100));

    return {
      url: target,
      strategy,
      stubbed: false,
      message: null,
      scores: {
        performance: pct(cats.performance),
        accessibility: pct(cats.accessibility),
        bestPractices: pct(cats["best-practices"]),
        seo: pct(cats.seo),
      },
      metrics: {
        fcp: audits["first-contentful-paint"]?.displayValue ?? null,
        lcp: audits["largest-contentful-paint"]?.displayValue ?? null,
        tbt: audits["total-blocking-time"]?.displayValue ?? null,
        cls: audits["cumulative-layout-shift"]?.displayValue ?? null,
        speedIndex: audits["speed-index"]?.displayValue ?? null,
      },
      fetchedAt: new Date().toISOString(),
    };
  });
}
