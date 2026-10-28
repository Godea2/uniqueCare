import { z } from "zod";
import { withAdmin } from "@/lib/admin/http";
import { adminSelectOne, adminUpdate, AdminDbError } from "@/lib/admin/db";
import { writeAudit } from "@/lib/admin/audit";
import { readJson, uuidParam } from "@/lib/admin/params";
import { mapEnquiry, type EnquiryRow } from "@/lib/admin/mappers";
import { escapeHtml, notifyInbox, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const replySchema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(200),
  message: z.string().trim().min(1, "Message is required").max(10000),
});

/** POST /api/admin/enquiries/:id/reply — emails the enquirer and marks the enquiry replied. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return withAdmin(async () => {
    const id = uuidParam(params.id);
    const parsed = replySchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new AdminDbError(parsed.error.issues[0]?.message ?? "Invalid reply", 400);
    }
    const enquiry = await adminSelectOne<EnquiryRow>("website_enquiries", { filters: { id: `eq.${id}` } });
    if (!enquiry) throw new AdminDbError("Enquiry not found", 404);

    const { subject, message } = parsed.data;
    const sent = await sendEmail({
      to: enquiry.email,
      subject,
      replyTo: notifyInbox(),
      html: `
        <p>Dear ${escapeHtml(enquiry.full_name)},</p>
        <p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>
        <p>Kind regards,<br/>The Unique Care UK team<br/>020 3917 0260</p>
        <hr style="border:none;border-top:1px solid #e3e7e6;margin:24px 0"/>
        <p style="color:#5b6670;font-size:12px"><b>Your original message:</b><br/>${escapeHtml(enquiry.message).replace(/\n/g, "<br/>")}</p>`,
    });
    if (!sent) {
      throw new AdminDbError(
        "The email could not be sent. Check that RESEND_API_KEY and EMAIL_FROM are configured.",
        502,
      );
    }

    const rows = await adminUpdate<EnquiryRow>("website_enquiries", `id=eq.${id}`, { status: "replied" });
    await writeAudit({
      action: "enquiry.replied",
      entityType: "enquiry",
      entityId: id,
      details: { to: enquiry.email, subject },
    });
    return { ok: true, enquiry: mapEnquiry(rows[0] ?? { ...enquiry, status: "replied" }) };
  });
}
