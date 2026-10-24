import { NextResponse } from "next/server";
import { reviewSchema, verifyTurnstile } from "@/lib/validation";
import { clientIp, hashIp, rateLimitOk, signModerationToken } from "@/lib/rate-limit";
import { insertReview } from "@/lib/supabase";
import { escapeHtml, notifyInbox, sendEmail } from "@/lib/email";
import { site } from "@/content/site";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // honeypot — silently accept so bots learn nothing
  if ((body as Record<string, unknown>).website) return NextResponse.json({ ok: true });

  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  if (!rateLimitOk(`review:${ip}`)) {
    return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });
  }

  if (!(await verifyTurnstile(data.turnstileToken, ip))) {
    return NextResponse.json({ error: "Spam check failed. Please try again." }, { status: 400 });
  }

  const id = await insertReview({
    name: data.name,
    relationship: data.relationship,
    rating: data.rating,
    title: data.title,
    body: data.body,
    status: "pending",
    ip_hash: hashIp(ip),
  });
  if (!id) {
    return NextResponse.json({ error: "Could not save your review. Please try again." }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? site.url;
  const exp = Date.now() + 7 * 24 * 3600 * 1000; // 7 days, single-purpose
  const approve = `${baseUrl}/api/review-moderation?token=${signModerationToken(id, "approve", exp)}`;
  const reject = `${baseUrl}/api/review-moderation?token=${signModerationToken(id, "reject", exp)}`;

  await sendEmail({
    to: notifyInbox(),
    subject: `New review pending approval: "${data.title}" (${data.rating}/5)`,
    html: `
      <h2>New website review awaiting moderation</h2>
      <p><b>Name:</b> ${escapeHtml(data.name)}<br/>
      <b>Relationship:</b> ${escapeHtml(data.relationship)}<br/>
      <b>Rating:</b> ${data.rating}/5<br/>
      <b>Title:</b> ${escapeHtml(data.title)}</p>
      <p>${escapeHtml(data.body).replace(/\n/g, "<br/>")}</p>
      <p>
        <a href="${approve}" style="background:#2E7D32;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Approve</a>
        &nbsp;
        <a href="${reject}" style="background:#C62828;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Reject</a>
      </p>
      <p style="color:#5B6670;font-size:12px">These links expire in 7 days.</p>`,
  });

  return NextResponse.json({ ok: true });
}
