export type PostCategory = "Care Advice" | "Company News" | "Health Tips" | "Industry Updates";

export type Post = {
  slug: string;
  category: PostCategory;
  date: string; // ISO
  dateShort: string; // "10 Mar 2026"
  dateLong: string; // "10 March 2026"
  title: string;
  excerpt: string;
  image: string;
  imageAlt: string;
  body: string[];
};

/** Posts live in CMS only (portal → Website → Blog posts). Kept for types/helpers. */
export const posts: Post[] = [];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}

export function relatedPosts(slug: string): Post[] {
  return posts.filter((p) => p.slug !== slug);
}

export function readingTime(p: Post): number {
  const words = p.body.join(" ").split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}
