import { cmsRows, str } from "@/lib/cms-rest";
import type { Certification } from "@/lib/certifications-defaults";

export type { Certification } from "@/lib/certifications-defaults";

type DbCert = {
  id: number | string;
  code: string;
  label: string | null;
  image: string | null;
  image_alt: string | null;
  url: string | null;
  sort_order: number | null;
};

/** Published certifications from CMS only (portal → Website → Certifications). */
export async function getCertifications(): Promise<Certification[]> {
  const rows = await cmsRows<DbCert>(
    "website_certifications",
    "status=eq.published&select=id,code,label,image,image_alt,url,sort_order&order=sort_order.asc,code.asc&limit=50",
    ["website-certs"],
    "certifications",
  );
  return (rows ?? [])
    .filter((r) => str(r.code) && str(r.image))
    .map((r) => ({
      id: String(r.id),
      code: r.code,
      label: str(r.label),
      image: str(r.image),
      imageAlt: str(r.image_alt) || `${r.code}${r.label ? ` - ${r.label}` : ""}`,
      url: str(r.url),
      sortOrder: r.sort_order ?? 0,
    }));
}
