import { getSiteSettings } from "@/lib/site-source";
import type { Brand, CtaBandSettings, SeoDefaults, Theme } from "@/lib/theme-defaults";

export {
  DEFAULT_BRAND,
  DEFAULT_CTA_BAND,
  DEFAULT_SEO,
  DEFAULT_THEME,
  themeToCssVars,
} from "@/lib/theme-defaults";
export type { Brand, Cta, CtaBandSettings, SeoDefaults, Theme } from "@/lib/theme-defaults";

/** Design tokens from CMS site settings (defaults match globals.css). */
export async function getTheme(): Promise<Theme> {
  return (await getSiteSettings()).theme;
}

/** Logo / favicon / OG image URLs (defaults match current /public assets). */
export async function getBrand(): Promise<Brand> {
  return (await getSiteSettings()).brand;
}

export async function getSeoDefaults(): Promise<SeoDefaults> {
  return (await getSiteSettings()).seo;
}

export async function getCtaBand(): Promise<CtaBandSettings> {
  return (await getSiteSettings()).ctaBand;
}
