export type Service = {
  slug: string;
  name: string;
  short: string;
  image: string;
  imageAlt: string;
  icon: string; // lucide icon key
  badge?: string;
  body: [string, string];
};

/** Services live in CMS only (portal → Website → Services). Kept for types/helpers. */
export const services: Service[] = [];

export function getService(slug: string): Service | undefined {
  return services.find((s) => s.slug === slug);
}

/** "Other Services" sidebar helper — empty until CMS data is loaded via services-source. */
export function otherServices(current: string): Service[] {
  return services.filter((s) => s.slug !== current).slice(0, 3);
}
