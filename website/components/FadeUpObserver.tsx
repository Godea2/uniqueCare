"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Toggles .in-view on .fade-up elements as they scroll in and out of view.
 * Elements animate on every entry (both scroll directions); on exit the
 * visible class is removed so re-entry replays the animation. An optional
 * data-stagger attribute (integer index) adds a per-item transition delay.
 * A MutationObserver picks up .fade-up nodes rendered after the initial
 * pass (e.g. client-side filtered lists).
 */
export default function FadeUpObserver() {
  const pathname = usePathname();
  useEffect(() => {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll<HTMLElement>(".fade-up").forEach((el) => el.classList.add("in-view"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          if (e.isIntersecting) {
            const stagger = el.getAttribute("data-stagger");
            if (stagger) {
              const i = Number.parseInt(stagger, 10);
              if (Number.isFinite(i) && i > 0) el.style.transitionDelay = `${Math.min(i, 12) * 90}ms`;
            }
            el.classList.add("in-view");
          } else {
            el.classList.remove("in-view");
          }
        }
      },
      { rootMargin: "0px 0px -40px 0px" }
    );
    const observeAll = () => {
      document.querySelectorAll<HTMLElement>(".fade-up").forEach((el) => io.observe(el));
    };
    observeAll();
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          if (n.classList.contains("fade-up")) io.observe(n);
          n.querySelectorAll<HTMLElement>(".fade-up").forEach((el) => io.observe(el));
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [pathname]);
  return null;
}
