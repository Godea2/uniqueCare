import { withAdmin } from "@/lib/admin/http";
import { scanSite } from "@/lib/admin/seo-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET /api/admin/seo — scans the live site's pages for title / description / canonical / OG tags. */
export async function GET() {
  return withAdmin(async () => scanSite());
}
