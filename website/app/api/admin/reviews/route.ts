import { withAdmin } from "@/lib/admin/http";
import { listWithCounts } from "@/lib/admin/list";
import { REVIEW_STATUSES, mapReview, type ReviewRow } from "@/lib/admin/mappers";

export const dynamic = "force-dynamic";

/** GET /api/admin/reviews?status=pending|approved|rejected|all&q=&limit=&offset= */
export async function GET(req: Request) {
  return withAdmin(async () => {
    const r = await listWithCounts<ReviewRow>({
      table: "website_reviews",
      req,
      statuses: REVIEW_STATUSES,
      searchColumns: ["name", "title", "body"],
    });
    return {
      items: r.rows.map(mapReview),
      total: r.total,
      hasMore: r.hasMore,
      counts: r.counts,
    };
  });
}
