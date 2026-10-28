import { z } from "zod";
import { withAdmin } from "@/lib/admin/http";
import { adminDelete, adminSelectOne, adminUpdate, AdminDbError } from "@/lib/admin/db";
import { writeAudit } from "@/lib/admin/audit";
import { intParam, readJson } from "@/lib/admin/params";
import { SUBSCRIBER_STATUSES, mapSubscriber, type SubscriberRow } from "@/lib/admin/mappers";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ status: z.enum(SUBSCRIBER_STATUSES) });

type Ctx = { params: { id: string } };

export async function PATCH(req: Request, { params }: Ctx) {
  return withAdmin(async () => {
    const id = intParam(params.id);
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new AdminDbError("Invalid status", 400);
    const rows = await adminUpdate<SubscriberRow>("website_subscribers", `id=eq.${id}`, {
      status: parsed.data.status,
    });
    if (rows.length === 0) throw new AdminDbError("Subscriber not found", 404);
    await writeAudit({
      action: parsed.data.status === "active" ? "subscriber.resubscribed" : "subscriber.unsubscribed",
      entityType: "subscriber",
      entityId: id,
      details: { email: rows[0].email },
    });
    return mapSubscriber(rows[0]);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return withAdmin(async () => {
    const id = intParam(params.id);
    const row = await adminSelectOne<SubscriberRow>("website_subscribers", { filters: { id: `eq.${id}` } });
    if (!row) throw new AdminDbError("Subscriber not found", 404);
    await adminDelete("website_subscribers", `id=eq.${id}`);
    await writeAudit({
      action: "subscriber.deleted",
      entityType: "subscriber",
      entityId: id,
      details: { email: row.email },
    });
    return { ok: true };
  });
}
