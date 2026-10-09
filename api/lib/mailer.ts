import { db } from "../db";
import { audit } from "../util";

/**
 * Outbound email. Every message is recorded in email_outbox.
 *
 * Delivery transport: if Microsoft Graph credentials are configured
 * (MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET /
 * MS_GRAPH_SENDER), the message is sent via Graph and marked "sent".
 * Otherwise the message is marked "queued" — it is durably stored and visible
 * to admins, and will be delivered once the Graph integration is connected.
 */
async function tryGraphSend(to: string, subject: string, bodyText: string): Promise<boolean> {
  const tenant = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  const sender = process.env.MS_GRAPH_SENDER;
  if (!tenant || !clientId || !clientSecret || !sender) return false;
  try {
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default",
      }),
    });
    if (!tokenRes.ok) return false;
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
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
    return sendRes.ok || sendRes.status === 202;
  } catch {
    return false;
  }
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  body: string;
  kind: string;
  relatedType?: string;
  relatedId?: number | string;
}) {
  const delivered = await tryGraphSend(opts.to, opts.subject, opts.body);
  await db.from("emailOutbox").insert({
    toEmail: opts.to,
    subject: opts.subject,
    bodyText: opts.body,
    kind: opts.kind,
    status: delivered ? "sent" : "queued",
    relatedType: opts.relatedType ?? null,
    relatedId: opts.relatedId != null ? String(opts.relatedId) : null,
  });
  await audit("System", `email_${delivered ? "sent" : "queued"}`, "email_outbox", undefined, {
    to: opts.to, kind: opts.kind, subject: opts.subject,
  });
  return { delivered };
}
