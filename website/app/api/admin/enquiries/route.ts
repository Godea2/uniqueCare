import { withAdmin } from "@/lib/admin/http";
import { listWithCounts } from "@/lib/admin/list";
import { ENQUIRY_STATUSES, mapEnquiry, type EnquiryRow } from "@/lib/admin/mappers";

export const dynamic = "force-dynamic";

/** GET /api/admin/enquiries?status=new|read|replied|all&q=&limit=&offset= */
export async function GET(req: Request) {
  return withAdmin(async () => {
    const r = await listWithCounts<EnquiryRow>({
      table: "website_enquiries",
      req,
      statuses: ENQUIRY_STATUSES,
      searchColumns: ["full_name", "email", "message"],
    });
    return {
      items: r.rows.map(mapEnquiry),
      total: r.total,
      hasMore: r.hasMore,
      counts: r.counts,
    };
  });
}
