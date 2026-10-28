import { revalidatePath } from "next/cache";

/** Refresh every public surface that lists or renders blog posts. */
export function revalidateBlog(slug?: string | null, oldSlug?: string | null) {
  revalidatePath("/");
  revalidatePath("/blog");
  revalidatePath("/blog/rss.xml");
  revalidatePath("/sitemap.xml");
  if (slug) revalidatePath(`/blog/${slug}`);
  if (oldSlug && oldSlug !== slug) revalidatePath(`/blog/${oldSlug}`);
}
