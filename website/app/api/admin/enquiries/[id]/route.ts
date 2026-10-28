import { z } from "zod";
import { withAdmin } from "@/lib/admin/http";
import { adminDelete, adminSelectOne, adminUpdate, AdminDbError } from "@/lib/admin/db";
import { writeAudit } from "@/lib/admin/audit";
import { readJson, uuidParam } from "@/lib/admin/params";
import { ENQUIRY_STATUSES, mapEnquiry, type EnquiryRow } from "@/lib/admin/mappers";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ status: z.enum(ENQUIRY_STATUSES) });

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  return withAdmin(async () => {
    const id = uuidParam(params.id);
    const row = await adminSelectOne<EnquiryRow>("website_enquiries", { filters: { id: `eq.${id}` } });
    if (!row) throw new AdminDbError("Enquiry not found", 404);
    return mapEnquiry(row);
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return withAdmin(async () => {
    const id = uuidParam(params.id);
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new AdminDbError("Invalid status", 400);
    const rows = await adminUpdate<EnquiryRow>("website_enquiries", `id=eq.${id}`, {
      status: parsed.data.status,
    });
    if (rows.length === 0) throw new AdminDbError("Enquiry not found", 404);
    await writeAudit({
      action: `enquiry.${parsed.data.status}`,
      entityType: "enquiry",
      entityId: id,
      details: { email: rows[0].email },
    });
    return mapEnquiry(rows[0]);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return withAdmin(async () => {
    const id = uuidParam(params.id);
    const row = await adminSelectOne<EnquiryRow>("website_enquiries", { filters: { id: `eq.${id}` } });
    if (!row) throw new AdminDbError("Enquiry not found", 404);
    await adminDelete("website_enquiries", `id=eq.${id}`);
    await writeAudit({
      action: "enquiry.deleted",
      entityType: "enquiry",
      entityId: id,
      details: { email: row.email, name: row.full_name },
    });
    return { ok: true };
  });
}
