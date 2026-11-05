/**
 * Outbound email for the public website.
 *
 * 1. Prefer Resend when RESEND_API_KEY is set.
 * 2. If Resend is missing or fails, fall back to the staff portal SMTP/Graph
 *    via POST {ADMIN_PORTAL}/api/public/website-notify (shared secret).
 *
 * Submissions are always stored in the database first; email is best-effort
 * but failures are logged clearly so ops can fix configuration.
 */

type EmailPayload = { to: string; subject: string; html: string; replyTo?: string; text?: string };

function portalNotifyUrl(): string | null {
  const base = (
    process.env.JOBS_PORTAL_URL
    || process.env.NEXT_PUBLIC_PORTAL_URL
    || process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL
    || ""
  ).replace(/\/$/, "");
  if (!base) return null;
  return `${base}/api/public/website-notify`;
}

function notifySecret(): string {
  return (
    process.env.WEBSITE_NOTIFY_SECRET
    || process.env.WEBSITE_REVALIDATE_SECRET
    || process.env.REVALIDATE_SECRET
    || ""
  );
}

async function sendViaResend(p: EmailPayload): Promise<{ ok: boolean; detail?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Unique Care UK Website <website@uniquecareuk.com>";
  if (!apiKey) return { ok: false, detail: "RESEND_API_KEY not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: p.to,
        subject: p.subject,
        html: p.html,
        text: p.text,
        reply_to: p.replyTo,
      }),
    });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => "");
    return { ok: false, detail: `Resend HTTP ${res.status}: ${body.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Resend network error" };
  }
}

async function sendViaPortal(p: EmailPayload): Promise<{ ok: boolean; detail?: string }> {
  const url = portalNotifyUrl();
  const secret = notifySecret();
  if (!url || !secret) return { ok: false, detail: "Portal notify URL/secret not configured" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        to: p.to,
        subject: p.subject,
        html: p.html,
        text: p.text,
        replyTo: p.replyTo,
      }),
    });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => "");
    return { ok: false, detail: `Portal notify HTTP ${res.status}: ${body.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Portal notify network error" };
  }
}

export async function sendEmail(p: EmailPayload): Promise<boolean> {
  const primary = await sendViaResend(p);
  if (primary.ok) return true;
  console.warn(`[email] Resend failed for "${p.subject}" → ${p.to}: ${primary.detail}`);

  const fallback = await sendViaPortal(p);
  if (fallback.ok) {
    console.info(`[email] delivered via portal SMTP fallback: "${p.subject}" → ${p.to}`);
    return true;
  }
  console.error(`[email] FAILED "${p.subject}" → ${p.to}. Resend: ${primary.detail}; Portal: ${fallback.detail}`);
  return false;
}

export function notifyInbox(): string {
  return process.env.EMAIL_TO ?? "info@uniquecareuk.com";
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
