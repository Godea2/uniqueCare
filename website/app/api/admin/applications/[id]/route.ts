import { z } from "zod";
import { withAdmin } from "@/lib/admin/http";
import { adminDelete, adminSelectOne, adminUpdate, AdminDbError } from "@/lib/admin/db";
import { writeAudit } from "@/lib/admin/audit";
import { intParam, readJson } from "@/lib/admin/params";
import { APPLICATION_STATUSES, mapApplication, type ApplicationRow } from "@/lib/admin/mappers";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ status: z.enum(APPLICATION_STATUSES) });

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  return withAdmin(async () => {
    const id = intParam(params.id);
    const row = await adminSelectOne<ApplicationRow>("website_applications", { filters: { id: `eq.${id}` } });
    if (!row) throw new AdminDbError("Application not found", 404);
    return mapApplication(row);
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return withAdmin(async () => {
    const id = intParam(params.id);
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new AdminDbError("Invalid status", 400);
    const rows = await adminUpdate<ApplicationRow>("website_applications", `id=eq.${id}`, {
      status: parsed.data.status,
    });
    if (rows.length === 0) throw new AdminDbError("Application not found", 404);
    await writeAudit({
      action: `application.${parsed.data.status}`,
      entityType: "application",
      entityId: id,
      details: { name: rows[0].name, job: rows[0].job_slug },
    });
    return mapApplication(rows[0]);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return withAdmin(async () => {
    const id = intParam(params.id);
    const row = await adminSelectOne<ApplicationRow>("website_applications", { filters: { id: `eq.${id}` } });
    if (!row) throw new AdminDbError("Application not found", 404);
    await adminDelete("website_applications", `id=eq.${id}`);
    await writeAudit({
      action: "application.deleted",
      entityType: "application",
      entityId: id,
      details: { name: row.name, job: row.job_slug },
    });
    return { ok: true };
  });
}
