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

/** Empty — certifications are managed in the portal (Website → Certifications). */
export const FALLBACK_CERTS: Certification[] = [];
