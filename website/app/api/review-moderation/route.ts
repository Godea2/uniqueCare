import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyModerationToken } from "@/lib/rate-limit";
import { moderateReview } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function page(title: string, msg: string, ok: boolean) {
  return new NextResponse(
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title} — Unique Care UK</title>
    <style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#F7F8F7;margin:0}
    .card{background:#fff;border-radius:16px;padding:2.5rem;max-width:26rem;text-align:center;box-shadow:0 4px 16px rgb(16 24 40/.08)}
    h1{font-size:1.4rem;color:#1A1F24}p{color:#5B6670;line-height:1.6}</style></head>
    <body><div class="card"><h1>${ok ? "✅ " : ""}${title}</h1><p>${msg}</p></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const parsed = verifyModerationToken(token);
  if (!parsed) {
    return page("Link expired or invalid", "This moderation link is invalid or has expired. Please ask for a new review notification email.", false);
  }
  const ok = await moderateReview(parsed.reviewId, parsed.action);
  if (ok) {
    revalidatePath("/reviews");
    revalidatePath("/");
  }
  if (!ok) {
    return page("Moderation unavailable", "Review moderation is not configured on this deployment. The review remains pending.", false);
  }
  return page(
    parsed.action === "approve" ? "Review approved" : "Review rejected",
    parsed.action === "approve"
      ? "The review is now published on the website (within about 5 minutes, after the cache refreshes)."
      : "The review has been rejected and will not appear on the website.",
    true
  );
}
