import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** On-demand revalidation for careers/reviews — trigger with the secret. */
export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }
  for (const path of ["/careers", "/careers/jobs", "/reviews", "/", "/sitemap.xml"]) {
    revalidatePath(path);
  }
  return NextResponse.json({ revalidated: true, at: new Date().toISOString() });
}
