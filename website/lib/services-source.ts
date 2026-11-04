import { services as staticServices, type Service } from "@/content/services";

const base = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_URL ?? "";
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_ANON_KEY ?? "";

type DbService = {
  slug: string;
  name: string;
  short: string;
  image: string;
  image_alt: string;
  icon: string;
  badge: string | null;
  body: unknown;
  sort_order: number;
};

function mapDb(r: DbService): Service {
  const bodyArr = Array.isArray(r.body) ? r.body.map(String) : [];
  const body: [string, string] = [bodyArr[0] ?? r.short, bodyArr[1] ?? ""];
  return {
    slug: r.slug,
    name: r.name,
    short: r.short,
    image: r.image || "/images/domiciliary-care.jpg",
    imageAlt: r.image_alt || r.name,
    icon: r.icon || "home",
    badge: r.badge || undefined,
    body,
  };
}

/** Published services from CMS; falls back to static seed if DB empty/unreachable. */
export async function getServices(): Promise<Service[]> {
  if (!base() || !anonKey()) return staticServices;
  try {
    const res = await fetch(
      `${base()}/rest/v1/website_services?status=eq.published&select=slug,name,short,image,image_alt,icon,badge,body,sort_order&order=sort_order.asc&limit=100`,
      {
        headers: { apikey: anonKey(), Authorization: `Bearer ${anonKey()}` },
        next: { revalidate: 60, tags: ["website-cms", "website-services"] },
      },
    );
    if (!res.ok) return staticServices;
    const rows = (await res.json()) as DbService[];
    if (!rows.length) return staticServices;
    return rows.map(mapDb);
  } catch (e) {
    console.warn("[services] CMS fetch failed:", e instanceof Error ? e.message : e);
    return staticServices;
  }
}

export async function getServiceBySlug(slug: string): Promise<Service | undefined> {
  const all = await getServices();
  return all.find((s) => s.slug === slug);
}

export async function getOtherServices(current: string): Promise<Service[]> {
  const all = await getServices();
  const pick = (slugs: string[]) =>
    slugs.map((s) => all.find((x) => x.slug === s)).filter(Boolean) as Service[];
  if (current === "domiciliary-care") return pick(["live-in-care", "supported-living", "disabilities-care"]);
  if (current === "live-in-care") return pick(["domiciliary-care", "supported-living", "disabilities-care"]);
  if (current === "supported-living") return pick(["domiciliary-care", "live-in-care", "disabilities-care"]);
  const rest = all.filter((s) => s.slug !== current).slice(0, 3);
  return rest.length ? rest : pick(["domiciliary-care", "live-in-care", "supported-living"]);
}
