import { areas as staticAreas, type Area } from "@/content/areas";

const base = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_URL ?? "";
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_ANON_KEY ?? "";

type DbArea = {
  slug: string;
  name: string;
  region: string;
  intro: string;
  surrounding: string;
  sort_order: number;
};

function mapDb(r: DbArea): Area {
  return {
    slug: r.slug,
    name: r.name,
    region: r.region,
    intro: r.intro,
    surrounding: r.surrounding,
  };
}

export async function getAreas(): Promise<Area[]> {
  if (!base() || !anonKey()) return staticAreas;
  try {
    const res = await fetch(
      `${base()}/rest/v1/website_areas?status=eq.published&select=slug,name,region,intro,surrounding,sort_order&order=sort_order.asc&limit=50`,
      {
        headers: { apikey: anonKey(), Authorization: `Bearer ${anonKey()}` },
        next: { revalidate: 60, tags: ["website-cms", "website-areas"] },
      },
    );
    if (!res.ok) return staticAreas;
    const rows = (await res.json()) as DbArea[];
    if (!rows.length) return staticAreas;
    return rows.map(mapDb);
  } catch (e) {
    console.warn("[areas] CMS fetch failed:", e instanceof Error ? e.message : e);
    return staticAreas;
  }
}

export async function getAreaBySlug(slug: string): Promise<Area | undefined> {
  return (await getAreas()).find((a) => a.slug === slug);
}

export async function getOtherAreas(slug: string): Promise<Area[]> {
  return (await getAreas()).filter((a) => a.slug !== slug);
}
