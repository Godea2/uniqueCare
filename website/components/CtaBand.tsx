import Link from "next/link";
import Image from "next/image";
import { Phone } from "lucide-react";
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
      <div className="absolute inset-0 bg-gradient-to-r from-brand-primary-dark/90 to-brand-primary-dark/60" aria-hidden />
      <div className="relative mx-auto max-w-content px-4 py-16 text-center text-white">
        <h2 id="cta-band-heading" className="font-heading text-3xl font-semibold md:text-4xl">
          Ready to discuss care?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-white/85">
          Get a free, no-obligation assessment. We come to you at a time that suits.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <a
            href={site.phonePrimaryTel}
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-brand-primary-dark transition hover:bg-brand-soft"
          >
            <Phone className="h-4 w-4" aria-hidden /> Call us now
          </a>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full border-2 border-white px-6 py-3 font-semibold text-white transition hover:bg-white/10"
          >
            Send enquiry
          </Link>
        </div>
      </div>
    </section>
  );
}
