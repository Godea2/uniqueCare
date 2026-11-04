import { site as staticSite } from "@/content/site";
import {
  DEFAULT_BRAND,
  DEFAULT_CTA_BAND,
  DEFAULT_SEO,
  DEFAULT_THEME,
  normalizeBrand,
  normalizeCtaBand,
  normalizeSeo,
  normalizeTheme,
  type Brand,
  type CtaBandSettings,
  type SeoDefaults,
  type Theme,
} from "@/lib/theme-defaults";

export type SiteOffice = { name: string; address: string };
export type SiteSettings = {
  name: string;
  legalName: string;
  vat: string;
  founded: number;
  url: string;
  phonePrimary: string;
  phonePrimaryDisplay: string;
  phonePrimaryTel: string;
  phoneMobile: string;
  phoneMobileDisplay: string;
  phoneMobileTel: string;
  whatsapp: string;
  email: string;
  hours: string;
  offices: SiteOffice[];
  footerLocation: string;
  footerBlurb: string;
  cqcReportUrl: string;
  cqcRating: string;
  social: { facebook: string; instagram: string; linkedin: string };
  areas: string[];
  theme: Theme;
  brand: Brand;
  seo: SeoDefaults;
  ctaBand: CtaBandSettings;
  whatsappEnabled: boolean;
};

const base = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_URL ?? "";
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_ANON_KEY ?? "";

function fromStatic(): SiteSettings {
  return {
    name: staticSite.name,
    legalName: staticSite.legalName,
    vat: staticSite.vat,
    founded: staticSite.founded,
    url: staticSite.url,
    phonePrimary: staticSite.phonePrimary,
    phonePrimaryDisplay: staticSite.phonePrimaryDisplay,
    phonePrimaryTel: staticSite.phonePrimaryTel,
    phoneMobile: staticSite.phoneMobile,
    phoneMobileDisplay: staticSite.phoneMobileDisplay,
    phoneMobileTel: staticSite.phoneMobileTel,
    whatsapp: staticSite.whatsapp,
    email: staticSite.email,
    hours: staticSite.hours,
    offices: staticSite.offices.map((o) => ({ name: o.name, address: o.address })),
    footerLocation: staticSite.footerLocation,
    footerBlurb:
      "ISO 9001 & ISO 45001 certified home care provider. Compassionate, personalised care across London, Essex, and Hertfordshire since 2017.",
    cqcReportUrl: staticSite.cqcReportUrl,
    cqcRating: staticSite.cqcRating,
    social: { ...staticSite.social },
    areas: [...staticSite.areas],
    theme: { ...DEFAULT_THEME },
    brand: { ...DEFAULT_BRAND },
    seo: { ...DEFAULT_SEO, keywords: [...DEFAULT_SEO.keywords] },
    ctaBand: { ...DEFAULT_CTA_BAND },
    whatsappEnabled: true,
  };
}

function merge(payload: Record<string, unknown> | null | undefined): SiteSettings {
  const fallback = fromStatic();
  if (!payload || typeof payload !== "object") return fallback;
  const offices = Array.isArray(payload.offices)
    ? payload.offices
        .map((o) => {
          if (!o || typeof o !== "object") return null;
          const row = o as Record<string, unknown>;
          const name = typeof row.name === "string" ? row.name : "";
          const address = typeof row.address === "string" ? row.address : "";
          return name && address ? { name, address } : null;
        })
        .filter(Boolean) as SiteOffice[]
    : fallback.offices;
  const social = payload.social && typeof payload.social === "object"
    ? {
        facebook: String((payload.social as Record<string, unknown>).facebook ?? fallback.social.facebook),
        instagram: String((payload.social as Record<string, unknown>).instagram ?? fallback.social.instagram),
        linkedin: String((payload.social as Record<string, unknown>).linkedin ?? fallback.social.linkedin),
      }
    : fallback.social;
  return {
    ...fallback,
    name: typeof payload.name === "string" ? payload.name : fallback.name,
    legalName: typeof payload.legalName === "string" ? payload.legalName : fallback.legalName,
    vat: typeof payload.vat === "string" ? payload.vat : fallback.vat,
    founded: typeof payload.founded === "number" ? payload.founded : fallback.founded,
    url: typeof payload.url === "string" ? payload.url : fallback.url,
    phonePrimary: typeof payload.phonePrimary === "string" ? payload.phonePrimary : fallback.phonePrimary,
    phonePrimaryDisplay:
      typeof payload.phonePrimaryDisplay === "string" ? payload.phonePrimaryDisplay : fallback.phonePrimaryDisplay,
    phonePrimaryTel: typeof payload.phonePrimaryTel === "string" ? payload.phonePrimaryTel : fallback.phonePrimaryTel,
    phoneMobile: typeof payload.phoneMobile === "string" ? payload.phoneMobile : fallback.phoneMobile,
    phoneMobileDisplay:
      typeof payload.phoneMobileDisplay === "string" ? payload.phoneMobileDisplay : fallback.phoneMobileDisplay,
    phoneMobileTel: typeof payload.phoneMobileTel === "string" ? payload.phoneMobileTel : fallback.phoneMobileTel,
    whatsapp: typeof payload.whatsapp === "string" ? payload.whatsapp : fallback.whatsapp,
    email: typeof payload.email === "string" ? payload.email : fallback.email,
    hours: typeof payload.hours === "string" ? payload.hours : fallback.hours,
    offices,
    footerLocation: typeof payload.footerLocation === "string" ? payload.footerLocation : fallback.footerLocation,
    footerBlurb: typeof payload.footerBlurb === "string" ? payload.footerBlurb : fallback.footerBlurb,
    cqcReportUrl: typeof payload.cqcReportUrl === "string" ? payload.cqcReportUrl : fallback.cqcReportUrl,
    cqcRating: typeof payload.cqcRating === "string" ? payload.cqcRating : fallback.cqcRating,
    social,
    areas: Array.isArray(payload.areas) ? payload.areas.map(String) : fallback.areas,
    theme: normalizeTheme(payload.theme),
    brand: normalizeBrand(payload.brand),
    seo: normalizeSeo(payload.seo),
    ctaBand: normalizeCtaBand(payload.ctaBand),
    whatsappEnabled: typeof payload.whatsappEnabled === "boolean" ? payload.whatsappEnabled : fallback.whatsappEnabled,
  };
}

/** Live site settings from CMS, falling back to static `content/site.ts`. */
export async function getSiteSettings(): Promise<SiteSettings> {
  if (!base() || !anonKey()) return fromStatic();
  try {
    const res = await fetch(
      `${base()}/rest/v1/website_site_settings?id=eq.default&select=payload&limit=1`,
      {
        headers: { apikey: anonKey(), Authorization: `Bearer ${anonKey()}` },
        next: { revalidate: 60, tags: ["website-cms", "website-site"] },
      },
    );
    if (!res.ok) return fromStatic();
    const rows = (await res.json()) as { payload?: Record<string, unknown> }[];
    return merge(rows[0]?.payload);
  } catch (e) {
    console.warn("[site] CMS settings fetch failed:", e instanceof Error ? e.message : e);
    return fromStatic();
  }
}

export async function getYearsOfCare(): Promise<number> {
  const s = await getSiteSettings();
  return Math.max(1, new Date().getFullYear() - (s.founded || staticSite.founded));
}
