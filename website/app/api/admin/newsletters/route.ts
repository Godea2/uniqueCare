import { newsletterSchema } from "@/lib/admin/schemas";
import { withAdmin } from "@/lib/admin/http";
import { adminCount, adminInsert, AdminDbError } from "@/lib/admin/db";
import { listWithCounts } from "@/lib/admin/list";
import { writeAudit } from "@/lib/admin/audit";
import { readJson } from "@/lib/admin/params";
import { NEWSLETTER_STATUSES, mapNewsletter, type NewsletterRow } from "@/lib/admin/mappers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withAdmin(async () => {
    const r = await listWithCounts<NewsletterRow>({
      table: "website_newsletters",
      req,
      statuses: NEWSLETTER_STATUSES,
      searchColumns: ["subject"],
    });
    const activeSubscribers = await adminCount("website_subscribers", { status: "eq.active" });
    return {
      items: r.rows.map(mapNewsletter),
      total: r.total,
      hasMore: r.hasMore,
      counts: r.counts,
      activeSubscribers,
    };
  });
}

/** POST { subject, content } — saves a draft. */
export async function POST(req: Request) {
  return withAdmin(async () => {
    const parsed = newsletterSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new AdminDbError(parsed.error.issues[0]?.message ?? "Invalid newsletter", 400);
    const [row] = await adminInsert<Record<string, unknown>>("website_newsletters", {
      ...parsed.data,
      status: "draft",
    });
    await writeAudit({
      action: "newsletter.created",
      entityType: "newsletter",
      entityId: row?.id as number | undefined,
      details: { subject: parsed.data.subject },
    });
    return mapNewsletter(row as unknown as NewsletterRow);
  });
}
