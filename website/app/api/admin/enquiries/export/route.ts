import { adminCsv } from "@/lib/admin/export";
import { exportRows } from "@/lib/admin/list";
import { ENQUIRY_STATUSES, isoDate, type EnquiryRow } from "@/lib/admin/mappers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return adminCsv("enquiries", async () => {
    const rows = await exportRows<EnquiryRow>({
      table: "website_enquiries",
      req,
      statuses: ENQUIRY_STATUSES,
      searchColumns: ["full_name", "email", "message"],
    });
    return [
      ["Name", "Email", "Phone", "Enquiry type", "Care type", "Message", "Status", "Received"],
      ...rows.map((e) => [
        e.full_name,
        e.email,
        e.phone ?? "",
        e.enquiry_type,
        e.care_type ?? "",
        e.message,
        e.status,
        isoDate(e.created_at),
      ]),
    ];
  });
}
