import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * On-demand revalidation for careers/reviews/blog — trigger with the secret.
 * The staff portal calls this after job/website admin changes and may pass extra
 * `?path=/careers/jobs/my-slug` params (same-site paths only).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }
  const extra = url.searchParams
    .getAll("path")
    .filter((p) => p.startsWith("/") && !p.startsWith("//") && p.length <= 200)
    .slice(0, 10);
  const paths = new Set([
    "/careers", "/careers/jobs", "/reviews", "/", "/sitemap.xml", "/blog", "/blog/rss.xml",
    "/about", "/contact", "/services", "/areas", ...extra,
  ]);
  for (const path of paths) {
    revalidatePath(path);
  }
  // Layout carries theme, nav, header/footer, CTA band, metadata — refresh every page that uses it.
  revalidatePath("/", "layout");
  for (const tag of [
    "website-jobs",
    "website-posts",
    "website-cms",
    "website-site",
    "website-services",
    "website-areas",
    "website-branches",
    "website-nav",
    "website-certs",
    "website-media",
    ...["home", "about", "careers", "contact", "services", "areas", "reviews", "blog"].map(
      (k) => `website-sections-${k}`,
    ),
  ]) {
    revalidateTag(tag);
  }
  return NextResponse.json({ revalidated: true, at: new Date().toISOString() });
}
