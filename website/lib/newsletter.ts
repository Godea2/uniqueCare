import { createHmac, timingSafeEqual } from "crypto";
import { site } from "@/content/site";
import { escapeHtml } from "@/lib/email";

function secret(): string {
  return (
    process.env.WEBSITE_ADMIN_SESSION_SECRET
    || process.env.REVIEW_MODERATION_SECRET
    || process.env.REVALIDATE_SECRET
    || "dev-only-change-me"
  );
}

/** Stateless HMAC token so unsubscribe links can't be forged for other addresses. */
export function unsubscribeToken(email: string): string {
  return createHmac("sha256", secret()).update(`unsubscribe:${email.toLowerCase()}`).digest("base64url");
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(unsubscribeToken(email));
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function unsubscribeUrl(email: string): string {
  const p = new URLSearchParams({ email, token: unsubscribeToken(email) });
  return `${site.url}/api/unsubscribe?${p.toString()}`;
}

/** Plain-text body → safe HTML paragraphs (blank line = new paragraph; bare URLs linked). */
export function newsletterBodyHtml(content: string): string {
  return content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const safe = escapeHtml(block).replace(/\n/g, "<br/>");
      const linked = safe.replace(
        /\bhttps?:\/\/[^\s<]+/g,
        (u) => `<a href="${u}" style="color:#124b99">${u}</a>`,
      );
      return `<p style="margin:0 0 16px;line-height:1.65">${linked}</p>`;
    })
    .join("");
}

export function newsletterEmailHtml(opts: { subject: string; content: string; email: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f8f7;font-family:Arial,Helvetica,sans-serif;color:#1a1f24">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#124b99;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
      <strong style="font-size:18px">${escapeHtml(site.name)}</strong>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e3e7e6;border-top:none;border-radius:0 0 12px 12px">
      <h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(opts.subject)}</h1>
      ${newsletterBodyHtml(opts.content)}
    </div>
    <p style="text-align:center;color:#5b6670;font-size:12px;margin-top:16px">
      ${escapeHtml(site.legalName)} · ${escapeHtml(site.offices[0].address)}<br/>
      You are receiving this because you subscribed on ${escapeHtml(site.url.replace("https://", ""))}.
      <a href="${unsubscribeUrl(opts.email)}" style="color:#124b99">Unsubscribe</a>
    </p>
  </div></body></html>`;
}
