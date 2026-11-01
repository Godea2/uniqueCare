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
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-lift backdrop-blur transition md:hidden ${
        hidden ? "invisible translate-y-full" : "visible"
      }`}
      aria-hidden={hidden}
    >
      <div className="flex items-center gap-3">
        <a
          href={site.phonePrimaryTel}
          aria-label="Call us"
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full border-2 border-brand-primary px-4 py-2.5 text-[15px] font-semibold text-brand-primary"
        >
          <Phone className="h-4 w-4" aria-hidden /> Call us
        </a>
        <Link
          href="/contact"
          aria-label="Book a free assessment"
          className="uc-btn-primary min-h-[44px] flex-1 px-4 py-2.5 text-[15px]"
        >
          Book a free assessment <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
