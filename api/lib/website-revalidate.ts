/**
 * Best-effort nudge so the marketing site refreshes careers listings when
 * portal jobs change. Requires WEBSITE_URL + WEBSITE_REVALIDATE_SECRET on the
 * portal (same value as the website's REVALIDATE_SECRET). Failures are ignored.
 */
export function bumpWebsiteJobsCache(): void {
  const base = (process.env.WEBSITE_URL ?? "").replace(/\/$/, "");
  const secret = process.env.WEBSITE_REVALIDATE_SECRET ?? "";
  if (!base || !secret) return;
  const url = `${base}/api/revalidate?secret=${encodeURIComponent(secret)}`;
  void fetch(url, { method: "GET", cache: "no-store" }).catch(() => undefined);
}
