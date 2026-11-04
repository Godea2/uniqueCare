import Image from "next/image";
import { ArrowRight, Phone } from "lucide-react";
import CtaLink from "@/components/CtaLink";
import { DEFAULT_CTA_BAND, type CtaBandSettings } from "@/lib/theme-defaults";

export default function CtaBand({
  cta = DEFAULT_CTA_BAND,
  phoneTel,
}: {
  cta?: CtaBandSettings;
  /** Used when a CTA href is a blank `tel:` placeholder. */
  phoneTel?: string;
}) {
  const resolve = (href: string) => (/^tel:?$/i.test(href.trim()) && phoneTel ? phoneTel : href);
  const primaryHref = resolve(cta.primaryCta.href);
  const secondaryHref = resolve(cta.secondaryCta.href);
  const icon = (href: string) =>
    href.startsWith("tel:") ? <Phone className="h-4 w-4" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />;
  const remote = /^https?:\/\//i.test(cta.image);

  return (
    <section aria-labelledby="cta-band-heading" className="relative overflow-hidden">
      <Image
        src={cta.image}
        alt=""
        fill
        sizes="100vw"
        unoptimized={remote}
        className="object-cover"
      />
      <div
        className="absolute inset-0 bg-gradient-to-r from-brand-ink/95 via-brand-ink/85 to-brand-primary-dark/70"
        aria-hidden
      />
      <div className="relative mx-auto max-w-content px-4 py-16 text-center text-white lg:py-20">
        <div className="fade-up">
        <h2 id="cta-band-heading" className="font-heading font-semibold">
          {cta.title}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-white/85">{cta.text}</p>
        <div className="uc-cta-row uc-cta-row-center mt-7">
          <CtaLink
            href={primaryHref}
            ariaLabel={cta.primaryCta.label}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-brand-ink transition hover:-translate-y-0.5 hover:bg-brand-soft"
          >
            {primaryHref.startsWith("tel:") && icon(primaryHref)} {cta.primaryCta.label}
          </CtaLink>
          <CtaLink href={secondaryHref} ariaLabel={cta.secondaryCta.label} className="uc-btn-outline">
            {cta.secondaryCta.label} {icon(secondaryHref)}
          </CtaLink>
        </div>
        </div>
      </div>
    </section>
  );
}
