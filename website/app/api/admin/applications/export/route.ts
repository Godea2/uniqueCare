import { adminCsv } from "@/lib/admin/export";
import { exportRows } from "@/lib/admin/list";
import { humaniseJobSlug } from "@/lib/admin/http";
import { APPLICATION_STATUSES, isoDate, type ApplicationRow } from "@/lib/admin/mappers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return adminCsv("applications", async () => {
    const rows = await exportRows<ApplicationRow>({
      table: "website_applications",
      req,
      statuses: APPLICATION_STATUSES,
      searchColumns: ["name", "email", "job_slug"],
    });
    return [
      ["Name", "Email", "Phone", "Job", "Job slug", "Right to work", "Driving licence", "Cover letter", "Status", "Applied"],
      ...rows.map((a) => [
        a.name,
        a.email,
        a.phone ?? "",
        humaniseJobSlug(a.job_slug),
        a.job_slug,
        a.right_to_work ? "Yes" : "No",
        a.driving_licence ? "Yes" : "No",
        a.cover_letter,
        a.status,
        isoDate(a.created_at),
      ]),
    ];
  });
}
