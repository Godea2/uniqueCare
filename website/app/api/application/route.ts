import { NextResponse } from "next/server";
import { applicationSchema, verifyTurnstile } from "@/lib/validation";
import { clientIp, rateLimitOk } from "@/lib/rate-limit";
import { insertApplication } from "@/lib/supabase";
import { escapeHtml, notifyInbox, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Optional on-site application form. Job cards still send candidates to the
 * portal; this endpoint only stores submissions in website_applications.
 */
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

  const parsed = applicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  if (!rateLimitOk(`application:${ip}`)) {
    return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });
  }
  if (!(await verifyTurnstile(d.turnstileToken, ip))) {
    return NextResponse.json({ error: "Spam check failed. Please try again." }, { status: 400 });
  }

  const saved = await insertApplication({
    name: d.name,
    email: d.email,
    phone: d.phone || null,
    job_slug: d.jobSlug.toLowerCase(),
    cover_letter: d.coverLetter,
    right_to_work: d.rightToWork,
    driving_licence: d.drivingLicence,
  });
  if (!saved) {
    return NextResponse.json({ error: "Could not save your application. Please try again." }, { status: 500 });
  }

  await sendEmail({
    to: notifyInbox(),
    subject: `New job application: ${d.jobSlug} from ${d.name}`,
    replyTo: d.email,
    html: `
      <h2>New website job application</h2>
      <p><b>Name:</b> ${escapeHtml(d.name)}<br/>
      <b>Email:</b> ${escapeHtml(d.email)}<br/>
      <b>Phone:</b> ${escapeHtml(d.phone || "—")}<br/>
      <b>Job:</b> ${escapeHtml(d.jobSlug)}<br/>
      <b>Right to work in the UK:</b> ${d.rightToWork ? "Yes" : "No"}<br/>
      <b>Driving licence:</b> ${d.drivingLicence ? "Yes" : "No"}</p>
      ${d.coverLetter ? `<p><b>Cover letter:</b></p><p>${escapeHtml(d.coverLetter).replace(/\n/g, "<br/>")}</p>` : ""}`,
  });

  return NextResponse.json({ ok: true });
}
