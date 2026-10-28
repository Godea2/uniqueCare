import { adminCsv } from "@/lib/admin/export";
import { exportRows } from "@/lib/admin/list";
import { REVIEW_STATUSES, isoDate, type ReviewRow } from "@/lib/admin/mappers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return adminCsv("reviews", async () => {
    const rows = await exportRows<ReviewRow>({
      table: "website_reviews",
      req,
      statuses: REVIEW_STATUSES,
      searchColumns: ["name", "title", "body"],
    });
    return [
      ["Name", "Relationship", "Rating", "Title", "Review", "Status", "Submitted", "Reviewed", "Approved"],
      ...rows.map((r) => [
        r.name,
        r.relationship,
        String(r.rating),
        r.title,
        r.body,
        r.status,
        isoDate(r.created_at),
        isoDate(r.reviewed_at),
        isoDate(r.approved_at),
      ]),
    ];
  });
}
