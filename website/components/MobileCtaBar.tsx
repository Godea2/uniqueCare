"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Phone } from "lucide-react";
import { resolveNavHref, type NavItem } from "@/lib/nav-defaults";

/**
 * Fixed bottom CTA bar on small screens. Hides while the enquiry form
 * section (#contact-form) is in view so the two never compete.
 * Items come from the CMS `mobile_cta` menu only.
 */
export default function MobileCtaBar({
  items,
  phoneTel = "tel:+442039170260",
}: {
  items?: Pick<NavItem, "label" | "href">[];
  /** Resolves blank/placeholder `tel:` hrefs. */
  phoneTel?: string;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const target = document.getElementById("contact-form");
    if (!target) return;
    const io = new IntersectionObserver(([entry]) => setHidden(entry.isIntersecting), {
      threshold: 0.12,
    });
    io.observe(target);
    return () => io.disconnect();
  }, []);

  const list = (items ?? [])
    .slice(0, 3)
    .map((i) => ({ label: i.label, href: resolveNavHref(i.href, phoneTel) }));

  if (list.length === 0) return null;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-lift backdrop-blur transition md:hidden ${
        hidden ? "invisible translate-y-full pointer-events-none" : "visible"
      }`}
      aria-hidden={hidden}
    >
      <div
        className="mx-auto grid max-w-content gap-2.5"
        style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}
      >
        {list.map((item) => {
          const isTel = item.href.startsWith("tel:");
          if (isTel) {
            return (
              <a
                key={`${item.label}-${item.href}`}
                href={item.href}
                aria-label={item.label}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border-2 border-brand-primary px-3 py-2.5 text-sm font-semibold text-brand-primary"
              >
                <Phone className="h-4 w-4 shrink-0" aria-hidden />
                <span>{item.label}</span>
              </a>
            );
          }
          const internal = item.href.startsWith("/") && !item.href.startsWith("//");
          const content = (
            <>
              <span>{item.label}</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </>
          );
          return internal ? (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              aria-label={item.label}
              className="uc-btn-primary min-h-11 px-3 py-2.5 text-sm"
            >
              {content}
            </Link>
          ) : (
            <a
              key={`${item.label}-${item.href}`}
              href={item.href}
              aria-label={item.label}
              className="uc-btn-primary min-h-11 px-3 py-2.5 text-sm"
            >
              {content}
            </a>
          );
        })}
      </div>
    </div>
  );
}
