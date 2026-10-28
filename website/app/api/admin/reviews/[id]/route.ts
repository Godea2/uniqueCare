import { z } from "zod";
import { revalidatePath } from "next/cache";
import { withAdmin } from "@/lib/admin/http";
import { adminDelete, adminSelectOne, adminUpdate, AdminDbError } from "@/lib/admin/db";
import { writeAudit } from "@/lib/admin/audit";
import { readJson, uuidParam } from "@/lib/admin/params";
import { REVIEW_STATUSES, mapReview, type ReviewRow } from "@/lib/admin/mappers";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ status: z.enum(REVIEW_STATUSES) });

type Ctx = { params: { id: string } };

function refreshPublic() {
  revalidatePath("/reviews");
  revalidatePath("/");
}

/** PATCH { status } — approve / reject / return to pending. */
export async function PATCH(req: Request, { params }: Ctx) {
  return withAdmin(async () => {
    const id = uuidParam(params.id);
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new AdminDbError("Invalid status", 400);
    const { status } = parsed.data;
    const now = new Date().toISOString();

    const patch: Record<string, unknown> =
      status === "approved"
        ? { status, reviewed_at: now, approved_at: now }
        : status === "rejected"
          ? { status, reviewed_at: now, approved_at: null }
          : { status, reviewed_at: null, approved_at: null };

    const rows = await adminUpdate<ReviewRow>("website_reviews", `id=eq.${id}`, patch);
    if (rows.length === 0) throw new AdminDbError("Review not found", 404);

    await writeAudit({
      action: status === "approved" ? "review.approved" : status === "rejected" ? "review.rejected" : "review.reopened",
      entityType: "review",
      entityId: id,
      details: { name: rows[0].name, title: rows[0].title },
    });
    refreshPublic();
    return mapReview(rows[0]);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return withAdmin(async () => {
    const id = uuidParam(params.id);
    const row = await adminSelectOne<ReviewRow>("website_reviews", { filters: { id: `eq.${id}` } });
    if (!row) throw new AdminDbError("Review not found", 404);
    await adminDelete("website_reviews", `id=eq.${id}`);
    await writeAudit({
      action: "review.deleted",
      entityType: "review",
      entityId: id,
      details: { name: row.name, title: row.title, wasStatus: row.status },
    });
    refreshPublic();
    return { ok: true };
  });
}
