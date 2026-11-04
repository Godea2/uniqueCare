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

const item = (menu: NavMenu, label: string, href: string, i: number, dropdown: NavDropdown = ""): NavItem => ({
  id: `${menu}-${i}`,
  menu,
  label,
  href,
  dropdown,
  sortOrder: (i + 1) * 10,
});

export const FALLBACK_NAV: Record<NavMenu, NavItem[]> = {
  header: [
    item("header", "Home", "/", 0),
    item("header", "About", "/about", 1),
    item("header", "Services", "/services", 2, "services"),
    item("header", "Areas We Serve", "/areas", 3, "areas"),
    item("header", "Careers", "/careers", 4),
    item("header", "Blog", "/blog", 5),
    item("header", "Reviews", "/reviews", 6),
  ],
  footer_company: [
    item("footer_company", "About us", "/about", 0),
    item("footer_company", "Reviews", "/reviews", 1),
    item("footer_company", "Careers", "/careers", 2),
    item("footer_company", "Blog & news", "/blog", 3),
    item("footer_company", "Contact", "/contact", 4),
  ],
  footer_legal: [
    item("footer_legal", "Privacy Policy", "/privacy", 0),
    item("footer_legal", "Terms of Service", "/terms", 1),
    item("footer_legal", "Modern Slavery Statement", "/modern-slavery", 2),
    item("footer_legal", "Carbon Reduction Plan", "/carbon-reduction-plan", 3),
  ],
  mobile_cta: [
    item("mobile_cta", "Call us", "tel:+442039170260", 0),
    item("mobile_cta", "Book now", "/contact", 1),
  ],
};

/** `tel:` links that are blank / placeholders get resolved from site settings. */
export function resolveNavHref(href: string, phoneTel: string): string {
  const h = href.trim();
  if (h === "" || h === "tel:" || h === "tel" || h === "{phone}" || h === "{{phone}}") return phoneTel;
  return h;
}
