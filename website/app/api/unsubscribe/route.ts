import { z } from "zod";
import { adminDbConfigured, adminUpdate } from "@/lib/admin/db";
import { writeAudit } from "@/lib/admin/audit";
import { verifyUnsubscribeToken } from "@/lib/newsletter";
import { escapeHtml } from "@/lib/email";
import { site } from "@/content/site";

export const dynamic = "force-dynamic";

function page(title: string, message: string, status = 200): Response {
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/>
<title>${escapeHtml(title)} | ${escapeHtml(site.name)}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f7f8f7;color:#1a1f24;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px">
<div style="max-width:440px;background:#fff;border:1px solid #e3e7e6;border-radius:16px;padding:32px;text-align:center">
<h1 style="margin:0 0 12px;font-size:22px;color:#124b99">${escapeHtml(title)}</h1>
<p style="margin:0 0 20px;line-height:1.6;color:#5b6670">${escapeHtml(message)}</p>
<a href="${site.url}" style="color:#124b99;font-weight:600">Back to ${escapeHtml(site.name)}</a>
</div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

const querySchema = z.object({ email: z.string().email().max(254), token: z.string().min(10).max(200) });

/** GET /api/unsubscribe?email=&token= — one-click unsubscribe from newsletter emails. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const parsed = querySchema.safeParse({
    email: u.searchParams.get("email") ?? "",
    token: u.searchParams.get("token") ?? "",
  });
  if (!parsed.success || !verifyUnsubscribeToken(parsed.data.email, parsed.data.token)) {
    return page("Link not valid", "This unsubscribe link is invalid or has been altered. Please contact us and we'll remove you.", 400);
  }
  if (!adminDbConfigured()) {
    return page("Temporarily unavailable", "We couldn't process that right now. Please try again shortly.", 503);
  }
  const email = parsed.data.email.toLowerCase();
  try {
    const rows = await adminUpdate<{ id: number }>("website_subscribers", `email=eq.${encodeURIComponent(email)}`, {
      status: "unsubscribed",
    });
    if (rows.length > 0) {
      await writeAudit({
        action: "subscriber.unsubscribed",
        entityType: "subscriber",
        entityId: rows[0].id,
        details: { email, via: "email link" },
      });
    }
  } catch {
    return page("Something went wrong", "We couldn't update your preferences. Please try again or contact us.", 500);
  }
  return page("You've been unsubscribed", "You won't receive any more newsletters from us.");
}
