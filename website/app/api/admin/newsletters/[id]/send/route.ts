import { withAdmin } from "@/lib/admin/http";
import { adminSelect, adminUpdate, AdminDbError } from "@/lib/admin/db";
import { writeAudit } from "@/lib/admin/audit";
import { intParam } from "@/lib/admin/params";
import { mapNewsletter, type NewsletterRow, type SubscriberRow } from "@/lib/admin/mappers";
import { sendEmail } from "@/lib/email";
import { newsletterEmailHtml } from "@/lib/newsletter";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONCURRENCY = 5;

/** POST /api/admin/newsletters/:id/send — emails every active subscriber. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return withAdmin(async () => {
    const id = intParam(params.id);

    const subscribers = await adminSelect<SubscriberRow>("website_subscribers", {
      select: "id,email",
      filters: { status: "eq.active" },
      order: "id.asc",
      limit: 10000,
    });
    if (subscribers.length === 0) throw new AdminDbError("There are no active subscribers to send to", 400);

    // Atomically claim the draft so a double-click can't send twice.
    const claimed = await adminUpdate<NewsletterRow>(
      "website_newsletters",
      `id=eq.${id}&status=eq.draft`,
      { status: "sent", sent_at: new Date().toISOString() },
    );
    if (claimed.length === 0) throw new AdminDbError("Newsletter not found or already sent", 409);
    const nl = claimed[0];

    let delivered = 0;
    let failed = 0;
    for (let i = 0; i < subscribers.length; i += CONCURRENCY) {
      const batch = subscribers.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map((s) =>
          sendEmail({
            to: s.email,
            subject: nl.subject,
            html: newsletterEmailHtml({ subject: nl.subject, content: nl.content, email: s.email }),
          }).catch(() => false),
        ),
      );
      for (const ok of results) {
        if (ok) delivered++;
        else failed++;
      }
    }

    if (delivered === 0) {
      // Nothing went out (e.g. email not configured) — put it back to draft.
      await adminUpdate("website_newsletters", `id=eq.${id}`, { status: "draft", sent_at: null });
      throw new AdminDbError(
        "No emails could be sent. Check that RESEND_API_KEY and EMAIL_FROM are configured.",
        502,
      );
    }

    const rows = await adminUpdate<NewsletterRow>("website_newsletters", `id=eq.${id}`, {
      recipients_count: delivered,
    });
    await writeAudit({
      action: "newsletter.sent",
      entityType: "newsletter",
      entityId: id,
      details: { subject: nl.subject, delivered, failed, subscribers: subscribers.length },
    });
    return { ok: true, delivered, failed, newsletter: mapNewsletter(rows[0] ?? nl) };
  });
}
