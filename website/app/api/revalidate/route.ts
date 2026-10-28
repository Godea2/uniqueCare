import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * On-demand revalidation for careers/reviews/blog — trigger with the secret.
 * The staff portal calls this after website admin changes and may pass extra
 * `?path=/blog/my-post` params (same-site paths only).
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
    "/careers", "/careers/jobs", "/reviews", "/", "/sitemap.xml", "/blog", "/blog/rss.xml", ...extra,
  ]);
  for (const path of paths) {
    revalidatePath(path);
  }
  return NextResponse.json({ revalidated: true, at: new Date().toISOString() });
}
