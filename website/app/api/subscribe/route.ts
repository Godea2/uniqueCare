import { NextResponse } from "next/server";
import { subscribeSchema } from "@/lib/validation";
import { clientIp, rateLimitOk } from "@/lib/rate-limit";
import { insertSubscriber } from "@/lib/supabase";
import { adminDbConfigured, adminInsert, adminSelectOne, adminUpdate } from "@/lib/admin/db";
import { escapeHtml, sendEmail } from "@/lib/email";
import { unsubscribeUrl } from "@/lib/newsletter";
import { site } from "@/content/site";

export const dynamic = "force-dynamic";

type Existing = { id: number; status: string };

/** Public newsletter signup. Idempotent: re-submitting an existing address succeeds quietly. */
export async function POST(req: Request) {
  const ip = clientIp(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // honeypot — silently accept so bots learn nothing
  if ((body as Record<string, unknown>)?.website) return NextResponse.json({ ok: true });

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please enter a valid email address" },
      { status: 400 },
    );
  }
  const { email } = parsed.data;

  if (!rateLimitOk(`subscribe:${ip}`)) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  let outcome: "created" | "exists" | "error";
  try {
    if (adminDbConfigured()) {
      // Server-side check lets us re-activate someone who previously unsubscribed.
      const existing = await adminSelectOne<Existing>("website_subscribers", {
        select: "id,status",
        filters: { email: `eq.${email}` },
      });
      if (!existing) {
        await adminInsert("website_subscribers", { email, status: "active" });
        outcome = "created";
      } else if (existing.status === "unsubscribed") {
        await adminUpdate("website_subscribers", `id=eq.${existing.id}`, { status: "active" });
        outcome = "created";
      } else {
        outcome = "exists";
      }
    } else {
      outcome = await insertSubscriber(email);
    }
  } catch (e) {
    console.warn("[subscribe]", e instanceof Error ? e.message : e);
    outcome = "error";
  }

  if (outcome === "error") {
    return NextResponse.json({ error: "Could not subscribe you right now. Please try again." }, { status: 500 });
  }

  if (outcome === "created") {
    await sendEmail({
      to: email,
      subject: `You're subscribed to ${site.name} updates`,
      html: `
        <p>Thank you for subscribing to ${escapeHtml(site.name)} updates.</p>
        <p>We'll occasionally share care advice and company news. For urgent care needs, call us on <b>${escapeHtml(site.phonePrimaryDisplay)}</b>.</p>
        <p style="color:#5b6670;font-size:12px">Changed your mind? <a href="${unsubscribeUrl(email)}">Unsubscribe</a> at any time.</p>`,
    });
  }

  return NextResponse.json({ ok: true, alreadySubscribed: outcome === "exists" });
}
