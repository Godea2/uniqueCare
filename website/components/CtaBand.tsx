import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Phone } from "lucide-react";
import { site } from "@/content/site";

export default function CtaBand() {
  return (
    <section aria-labelledby="cta-band-heading" className="relative overflow-hidden">
      <Image
        src="/images/hero-caregiver.jpg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover"
      />
      <div
        className="absolute inset-0 bg-gradient-to-r from-brand-ink/95 via-brand-ink/85 to-brand-primary-dark/70"
        aria-hidden
      />
      <div className="relative mx-auto max-w-content px-4 py-16 text-center text-white lg:py-20">
        <div className="fade-up">
        <h2 id="cta-band-heading" className="font-heading font-semibold">
          Ready to discuss care?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-white/85">
          Get a free, no-obligation assessment. We come to you at a time that suits.
        </p>
        <div className="uc-cta-row uc-cta-row-center mt-7">
          <a
            href={site.phonePrimaryTel}
            aria-label="Call us now"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-brand-ink transition hover:-translate-y-0.5 hover:bg-brand-soft"
          >
            <Phone className="h-4 w-4" aria-hidden /> Call us now
          </a>
          <Link href="/contact" aria-label="Send enquiry" className="uc-btn-outline">
            Send enquiry <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        </div>
      </div>
    </section>
  );
}
