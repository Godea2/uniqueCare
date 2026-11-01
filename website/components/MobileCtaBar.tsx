"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Phone } from "lucide-react";
import { site } from "@/content/site";

/**
 * Fixed bottom CTA bar on small screens. Hides while the enquiry form
 * section (#contact-form) is in view so the two never compete.
 */
export default function MobileCtaBar() {
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

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-lift backdrop-blur transition md:hidden ${
        hidden ? "invisible translate-y-full pointer-events-none" : "visible"
      }`}
      aria-hidden={hidden}
    >
      <div className="mx-auto grid max-w-content grid-cols-2 gap-2.5">
        <a
          href={site.phonePrimaryTel}
          aria-label="Call us"
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border-2 border-brand-primary px-3 py-2.5 text-sm font-semibold text-brand-primary"
        >
          <Phone className="h-4 w-4 shrink-0" aria-hidden />
          <span>Call us</span>
        </a>
        <Link
          href="/contact"
          aria-label="Book a free assessment"
          className="uc-btn-primary min-h-11 px-3 py-2.5 text-sm"
        >
          <span>Book now</span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
