import { withAdmin } from "@/lib/admin/http";
import { listWithCounts } from "@/lib/admin/list";
import { APPLICATION_STATUSES, mapApplication, type ApplicationRow } from "@/lib/admin/mappers";

export const dynamic = "force-dynamic";

/** GET /api/admin/applications?status=new|reviewing|shortlisted|rejected|all&q=&limit=&offset= */
export async function GET(req: Request) {
  return withAdmin(async () => {
    const r = await listWithCounts<ApplicationRow>({
      table: "website_applications",
      req,
      statuses: APPLICATION_STATUSES,
      searchColumns: ["name", "email", "job_slug"],
    });
    return {
      items: r.rows.map(mapApplication),
      total: r.total,
      hasMore: r.hasMore,
      counts: r.counts,
    };
  });
}
