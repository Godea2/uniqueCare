/**
 * Branded HTML version of a plain-text email, matching the Supabase auth
 * templates in supabase/email-templates. Paragraphs are separated by blank
 * lines; a line that is only a URL becomes a button. Inline styles and table
 * layout only, because most mail clients ignore <style> blocks.
 */

const ACTION_LABELS: Record<string, string> = {
  application_confirmation: "Open your candidate portal",
  interview_invitation: "Complete form and book interview",
  interview_booked: "View your booking",
  compliance_requested: "Upload your documents",
  document_rejected: "Upload the document again",
  offer_sent: "View your offer",
  staff_notification: "Open UniqueCare Connect",
};

export function actionLabelFor(kind: string): string {
  return ACTION_LABELS[kind] ?? "Open link";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const URL_ONLY = /^https?:\/\/\S+$/;

function linkify(escaped: string): string {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#0575a8;">${url}</a>`);
}

function button(url: string, label: string): string {
  const href = escapeHtml(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;">
  <tr><td style="border-radius:10px;background-color:#0586bf;">
    <a href="${href}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
  </td></tr>
</table>
<p style="margin:0 0 20px;font-size:12px;line-height:1.5;color:#6b7280;word-break:break-all;">Or copy this link: <a href="${href}" style="color:#0575a8;">${href}</a></p>`;
}

function paragraph(lines: string[]): string {
  if (!lines.length) return "";
  const html = lines.map((line) => linkify(escapeHtml(line))).join("<br>");
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2937;">${html}</p>`;
}

function bodyHtml(text: string, actionLabel: string): string {
  const out: string[] = [];
  for (const block of text.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    let lines: string[] = [];
    for (const raw of block.split("\n")) {
      const line = raw.trim();
      if (URL_ONLY.test(line)) {
        out.push(paragraph(lines));
        lines = [];
        out.push(button(line, actionLabel));
      } else if (line) {
        lines.push(line);
      }
    }
    out.push(paragraph(lines));
  }
  return out.filter(Boolean).join("\n");
}

export function renderEmailHtml(opts: { orgName: string; subject: string; text: string; kind: string }): string {
  const org = escapeHtml(opts.orgName);
  const initial = escapeHtml(opts.orgName.trim().charAt(0).toUpperCase() || "U");
  const preview = escapeHtml(opts.text.split("\n").find((l) => l.trim() && !/^dear |^hello /i.test(l.trim()))?.trim().slice(0, 140) ?? "");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(opts.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f2fafd;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f2fafd;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td style="background-color:#082f52;border-radius:16px 16px 0 0;padding:24px 32px;">
            <span style="display:inline-block;width:36px;height:36px;line-height:36px;border-radius:50%;background-color:#0586bf;color:#ffffff;font-size:18px;font-weight:700;text-align:center;vertical-align:middle;">${initial}</span>
            <span style="font-size:20px;font-weight:700;color:#ffffff;vertical-align:middle;padding-left:10px;">${org}</span>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff;padding:36px 32px 20px;border:1px solid #dcf0f9;border-top:0;border-radius:0 0 16px 16px;">
            <h1 style="margin:0 0 20px;font-size:21px;line-height:1.35;color:#082f52;">${escapeHtml(opts.subject)}</h1>
${bodyHtml(opts.text, actionLabelFor(opts.kind))}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 16px 0;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">${org} · Sent by UniqueCare Connect</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
