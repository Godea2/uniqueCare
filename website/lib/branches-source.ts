import { cmsRows, str } from "@/lib/cms-rest";

export type Branch = {
  id: string;
  name: string;
  address: string;
  city: string;
  postcode: string;
  phone: string;
  phoneDisplay: string;
  email: string;
  hours: string;
  mapsUrl: string;
  image: string;
  imageAlt: string;
  sortOrder: number;
};

type DbBranch = {
  id: number | string;
  name: string;
  address: string;
  city: string | null;
  postcode: string | null;
  phone: string | null;
  phone_display: string | null;
  email: string | null;
  hours: string | null;
  maps_url: string | null;
  image: string | null;
  image_alt: string | null;
  sort_order: number | null;
};

function mapDb(r: DbBranch): Branch {
  return {
    id: String(r.id),
    name: str(r.name),
    address: str(r.address),
    city: str(r.city),
    postcode: str(r.postcode),
    phone: str(r.phone),
    phoneDisplay: str(r.phone_display),
    email: str(r.email),
    hours: str(r.hours),
    mapsUrl: str(r.maps_url),
    image: str(r.image),
    imageAlt: str(r.image_alt),
    sortOrder: r.sort_order ?? 0,
  };
}

/** Published branches from CMS only (portal → Website → Branches). */
export async function getBranches(): Promise<Branch[]> {
  const rows = await cmsRows<DbBranch>(
    "website_branches",
    "status=eq.published&select=id,name,address,city,postcode,phone,phone_display,email,hours,maps_url,image,image_alt,sort_order&order=sort_order.asc,name.asc&limit=50",
    ["website-branches"],
    "branches",
  );
  return (rows ?? []).map(mapDb);
}

/** Google Maps link for a branch (CMS `maps_url` wins, else derived from address). */
export function branchMapsUrl(b: Pick<Branch, "mapsUrl" | "address">): string {
  return b.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`;
}
