import { z } from "zod";
import { withAdmin } from "@/lib/admin/http";
import { adminInsert, adminSelectOne, AdminDbError } from "@/lib/admin/db";
import { listWithCounts } from "@/lib/admin/list";
import { writeAudit } from "@/lib/admin/audit";
import { readJson } from "@/lib/admin/params";
import { SUBSCRIBER_STATUSES, mapSubscriber, type SubscriberRow } from "@/lib/admin/mappers";

export const dynamic = "force-dynamic";

/** GET /api/admin/subscribers?status=active|unsubscribed|all&q=&limit=&offset= */
export async function GET(req: Request) {
  return withAdmin(async () => {
    const r = await listWithCounts<SubscriberRow>({
      table: "website_subscribers",
      req,
      statuses: SUBSCRIBER_STATUSES,
      searchColumns: ["email"],
    });
    return {
      items: r.rows.map(mapSubscriber),
      total: r.total,
      hasMore: r.hasMore,
      counts: r.counts,
    };
  });
}

const createSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254) });

/** POST { email } — manually add a subscriber. */
export async function POST(req: Request) {
  return withAdmin(async () => {
    const parsed = createSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new AdminDbError(parsed.error.issues[0]?.message ?? "Invalid email", 400);
    const { email } = parsed.data;
    const existing = await adminSelectOne<SubscriberRow>("website_subscribers", {
      filters: { email: `eq.${email}` },
    });
    if (existing) throw new AdminDbError("That email is already on the list", 409);
    const [row] = await adminInsert<Record<string, unknown>>("website_subscribers", { email, status: "active" });
    await writeAudit({
      action: "subscriber.added",
      entityType: "subscriber",
      entityId: row?.id as number | undefined,
      details: { email },
    });
    return mapSubscriber(row as unknown as SubscriberRow);
  });
}
