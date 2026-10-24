import { NextResponse } from "next/server";
import { enquirySchema, verifyTurnstile } from "@/lib/validation";
import { clientIp, hashIp, rateLimitOk } from "@/lib/rate-limit";
import { insertEnquiry } from "@/lib/supabase";
import { escapeHtml, notifyInbox, sendEmail } from "@/lib/email";

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

  const saved = await insertEnquiry({
    full_name: data.fullName,
    email: data.email,
    phone: data.phone || null,
    enquiry_type: data.enquiryType,
    care_type: data.careType || null,
    message: data.message,
    source_page: data.service ? `/contact?service=${data.service}` : "/contact",
    ip_hash: hashIp(ip),
  });
  if (!saved) {
    return NextResponse.json({ error: "Could not save your enquiry. Please try again." }, { status: 500 });
  }

  await sendEmail({
    to: notifyInbox(),
    subject: `New website enquiry: ${data.enquiryType} from ${data.fullName}`,
    replyTo: data.email,
    html: `
      <h2>New website enquiry</h2>
      <p><b>Name:</b> ${escapeHtml(data.fullName)}<br/>
      <b>Email:</b> ${escapeHtml(data.email)}<br/>
      <b>Phone:</b> ${escapeHtml(data.phone || "—")}<br/>
      <b>Enquiry type:</b> ${escapeHtml(data.enquiryType)}<br/>
      ${data.careType ? `<b>Type of care:</b> ${escapeHtml(data.careType)}<br/>` : ""}
      <b>Message:</b></p>
      <p>${escapeHtml(data.message).replace(/\n/g, "<br/>")}</p>`,
  });

  await sendEmail({
    to: data.email,
    subject: "Thank you for contacting Unique Care UK",
    html: `
      <p>Dear ${escapeHtml(data.fullName)},</p>
      <p>Thank you for your enquiry. We have received your message and will be in touch within 2 working days.</p>
      <p>For urgent care needs, please call us on <b>020 3917 0260</b>.</p>
      <p>Kind regards,<br/>The Unique Care UK team</p>`,
  });

  return NextResponse.json({ ok: true });
}
