export type Area = {
  slug: string;
  name: string;
  region: string;
  intro: string;
  surrounding: string;
  /** Optional card / hero image (CMS). Empty string when none. */
  image?: string;
  imageAlt?: string;
};

/** Areas live in CMS only (portal → Website → Areas). Kept for types/helpers. */
export const areas: Area[] = [];

export function getArea(slug: string): Area | undefined {
  return areas.find((a) => a.slug === slug);
}

export function otherAreas(slug: string): Area[] {
  return areas.filter((a) => a.slug !== slug);
}
