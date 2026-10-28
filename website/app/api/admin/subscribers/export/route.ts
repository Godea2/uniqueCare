import { adminCsv } from "@/lib/admin/export";
import { exportRows } from "@/lib/admin/list";
import { SUBSCRIBER_STATUSES, isoDate, type SubscriberRow } from "@/lib/admin/mappers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return adminCsv("subscribers", async () => {
    const rows = await exportRows<SubscriberRow>({
      table: "website_subscribers",
      req,
      statuses: SUBSCRIBER_STATUSES,
      searchColumns: ["email"],
    });
    return [
      ["Email", "Status", "Subscribed"],
      ...rows.map((s) => [s.email, s.status, isoDate(s.created_at)]),
    ];
  });
}
