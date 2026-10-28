import { withAdmin } from "@/lib/admin/http";
import { adminInsert, adminSelectOne, AdminDbError } from "@/lib/admin/db";
import { listWithCounts } from "@/lib/admin/list";
import { writeAudit } from "@/lib/admin/audit";
import { readJson } from "@/lib/admin/params";
import { postSchema, slugify } from "@/lib/admin/schemas";
import { revalidateBlog } from "@/lib/admin/posts-cache";
import { POST_STATUSES, mapPost, type PostRow } from "@/lib/admin/mappers";

export const dynamic = "force-dynamic";

/** GET /api/admin/posts?status=draft|published|archived|all&q=&limit=&offset= */
export async function GET(req: Request) {
  return withAdmin(async () => {
    const r = await listWithCounts<PostRow>({
      table: "website_posts",
      req,
      statuses: POST_STATUSES,
      searchColumns: ["title", "slug", "excerpt"],
      order: "created_at.desc",
    });
    return {
      items: r.rows.map(mapPost),
      total: r.total,
      hasMore: r.hasMore,
      counts: r.counts,
    };
  });
}

export async function POST(req: Request) {
  return withAdmin(async () => {
    const parsed = postSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new AdminDbError(parsed.error.issues[0]?.message ?? "Invalid post", 400);
    const d = parsed.data;
    const slug = d.slug || slugify(d.title);
    if (!slug) throw new AdminDbError("Could not generate a slug from that title", 400);

    const clash = await adminSelectOne<PostRow>("website_posts", { select: "id", filters: { slug: `eq.${slug}` } });
    if (clash) throw new AdminDbError(`The slug "${slug}" is already used by another post`, 409);

    const [row] = await adminInsert<Record<string, unknown>>("website_posts", {
      title: d.title,
      slug,
      category: d.category,
      image_url: d.imageUrl ?? null,
      excerpt: d.excerpt,
      content: d.content,
      status: d.status,
    });
    const post = row as unknown as PostRow;
    await writeAudit({
      action: d.status === "published" ? "post.published" : "post.created",
      entityType: "post",
      entityId: post.id,
      details: { title: d.title, slug },
    });
    if (d.status === "published") revalidateBlog(slug);
    return mapPost(post);
  });
}
