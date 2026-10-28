import { withAdmin } from "@/lib/admin/http";
import { adminDelete, adminSelectOne, adminUpdate, AdminDbError } from "@/lib/admin/db";
import { writeAudit } from "@/lib/admin/audit";
import { intParam, readJson } from "@/lib/admin/params";
import { postSchema, slugify } from "@/lib/admin/schemas";
import { revalidateBlog } from "@/lib/admin/posts-cache";
import { mapPost, type PostRow } from "@/lib/admin/mappers";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  return withAdmin(async () => {
    const id = intParam(params.id);
    const row = await adminSelectOne<PostRow>("website_posts", { filters: { id: `eq.${id}` } });
    if (!row) throw new AdminDbError("Post not found", 404);
    return mapPost(row);
  });
}

/** PATCH — full or partial update (also used for quick publish / archive toggles). */
export async function PATCH(req: Request, { params }: Ctx) {
  return withAdmin(async () => {
    const id = intParam(params.id);
    const existing = await adminSelectOne<PostRow>("website_posts", { filters: { id: `eq.${id}` } });
    if (!existing) throw new AdminDbError("Post not found", 404);

    const parsed = postSchema.partial().safeParse(await readJson(req));
    if (!parsed.success) throw new AdminDbError(parsed.error.issues[0]?.message ?? "Invalid post", 400);
    const d = parsed.data;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (d.title !== undefined) patch.title = d.title;
    if (d.category !== undefined) patch.category = d.category;
    if (d.imageUrl !== undefined) patch.image_url = d.imageUrl;
    if (d.excerpt !== undefined) patch.excerpt = d.excerpt;
    if (d.content !== undefined) patch.content = d.content;
    if (d.status !== undefined) patch.status = d.status;
    if (d.slug !== undefined) {
      const slug = d.slug || slugify(d.title ?? existing.title);
      if (!slug) throw new AdminDbError("Slug can't be empty", 400);
      if (slug !== existing.slug) {
        const clash = await adminSelectOne<PostRow>("website_posts", {
          select: "id",
          filters: { slug: `eq.${slug}`, id: `neq.${id}` },
        });
        if (clash) throw new AdminDbError(`The slug "${slug}" is already used by another post`, 409);
        patch.slug = slug;
      }
    }

    const rows = await adminUpdate<PostRow>("website_posts", `id=eq.${id}`, patch);
    if (rows.length === 0) throw new AdminDbError("Post not found", 404);
    const post = rows[0];

    const statusChanged = d.status !== undefined && d.status !== existing.status;
    await writeAudit({
      action: statusChanged ? `post.${d.status}` : "post.updated",
      entityType: "post",
      entityId: id,
      details: { title: post.title, slug: post.slug },
    });
    revalidateBlog(post.slug, existing.slug);
    return mapPost(post);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return withAdmin(async () => {
    const id = intParam(params.id);
    const row = await adminSelectOne<PostRow>("website_posts", { filters: { id: `eq.${id}` } });
    if (!row) throw new AdminDbError("Post not found", 404);
    await adminDelete("website_posts", `id=eq.${id}`);
    await writeAudit({
      action: "post.deleted",
      entityType: "post",
      entityId: id,
      details: { title: row.title, slug: row.slug },
    });
    revalidateBlog(row.slug);
    return { ok: true };
  });
}
