/** Certification type + hardcoded fallback (no I/O; safe for client components). */

export type Certification = {
  id: string;
  code: string;
  label: string;
  image: string;
  imageAlt: string;
  url: string;
  sortOrder: number;
};

const c = (i: number, code: string, label: string, image: string): Certification => ({
  id: `cert-${i}`,
  code,
  label,
  image,
  imageAlt: `${code} - ${label}`,
  url: "",
  sortOrder: (i + 1) * 10,
});

export const FALLBACK_CERTS: Certification[] = [
  c(0, "ISO 9001:2015", "Quality Management", "/images/iso9001.jpeg"),
  c(1, "ISO 45001:2018", "Occupational Health & Safety", "/images/iso45001.jpeg"),
  c(2, "ISO 14001:2015", "Environmental Management", "/images/iso14001.jpeg"),
  c(3, "ISO 27001:2022", "Information Security Management", "/images/iso27001.jpeg"),
];
