/** Navigation types + hardcoded fallbacks (no I/O; safe for client components). */

export type NavMenu = "header" | "footer_company" | "footer_legal" | "mobile_cta";
export type NavDropdown = "" | "services" | "areas";

export type NavItem = {
  id: string;
  menu: NavMenu;
  label: string;
  href: string;
  dropdown: NavDropdown;
  sortOrder: number;
};

export const NAV_MENUS: NavMenu[] = ["header", "footer_company", "footer_legal", "mobile_cta"];

/** Empty — navigation is managed in the portal (Website → Navigation). */
export const FALLBACK_NAV: Record<NavMenu, NavItem[]> = {
  header: [],
  footer_company: [],
  footer_legal: [],
  mobile_cta: [],
};

/** `tel:` links that are blank / placeholders get resolved from site settings. */
export function resolveNavHref(href: string, phoneTel: string): string {
  const h = href.trim();
  if (h === "" || h === "tel:" || h === "tel" || h === "{phone}" || h === "{{phone}}") return phoneTel;
  return h;
}
