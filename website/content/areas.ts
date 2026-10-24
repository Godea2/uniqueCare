export type Area = {
  slug: string;
  name: string;
  region: string;
  intro: string;
  surrounding: string;
};

export const areas: Area[] = [
  {
    slug: "london",
    name: "London",
    region: "Greater London",
    intro:
      "Professional home care services across London boroughs. Domiciliary care, live-in care, and supported living throughout the capital.",
    surrounding: "London and the surrounding Greater London area",
  },
  {
    slug: "essex",
    name: "Essex",
    region: "Essex",
    intro:
      "Home care services across Essex including Barking, Dagenham, Romford, Ilford, and surrounding areas.",
    surrounding: "Essex and the surrounding Essex area",
  },
  {
    slug: "hertfordshire",
    name: "Hertfordshire",
    region: "Hertfordshire",
    intro:
      "Domiciliary care, live-in care, and supported living services across Hertfordshire including Hertford, Ware, Hoddesdon, and surrounding areas.",
    surrounding: "Hertfordshire and the surrounding Hertfordshire area",
  },
];

export function getArea(slug: string): Area | undefined {
  return areas.find((a) => a.slug === slug);
}

export function otherAreas(slug: string): Area[] {
  return areas.filter((a) => a.slug !== slug);
}
