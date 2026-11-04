/**
 * Theme / brand / SEO / CTA-band types, hardcoded defaults (matching globals.css and
 * the current public assets) and pure normalisers. No I/O here so it is safe to
 * import from anywhere (including site-source.ts) without circular imports.
 */

export type Theme = {
  brandPrimary: string;
  brandPrimaryDark: string;
  brandSecondary: string;
  brandSoft: string;
  brandInk: string;
  brandGold: string;
  ink: string;
  inkMuted: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  cqcGood: string;
};

export type Brand = {
  logoUrl: string;
  logoMarkUrl: string;
  faviconUrl: string;
  ogImageUrl: string;
  appleTouchIconUrl: string;
};

export type SeoDefaults = {
  defaultTitle: string;
  titleTemplate: string;
  defaultDescription: string;
  keywords: string[];
};

export type Cta = { label: string; href: string };

export type CtaBandSettings = {
  title: string;
  text: string;
  primaryCta: Cta;
  secondaryCta: Cta;
  image: string;
};

export const DEFAULT_THEME: Theme = {
  brandPrimary: "#124b99",
  brandPrimaryDark: "#0c3875",
  brandSecondary: "#0089ca",
  brandSoft: "#eaf5fb",
  brandInk: "#0a2540",
  brandGold: "#d9a441",
  ink: "#1a1f24",
  inkMuted: "#5b6670",
  surface: "#ffffff",
  surfaceAlt: "#f7f8f7",
  border: "#e3e7e6",
  cqcGood: "#2e7d32",
};

export const DEFAULT_BRAND: Brand = {
  logoUrl: "/images/logo-horizontal.png",
  logoMarkUrl: "/images/logo-mark.png",
  faviconUrl: "/favicon.ico",
  ogImageUrl: "/images/og-image.png",
  appleTouchIconUrl: "/apple-touch-icon.png",
};

export const DEFAULT_SEO: SeoDefaults = {
  defaultTitle: "Unique Care UK | Home Care in London & Hertfordshire",
  titleTemplate: "%s",
  defaultDescription:
    "Professional domiciliary, live-in care, and supported living across London and Hertfordshire. Compassionate, personalised home care.",
  keywords: [
    "home care",
    "domiciliary care",
    "live-in care",
    "supported living",
    "London",
    "Hertfordshire",
    "Hackney",
    "dementia care",
    "palliative care",
    "care agency",
  ],
};

export const DEFAULT_CTA_BAND: CtaBandSettings = {
  title: "Ready to discuss care?",
  text: "Get a free, no-obligation assessment. We come to you at a time that suits.",
  primaryCta: { label: "Call us now", href: "tel:+442039170260" },
  secondaryCta: { label: "Send enquiry", href: "/contact" },
  image: "/images/hero-caregiver.jpg",
};

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const text = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v : fallback);

const COLOR_RE = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/-]+\))$/i;
const color = (v: unknown, fallback: string) => (typeof v === "string" && COLOR_RE.test(v.trim()) ? v.trim() : fallback);

export function normalizeTheme(raw: unknown): Theme {
  const r = obj(raw);
  if (!r) return { ...DEFAULT_THEME };
  const out = { ...DEFAULT_THEME };
  for (const k of Object.keys(DEFAULT_THEME) as (keyof Theme)[]) out[k] = color(r[k], DEFAULT_THEME[k]);
  return out;
}

export function normalizeBrand(raw: unknown): Brand {
  const r = obj(raw);
  if (!r) return { ...DEFAULT_BRAND };
  const out = { ...DEFAULT_BRAND };
  for (const k of Object.keys(DEFAULT_BRAND) as (keyof Brand)[]) out[k] = text(r[k], DEFAULT_BRAND[k]);
  return out;
}

export function normalizeSeo(raw: unknown): SeoDefaults {
  const r = obj(raw);
  if (!r) return { ...DEFAULT_SEO, keywords: [...DEFAULT_SEO.keywords] };
  const template = text(r.titleTemplate, DEFAULT_SEO.titleTemplate);
  const keywords = Array.isArray(r.keywords)
    ? r.keywords.filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    : [];
  return {
    defaultTitle: text(r.defaultTitle, DEFAULT_SEO.defaultTitle),
    titleTemplate: template.includes("%s") ? template : DEFAULT_SEO.titleTemplate,
    defaultDescription: text(r.defaultDescription, DEFAULT_SEO.defaultDescription),
    keywords: keywords.length ? keywords : [...DEFAULT_SEO.keywords],
  };
}

export function normalizeCta(raw: unknown, fallback: Cta): Cta {
  const r = obj(raw);
  if (!r) return { ...fallback };
  return { label: text(r.label, fallback.label), href: text(r.href, fallback.href) };
}

export function normalizeCtaBand(raw: unknown): CtaBandSettings {
  const r = obj(raw);
  if (!r) return { ...DEFAULT_CTA_BAND };
  return {
    title: text(r.title, DEFAULT_CTA_BAND.title),
    text: text(r.text, DEFAULT_CTA_BAND.text),
    primaryCta: normalizeCta(r.primaryCta, DEFAULT_CTA_BAND.primaryCta),
    secondaryCta: normalizeCta(r.secondaryCta, DEFAULT_CTA_BAND.secondaryCta),
    image: text(r.image, DEFAULT_CTA_BAND.image),
  };
}

const CSS_VAR_MAP: Record<keyof Theme, string> = {
  brandPrimary: "--brand-primary",
  brandPrimaryDark: "--brand-primary-dark",
  brandSecondary: "--brand-secondary",
  brandSoft: "--brand-soft",
  brandInk: "--brand-ink",
  brandGold: "--brand-gold",
  ink: "--ink",
  inkMuted: "--ink-muted",
  surface: "--surface",
  surfaceAlt: "--surface-alt",
  border: "--border",
  cqcGood: "--cqc-good",
};

/** Map a theme to CSS custom properties (e.g. `{ "--brand-primary": "#124b99" }`). */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(CSS_VAR_MAP) as (keyof Theme)[]) out[CSS_VAR_MAP[k]] = theme[k];
  return out;
}
