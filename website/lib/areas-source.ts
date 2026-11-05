import type { Area } from "@/content/areas";

const base = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_URL ?? "";
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_ANON_KEY ?? "";

type DbArea = {
  slug: string;
  name: string;
  region: string;
  intro: string;
  surrounding: string;
  image?: string | null;
  image_alt?: string | null;
  sort_order: number;
};

function mapDb(r: DbArea): Area {
  return {
    slug: r.slug,
    name: r.name,
    region: r.region,
    intro: r.intro,
    surrounding: r.surrounding,
    image: r.image ?? "",
    imageAlt: r.image_alt ?? "",
  };
}

async function fetchRows(select: string): Promise<DbArea[] | null> {
  const res = await fetch(
    `${base()}/rest/v1/website_areas?status=eq.published&select=${select}&order=sort_order.asc&limit=50`,
    {
      headers: { apikey: anonKey(), Authorization: `Bearer ${anonKey()}` },
      next: { revalidate: 60, tags: ["website-cms", "website-areas"] },
    },
  );
  if (!res.ok) return null;
  return (await res.json()) as DbArea[];
}

/** Published areas from CMS only (portal → Website → Areas). */
export async function getAreas(): Promise<Area[]> {
  if (!base() || !anonKey()) return [];
  try {
    const rows =
      (await fetchRows("slug,name,region,intro,surrounding,image,image_alt,sort_order")) ??
      (await fetchRows("slug,name,region,intro,surrounding,sort_order"));
    if (!rows) return [];
    return rows.map(mapDb);
  } catch (e) {
    console.warn("[areas] CMS fetch failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function getAreaBySlug(slug: string): Promise<Area | undefined> {
  return (await getAreas()).find((a) => a.slug === slug);
}

export async function getOtherAreas(slug: string): Promise<Area[]> {
  return (await getAreas()).filter((a) => a.slug !== slug);
}
