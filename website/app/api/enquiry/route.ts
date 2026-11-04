import { NextResponse } from "next/server";
import { enquirySchema, verifyTurnstile } from "@/lib/validation";
import { clientIp, hashIp, rateLimitOk } from "@/lib/rate-limit";
import { insertEnquiry } from "@/lib/supabase";
import { escapeHtml, notifyInbox, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const submittedAt = new Date();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // honeypot — silently accept so bots learn nothing
  if ((body as Record<string, unknown>).website) return NextResponse.json({ ok: true });

  const parsed = enquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  if (!rateLimitOk(`enquiry:${ip}`)) {
    return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });
  }

  if (!(await verifyTurnstile(data.turnstileToken, ip))) {
    return NextResponse.json({ error: "Spam check failed. Please try again." }, { status: 400 });
  }

  const sourcePage = data.service ? `/contact?service=${encodeURIComponent(data.service)}` : "/contact";

  const saved = await insertEnquiry({
    full_name: data.fullName,
    email: data.email,
    phone: data.phone || null,
    enquiry_type: data.enquiryType,
    care_type: data.careType || null,
    message: data.message,
    source_page: sourcePage,
    ip_hash: hashIp(ip),
  });
  if (!saved) {
    return NextResponse.json({ error: "Could not save your enquiry. Please try again." }, { status: 500 });
  }

  const when = submittedAt.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "full",
    timeStyle: "short",
  });

  const notifyOk = await sendEmail({
    to: notifyInbox(),
    subject: `New Website Enquiry - ${data.fullName}`,
    replyTo: data.email,
    html: `
      <h2 style="font-family:Arial,sans-serif;color:#0a2540">New Website Enquiry</h2>
      <table style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1f24;border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;font-weight:600">Full name</td><td>${escapeHtml(data.fullName)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:600">Email</td><td>${escapeHtml(data.email)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:600">Phone</td><td>${escapeHtml(data.phone || "Not provided")}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:600">Subject</td><td>${escapeHtml(data.enquiryType)}</td></tr>
        ${data.careType ? `<tr><td style="padding:4px 12px 4px 0;font-weight:600">Type of care</td><td>${escapeHtml(data.careType)}</td></tr>` : ""}
        <tr><td style="padding:4px 12px 4px 0;font-weight:600">Submitted</td><td>${escapeHtml(when)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:600">Source page</td><td>${escapeHtml(sourcePage)}</td></tr>
      </table>
      <p style="font-family:Arial,sans-serif;font-size:14px;margin-top:16px"><b>Message</b></p>
      <p style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${escapeHtml(data.message).replace(/\n/g, "<br/>")}</p>
      <p style="font-family:Arial,sans-serif;font-size:12px;color:#5b6670;margin-top:24px">Sent from the Unique Care UK website contact form.</p>`,
  });

  if (!notifyOk) {
    console.error(`[enquiry] saved but email to ${notifyInbox()} failed for ${data.email}`);
  }

  await sendEmail({
    to: data.email,
    subject: "Thank you for contacting Unique Care UK",
    html: `
      <p>Dear ${escapeHtml(data.fullName)},</p>
      <p>Thank you for your enquiry. We have received your message and will be in touch within 2 working days.</p>
      <p>For urgent care needs, please call us on <b>020 3917 0260</b>.</p>
      <p>Kind regards,<br/>The Unique Care UK team</p>`,
  });

  return NextResponse.json({ ok: true, emailDelivered: notifyOk });
}
