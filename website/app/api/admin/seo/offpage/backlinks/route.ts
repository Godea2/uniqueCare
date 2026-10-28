import { z } from "zod";
import { withAdmin } from "@/lib/admin/http";
import { adminCount, adminDelete, adminInsert, adminSelect, adminSelectOne, adminUpdate, AdminDbError } from "@/lib/admin/db";
import { writeAudit } from "@/lib/admin/audit";
import { intParam, listParams, orSearch, readJson } from "@/lib/admin/params";
import { backlinkSchema } from "@/lib/admin/schemas";

export const dynamic = "force-dynamic";

type BacklinkRow = {
  id: number;
  domain: string;
  url: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

function map(b: BacklinkRow) {
  return {
    id: b.id,
    domain: b.domain,
    url: b.url,
    notes: b.notes,
    status: b.status,
    createdAt: b.created_at,
  };
}

function idFrom(req: Request): string {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new AdminDbError("Missing ?id=", 400);
  return intParam(id);
}

/** GET /api/admin/seo/offpage/backlinks?status=pending|acquired|all&q= */
export async function GET(req: Request) {
  return withAdmin(async () => {
    const { status, q, limit, offset } = listParams(req, 100);
    const filters: Record<string, string> = {};
    if (status === "pending" || status === "acquired") filters.status = `eq.${status}`;
    const or = orSearch(["domain", "url", "notes"], q);
    if (or) filters.or = or;
    const [rows, total, pending, acquired] = await Promise.all([
      adminSelect<BacklinkRow>("website_backlinks", { order: "created_at.desc", limit, offset, filters }),
      adminCount("website_backlinks", filters),
      adminCount("website_backlinks", { status: "eq.pending" }),
      adminCount("website_backlinks", { status: "eq.acquired" }),
    ]);
    return {
      items: rows.map(map),
      total,
      hasMore: offset + rows.length < total,
      counts: { all: pending + acquired, pending, acquired },
    };
  });
}

export async function POST(req: Request) {
  return withAdmin(async () => {
    const parsed = backlinkSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new AdminDbError(parsed.error.issues[0]?.message ?? "Invalid backlink", 400);
    const d = parsed.data;
    const [row] = await adminInsert<Record<string, unknown>>("website_backlinks", {
      domain: d.domain,
      url: d.url ?? null,
      notes: d.notes ?? null,
      status: d.status,
    });
    await writeAudit({
      action: "backlink.created",
      entityType: "backlink",
      entityId: row?.id as number | undefined,
      details: { domain: d.domain },
    });
    return map(row as unknown as BacklinkRow);
  });
}

const patchSchema = backlinkSchema.partial().extend({ status: z.enum(["pending", "acquired"]).optional() });

/** PATCH ?id= — edit fields or toggle status. */
export async function PATCH(req: Request) {
  return withAdmin(async () => {
    const id = idFrom(req);
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new AdminDbError(parsed.error.issues[0]?.message ?? "Invalid backlink", 400);
    const d = parsed.data;
    const patch: Record<string, unknown> = {};
    if (d.domain !== undefined) patch.domain = d.domain;
    if (d.url !== undefined) patch.url = d.url;
    if (d.notes !== undefined) patch.notes = d.notes;
    if (d.status !== undefined) patch.status = d.status;
    if (Object.keys(patch).length === 0) throw new AdminDbError("Nothing to update", 400);
    const rows = await adminUpdate<BacklinkRow>("website_backlinks", `id=eq.${id}`, patch);
    if (rows.length === 0) throw new AdminDbError("Backlink not found", 404);
    await writeAudit({
      action: d.status ? `backlink.${d.status}` : "backlink.updated",
      entityType: "backlink",
      entityId: id,
      details: { domain: rows[0].domain },
    });
    return map(rows[0]);
  });
}

/** DELETE ?id= */
export async function DELETE(req: Request) {
  return withAdmin(async () => {
    const id = idFrom(req);
    const row = await adminSelectOne<BacklinkRow>("website_backlinks", { filters: { id: `eq.${id}` } });
    if (!row) throw new AdminDbError("Backlink not found", 404);
    await adminDelete("website_backlinks", `id=eq.${id}`);
    await writeAudit({
      action: "backlink.deleted",
      entityType: "backlink",
      entityId: id,
      details: { domain: row.domain },
    });
    return { ok: true };
  });
}
