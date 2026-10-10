import nodemailer, { type Transporter } from "nodemailer";
import type { EmailOutbox } from "@db/schema";
import { db } from "../db";
import { audit } from "../util";

/**
 * Outbound email. Every message is recorded in email_outbox.
 *
 * Delivery uses Hostinger (or any SMTP host) when SMTP_HOST, SMTP_USER and
 * SMTP_PASSWORD are set. Microsoft Graph is only used when those SMTP values
 * are absent and the four MS_GRAPH_* values are present. Otherwise, or when
 * delivery fails, the message stays "queued" and can be resent from Settings.
 */
function smtpSettings() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
  return {
    host,
    port,
    secure,
    user,
    pass,
    from: process.env.SMTP_FROM?.trim() || user,
  };
}

function graphSettings() {
  const tenant = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  const sender = process.env.MS_GRAPH_SENDER;
  if (!tenant || !clientId || !clientSecret || !sender) return null;
  return { tenant, clientId, clientSecret, sender };
}

export function mailProvider(): { provider: "smtp" | "graph" | "none"; from: string | null } {
  const smtp = smtpSettings();
  if (smtp) return { provider: "smtp", from: smtp.from };
  const graph = graphSettings();
  if (graph) return { provider: "graph", from: graph.sender };
  return { provider: "none", from: null };
}

type SendResult = { ok: true } | { ok: false; error: string };

let transport: { key: string; transporter: Transporter } | null = null;

function smtpTransport(cfg: NonNullable<ReturnType<typeof smtpSettings>>): Transporter {
  const key = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}`;
  if (transport?.key !== key) {
    transport = {
      key,
      transporter: nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: { user: cfg.user, pass: cfg.pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    };
  }
  return transport.transporter;
}

async function smtpSend(to: string, subject: string, bodyText: string): Promise<SendResult> {
  const cfg = smtpSettings();
  if (!cfg) return { ok: false, error: "SMTP is not configured" };
  try {
    await smtpTransport(cfg).sendMail({ from: cfg.from, to, subject, text: bodyText });
    return { ok: true };
  } catch (err) {
    transport = null;
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function graphSend(to: string, subject: string, bodyText: string): Promise<SendResult> {
  const cfg = graphSettings();
  if (!cfg) return { ok: false, error: "No email provider is configured (set the SMTP_* variables)" };
  try {
    const tokenRes = await fetch(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId, client_secret: cfg.clientSecret,
        grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default",
      }),
    });
    if (!tokenRes.ok) return { ok: false, error: `Microsoft sign-in failed (${tokenRes.status})` };
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.sender)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "Text", content: bodyText },
          toRecipients: [{ emailAddress: { address: to } }],
        },
      }),
    });
    if (sendRes.ok || sendRes.status === 202) return { ok: true };
    return { ok: false, error: `Microsoft Graph rejected the email (${sendRes.status})` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function deliver(to: string, subject: string, bodyText: string): Promise<SendResult> {
  return smtpSettings() ? smtpSend(to, subject, bodyText) : graphSend(to, subject, bodyText);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  body: string;
  kind: string;
  relatedType?: string;
  relatedId?: number | string;
}) {
  const result = await deliver(opts.to, opts.subject, opts.body);
  const [row] = await db.from("emailOutbox").insert<EmailOutbox>({
    toEmail: opts.to,
    subject: opts.subject,
    bodyText: opts.body,
    kind: opts.kind,
    status: result.ok ? "sent" : "queued",
    relatedType: opts.relatedType ?? null,
    relatedId: opts.relatedId != null ? String(opts.relatedId) : null,
  });
  await audit("System", `email_${result.ok ? "sent" : "queued"}`, "email_outbox", row?.id, {
    to: opts.to, kind: opts.kind, subject: opts.subject,
    ...(result.ok ? {} : { error: result.error }),
  });
  return { delivered: result.ok, error: result.ok ? undefined : result.error };
}

/** Try queued emails again. Stops at the first failure when nothing has worked yet, since the rest would fail the same way. */
export async function resendQueued(actor: string, ids?: number[]) {
  const query = db.from("emailOutbox").eq("status", "queued").order("id", "asc").limit(50);
  if (ids?.length) query.in("id", ids);
  const queued = await query.many<EmailOutbox>();
  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;
  for (const email of queued) {
    const result = await deliver(email.toEmail, email.subject, email.bodyText ?? "");
    if (result.ok) {
      await db.from("emailOutbox").eq("id", email.id).update({ status: "sent" });
      await audit(actor, "email_resent", "email_outbox", email.id, { to: email.toEmail, kind: email.kind });
      sent++;
    } else {
      failed++;
      lastError = result.error;
      await audit(actor, "email_queued", "email_outbox", email.id, { to: email.toEmail, kind: email.kind, error: result.error });
      if (sent === 0) break;
    }
  }
  return { attempted: queued.length, sent, failed, remaining: queued.length - sent, lastError };
}

export async function sendTestEmail(to: string, actor: string) {
  const result = await deliver(
    to,
    "UniqueCare Connect test email",
    `This is a test email from UniqueCare Connect, sent by ${actor}.\n\nIf you can read this, outgoing email is working.`,
  );
  await audit(actor, result.ok ? "email_test_sent" : "email_test_failed", "email_outbox", undefined, {
    to, ...(result.ok ? {} : { error: result.error }),
  });
  return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
}
