import { cmsRows, str } from "@/lib/cms-rest";
import {
  FALLBACK_NAV,
  NAV_MENUS,
  type NavDropdown,
  type NavItem,
  type NavMenu,
} from "@/lib/nav-defaults";

export type { NavDropdown, NavItem, NavMenu } from "@/lib/nav-defaults";

type DbNav = {
  id: number | string;
  menu: string;
  label: string;
  href: string;
  dropdown: string | null;
  sort_order: number | null;
};

function isMenu(m: string): m is NavMenu {
  return (NAV_MENUS as string[]).includes(m);
}

async function fetchAll(): Promise<Partial<Record<NavMenu, NavItem[]>> | null> {
  const rows = await cmsRows<DbNav>(
    "website_nav_items",
    "visible=eq.true&select=id,menu,label,href,dropdown,sort_order&order=menu.asc,sort_order.asc&limit=200",
    ["website-nav"],
    "nav",
  );
  if (!rows || !rows.length) return null;
  const out: Partial<Record<NavMenu, NavItem[]>> = {};
  for (const r of rows) {
    if (!isMenu(r.menu) || !str(r.label) || !str(r.href)) continue;
    const dropdown: NavDropdown = r.dropdown === "services" || r.dropdown === "areas" ? r.dropdown : "";
    (out[r.menu] ??= []).push({
      id: String(r.id),
      menu: r.menu,
      label: r.label,
      href: r.href,
      dropdown,
      sortOrder: r.sort_order ?? 0,
    });
  }
  return out;
}

/**
 * Visible navigation items. Pass a menu (`header`, `footer_company`, `footer_legal`,
 * `mobile_cta`) for one menu, or omit for all menus. Any menu the CMS has no rows for
 * falls back to the hardcoded defaults matching the original Header / Footer / MobileCtaBar.
 */
export async function getNavItems(menu?: NavMenu | string): Promise<NavItem[]> {
  const db = await fetchAll();
  const pick = (m: NavMenu): NavItem[] => (db?.[m]?.length ? db[m]! : FALLBACK_NAV[m]);
  if (menu) return isMenu(menu) ? pick(menu) : [];
  return NAV_MENUS.flatMap(pick);
}
