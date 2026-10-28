import { posts as staticPosts, type Post, type PostCategory } from "@/content/posts";

/**
 * Blog posts = published rows in `website_posts` (managed in /admin/posts)
 * merged with the static posts in content/posts.ts. A database post with the
 * same slug as a static post replaces it. If the database is unreachable or
 * empty, the static posts are returned unchanged.
 */

const base = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_URL ?? "";
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_ANON_KEY ?? "";

const CATEGORIES: PostCategory[] = ["Care Advice", "Company News", "Health Tips", "Industry Updates"];

type DbPost = {
  id: number;
  title: string;
  slug: string;
  category: string;
  image_url: string | null;
  excerpt: string;
  content: string;
  status: string;
  created_at: string;
};

const FALLBACK_IMAGE = "/images/blog-1.jpg";

function fmt(date: Date, month: "short" | "long"): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month, year: "numeric", timeZone: "UTC" });
}

function fromDb(r: DbPost): Post {
  const d = new Date(r.created_at);
  const category = (CATEGORIES as string[]).includes(r.category) ? (r.category as PostCategory) : "Care Advice";
  const body = r.content
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return {
    slug: r.slug,
    category,
    date: d.toISOString().slice(0, 10),
    dateShort: fmt(d, "short"),
    dateLong: fmt(d, "long"),
    title: r.title,
    excerpt: r.excerpt || (body[0] ?? "").slice(0, 200),
    image: r.image_url || FALLBACK_IMAGE,
    imageAlt: r.title,
    body: body.length ? body : [r.excerpt],
  };
}

async function fetchPublished(): Promise<Post[]> {
  if (!base() || !anonKey()) return [];
  try {
    const res = await fetch(
      `${base()}/rest/v1/website_posts?status=eq.published&select=id,title,slug,category,image_url,excerpt,content,status,created_at&order=created_at.desc&limit=200`,
      {
        headers: { apikey: anonKey(), Authorization: `Bearer ${anonKey()}` },
        next: { revalidate: 300, tags: ["website-posts"] },
      },
    );
    if (!res.ok) return [];
    return ((await res.json()) as DbPost[]).map(fromDb);
  } catch (e) {
    console.warn("[posts] failed to load website_posts:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function getAllPosts(): Promise<Post[]> {
  const db = await fetchPublished();
  if (db.length === 0) return staticPosts;
  const dbSlugs = new Set(db.map((p) => p.slug));
  return [...db, ...staticPosts.filter((p) => !dbSlugs.has(p.slug))].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
}

export async function getPostBySlug(slug: string): Promise<Post | undefined> {
  return (await getAllPosts()).find((p) => p.slug === slug);
}

export async function getRelatedPosts(slug: string, limit = 3): Promise<Post[]> {
  return (await getAllPosts()).filter((p) => p.slug !== slug).slice(0, limit);
}

export function isRemoteImage(src: string): boolean {
  return /^https?:\/\//i.test(src);
}
