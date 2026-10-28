import { withAdmin } from "@/lib/admin/http";
import { adminCount, adminSelect } from "@/lib/admin/db";
import { humaniseAuditAction } from "@/lib/admin/audit";
import { listParams, orSearch } from "@/lib/admin/params";
import { relativeTime } from "@/lib/admin/http";

export const dynamic = "force-dynamic";

type AuditRow = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string | null;
  created_at: string;
};

/** GET /api/admin/audit?q=&entity=&limit=&offset= */
export async function GET(req: Request) {
  return withAdmin(async () => {
    const { limit, offset, q } = listParams(req, 30);
    const entity = (new URL(req.url).searchParams.get("entity") ?? "").replace(/[^a-z_]/gi, "");
    const filters: Record<string, string> = {};
    if (entity && entity !== "all") filters.entity_type = `eq.${entity}`;
    const or = orSearch(["action", "details", "entity_id"], q);
    if (or) filters.or = or;

    const [rows, total] = await Promise.all([
      adminSelect<AuditRow>("website_audit_log", { order: "created_at.desc", limit, offset, filters }),
      adminCount("website_audit_log", filters),
    ]);

    return {
      items: rows.map((r) => {
        let details: unknown = r.details;
        if (r.details) {
          try {
            details = JSON.parse(r.details);
          } catch {
            details = r.details;
          }
        }
        return {
          id: r.id,
          action: r.action,
          label: humaniseAuditAction(r.action),
          entityType: r.entity_type,
          entityId: r.entity_id,
          details,
          createdAt: r.created_at,
          relative: relativeTime(r.created_at),
        };
      }),
      total,
      hasMore: offset + rows.length < total,
    };
  });
}
