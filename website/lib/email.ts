/**
 * Email via Resend. If RESEND_API_KEY is not configured the send is skipped
 * (logged) so the website still works in preview; submissions are always
 * stored in the database first.
 */

type EmailPayload = { to: string; subject: string; html: string; replyTo?: string };

export async function sendEmail(p: EmailPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Unique Care UK Website <website@uniquecareuk.com>";
  if (!apiKey) {
    console.log(`[email disabled] would send "${p.subject}" to ${p.to}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: p.to, subject: p.subject, html: p.html, reply_to: p.replyTo }),
    });
    return res.ok;
  } catch {
    return false;
  }
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
