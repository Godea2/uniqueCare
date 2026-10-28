/**
 * Best-effort nudge so the marketing site refreshes cached pages when portal data
 * changes (careers listings, approved reviews, blog posts). Requires WEBSITE_URL +
 * WEBSITE_REVALIDATE_SECRET on the portal (same value as the website's
 * REVALIDATE_SECRET). Failures are ignored.
 *
 * `paths` adds extra public paths (e.g. "/blog/my-post") on top of the website's defaults.
 */
export function bumpWebsiteJobsCache(paths: string[] = []): void {
  const base = (process.env.WEBSITE_URL ?? "").replace(/\/$/, "");
  const secret = process.env.WEBSITE_REVALIDATE_SECRET ?? "";
  if (!base || !secret) return;
  const extra = paths
    .filter((p) => p.startsWith("/") && !p.startsWith("//"))
    .map((p) => `&path=${encodeURIComponent(p)}`)
    .join("");
  const url = `${base}/api/revalidate?secret=${encodeURIComponent(secret)}${extra}`;
  void fetch(url, { method: "GET", cache: "no-store" }).catch(() => undefined);
}
