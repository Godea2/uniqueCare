import { withAdmin } from "@/lib/admin/http";
import { adminDelete, adminSelectOne, adminUpdate, AdminDbError } from "@/lib/admin/db";
import { writeAudit } from "@/lib/admin/audit";
import { intParam, readJson } from "@/lib/admin/params";
import { newsletterSchema } from "@/lib/admin/schemas";
import { mapNewsletter, type NewsletterRow } from "@/lib/admin/mappers";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  return withAdmin(async () => {
    const id = intParam(params.id);
    const row = await adminSelectOne<NewsletterRow>("website_newsletters", { filters: { id: `eq.${id}` } });
    if (!row) throw new AdminDbError("Newsletter not found", 404);
    return mapNewsletter(row);
  });
}

/** PATCH { subject, content } — only drafts can be edited. */
export async function PATCH(req: Request, { params }: Ctx) {
  return withAdmin(async () => {
    const id = intParam(params.id);
    const parsed = newsletterSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new AdminDbError(parsed.error.issues[0]?.message ?? "Invalid newsletter", 400);
    const rows = await adminUpdate<NewsletterRow>(
      "website_newsletters",
      `id=eq.${id}&status=eq.draft`,
      parsed.data,
    );
    if (rows.length === 0) {
      const exists = await adminSelectOne<NewsletterRow>("website_newsletters", { filters: { id: `eq.${id}` } });
      throw new AdminDbError(
        exists ? "Sent newsletters can't be edited" : "Newsletter not found",
        exists ? 409 : 404,
      );
    }
    await writeAudit({
      action: "newsletter.updated",
      entityType: "newsletter",
      entityId: id,
      details: { subject: parsed.data.subject },
    });
    return mapNewsletter(rows[0]);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return withAdmin(async () => {
    const id = intParam(params.id);
    const row = await adminSelectOne<NewsletterRow>("website_newsletters", { filters: { id: `eq.${id}` } });
    if (!row) throw new AdminDbError("Newsletter not found", 404);
    await adminDelete("website_newsletters", `id=eq.${id}`);
    await writeAudit({
      action: "newsletter.deleted",
      entityType: "newsletter",
      entityId: id,
      details: { subject: row.subject, wasStatus: row.status },
    });
    return { ok: true };
  });
}
