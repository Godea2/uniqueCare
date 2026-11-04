import { cmsRows, str } from "@/lib/cms-rest";
import { FALLBACK_CERTS, type Certification } from "@/lib/certifications-defaults";

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

/** Published certifications; falls back to the original ISO set if DB empty/unreachable. */
export async function getCertifications(): Promise<Certification[]> {
  const rows = await cmsRows<DbCert>(
    "website_certifications",
    "status=eq.published&select=id,code,label,image,image_alt,url,sort_order&order=sort_order.asc,code.asc&limit=50",
    ["website-certs"],
    "certifications",
  );
  const mapped = (rows ?? [])
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
  return mapped.length ? mapped : FALLBACK_CERTS;
}
