"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Mail, Menu, Phone, X } from "lucide-react";
import { services } from "@/content/services";
import { areas } from "@/content/areas";
import { site } from "@/content/site";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/services", label: "Services", dropdown: "services" as const },
  { href: "/areas", label: "Areas We Serve", dropdown: "areas" as const },
  { href: "/careers", label: "Careers" },
  { href: "/blog", label: "Blog" },
  { href: "/reviews", label: "Reviews" },
];

export default function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [accordions, setAccordions] = useState<Record<string, boolean>>({});
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // close drawer on route change + lock body scroll
  useEffect(() => {
    setDrawer(false);
    setOpenMenu(null);
  }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  // close on Esc + simple focus containment
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
      if (e.key === "Tab" && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>("a[href], button");
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const openDropdown = (key: string) => {
    clearTimeout(menuTimeout.current);
    setOpenMenu(key);
  };
  const closeDropdown = () => {
    clearTimeout(menuTimeout.current);
    menuTimeout.current = setTimeout(() => setOpenMenu(null), 150);
  };

  const dropdownItems = (kind: "services" | "areas") =>
    kind === "services"
      ? [
          ...services.map((s) => ({ href: `/services/${s.slug}`, label: s.name })),
          { href: "/services", label: "View all services" },
        ]
      : [
          ...areas.map((a) => ({ href: `/areas/${a.slug}`, label: a.name })),
          { href: "/areas", label: "All areas" },
        ];

  return (
    <>
      {/* Top utility bar */}
      <div className="bg-brand-primary-dark text-white">
        <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-4 py-1.5 text-[13px]">
          <div className="flex items-center gap-5">
            <a href={site.phonePrimaryTel} className="flex items-center gap-1.5 hover:underline">
              <Phone className="h-3.5 w-3.5" aria-hidden /> {site.phonePrimary}
            </a>
            <a href={site.phoneMobileTel} className="hidden items-center gap-1.5 hover:underline sm:flex">
              <Phone className="h-3.5 w-3.5" aria-hidden /> {site.phoneMobile}
            </a>
          </div>
          <a href={`mailto:${site.email}`} className="flex items-center gap-1.5 hover:underline">
            <Mail className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">{site.email}</span>
            <span className="sm:hidden">Email us</span>
          </a>
        </div>
      </div>

      {/* Main header */}
      <header
        className={`sticky top-0 z-50 bg-white transition-shadow ${scrolled ? "shadow-card" : ""}`}
      >
        <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-4 py-3">
          <Link href="/" aria-label="Unique Care UK — home" className="shrink-0">
            <Image
              src="/images/logo-horizontal.png"
              alt="Unique Care UK"
              width={340}
              height={96}
              priority
              className="h-11 w-auto md:h-12"
            />
          </Link>

          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => (
                <li
                  key={item.href}
                  className="relative"
                  onMouseEnter={item.dropdown ? () => openDropdown(item.dropdown!) : undefined}
                  onMouseLeave={item.dropdown ? closeDropdown : undefined}
                >
                  {item.dropdown ? (
                    <>
                      <button
                        type="button"
                        aria-expanded={openMenu === item.dropdown}
                        aria-haspopup="true"
                        onClick={() => setOpenMenu(openMenu === item.dropdown ? null : item.dropdown!)}
                        onFocus={() => openDropdown(item.dropdown!)}
                        onBlur={closeDropdown}
                        className={`flex items-center gap-1 rounded-full px-3.5 py-2 text-[15px] font-medium transition-colors hover:bg-brand-soft ${
                          isActive(item.href) ? "text-brand-primary" : "text-ink"
                        }`}
                      >
                        {item.label}
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      </button>
                      {openMenu === item.dropdown && (
                        <div
                          className="absolute left-0 top-full w-64 rounded-card border border-line bg-white p-2 shadow-card-hover"
                          onMouseEnter={() => openDropdown(item.dropdown!)}
                          onMouseLeave={closeDropdown}
                        >
                          <ul>
                            {dropdownItems(item.dropdown).map((d, i) => (
                              <li key={d.href}>
                                <Link
                                  href={d.href}
                                  onBlur={i === dropdownItems(item.dropdown!).length - 1 ? closeDropdown : undefined}
                                  className={`block rounded-lg px-3 py-2 text-sm hover:bg-brand-soft ${
                                    i === dropdownItems(item.dropdown!).length - 1
                                      ? "font-semibold text-brand-primary"
                                      : "text-ink"
                                  }`}
                                >
                                  {d.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      href={item.href}
                      aria-current={isActive(item.href) ? "page" : undefined}
                      className={`block rounded-full px-3.5 py-2 text-[15px] font-medium transition-colors hover:bg-brand-soft ${
                        isActive(item.href) ? "text-brand-primary" : "text-ink"
                      }`}
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={site.phonePrimaryTel}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line text-brand-primary lg:hidden"
              aria-label={`Call us on ${site.phonePrimaryDisplay}`}
            >
              <Phone className="h-5 w-5" aria-hidden />
            </a>
            <Link
              href="/contact"
              className="hidden rounded-full bg-brand-primary px-5 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-primary-dark sm:inline-flex"
            >
              Get in Touch
            </Link>
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line lg:hidden"
              aria-expanded={drawer}
              aria-label={drawer ? "Close menu" : "Open menu"}
              onClick={() => setDrawer((v) => !v)}
            >
              {drawer ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} aria-hidden />
          <div
            ref={drawerRef}
            className="absolute right-0 top-0 flex h-full w-[85%] max-w-sm flex-col overflow-y-auto bg-white shadow-card-hover"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <Image src="/images/logo-horizontal.png" alt="Unique Care UK" width={170} height={48} className="h-9 w-auto" />
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line"
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <nav aria-label="Mobile" className="flex-1 px-5 py-4">
              <ul className="space-y-1">
                {NAV.map((item) =>
                  item.dropdown ? (
                    <li key={item.href}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-[15px] font-medium"
                        aria-expanded={Boolean(accordions[item.dropdown!])}
                        onClick={() =>
                          setAccordions((a) => ({ ...a, [item.dropdown!]: !a[item.dropdown!] }))
                        }
                      >
                        {item.label}
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${accordions[item.dropdown!] ? "rotate-180" : ""}`}
                          aria-hidden
                        />
                      </button>
                      {accordions[item.dropdown!] && (
                        <ul className="ml-3 border-l border-line pl-3">
                          {dropdownItems(item.dropdown).map((d) => (
                            <li key={d.href}>
                              <Link href={d.href} className="block rounded-lg px-3 py-2.5 text-sm text-ink-muted hover:text-brand-primary">
                                {d.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ) : (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive(item.href) ? "page" : undefined}
                        className={`block rounded-lg px-3 py-3 text-[15px] font-medium ${
                          isActive(item.href) ? "text-brand-primary" : "text-ink"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  )
                )}
              </ul>
            </nav>
            <div className="space-y-2 border-t border-line px-5 py-4">
              <Link
                href="/contact"
                className="block rounded-full bg-brand-primary px-5 py-3 text-center text-[15px] font-semibold text-white"
              >
                Get in Touch
              </Link>
              <a
                href={site.phonePrimaryTel}
                className="flex items-center justify-center gap-2 rounded-full border border-line px-5 py-3 text-[15px] font-semibold text-brand-primary"
              >
                <Phone className="h-4 w-4" aria-hidden /> Call {site.phonePrimaryDisplay}
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
