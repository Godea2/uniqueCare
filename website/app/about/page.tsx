import type { Metadata } from "next";
import { ArrowRight, Brain, Heart, HeartHandshake, Phone, Sparkles, Users, Zap } from "lucide-react";
import HeroVideo from "@/components/HeroVideo";
import CtaLink from "@/components/CtaLink";
import { iconByName } from "@/components/CmsIcon";
import { asCta, asItems, asString, asStrings, getSectionMap } from "@/lib/sections-source";
import { getSiteSettings } from "@/lib/site-source";

export const metadata: Metadata = {
  title: "About Us | ISO Certified Home Care Provider Since 2017 | Unique Care UK",
  description:
    "Unique Care UK is an ISO 9001 and ISO 45001 certified home care provider serving London, Essex, and Hertfordshire since 2017. CQC rated Good.",
  alternates: { canonical: "/about" },
};

export const revalidate = 60;

const SUPPORT_ICONS = [HeartHandshake, Brain, Users, Sparkles, Zap, Heart];

export default async function AboutPage() {
  const [site, sections] = await Promise.all([getSiteSettings(), getSectionMap("about")]);
  const heroS = sections.hero ?? null;
  const whoS = sections.who_we_are ?? null;
  const supportS = sections.who_we_support ?? null;
  const driversS = sections.drivers ?? null;
  const ctaS = sections.cta ?? null;

  const heroVideo = asString(heroS, "videoSrc", "/videos/care-at-home.mp4");
  const heroPoster = asString(heroS, "poster", "/images/about-hero.jpg");

  const whoParagraphs = asStrings(whoS, "paragraphs");

  const support = asItems(supportS)
    .map((s) => ({ label: asString(s, "label", ""), thumb: asString(s, "thumb", "") }))
    .filter((s) => s.label);

  const drivers = asItems(driversS)
    .map((d) => ({
      title: asString(d, "title", ""),
      text: asString(d, "text", ""),
      icon: iconByName(d.icon, Heart),
      thumb: asString(d, "thumb", ""),
    }))
    .filter((d) => d.title);

  const ctaPrimary = asCta(ctaS, "primaryCta", { label: "Book a free assessment", href: "/contact" });
  const ctaSecondary = asCta(ctaS, "secondaryCta", { label: "Call us now", href: site.phonePrimaryTel });

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden" aria-labelledby="about-h">
        <HeroVideo src={heroVideo} poster={heroPoster} />
        <div className="relative mx-auto max-w-content px-4 py-20 md:py-28">
          <div className="fade-up max-w-2xl text-white">
            <span className="inline-block rounded-full bg-brand-secondary px-4 py-1.5 text-xs font-semibold uppercase tracking-wide">
              {asString(heroS, "eyebrow", `Est. ${site.founded}`)}
            </span>
            <h1 id="about-h" className="mt-5 font-heading text-4xl font-semibold md:text-5xl">
              {asString(heroS, "title", `About ${site.name}`)}
            </h1>
            <p className="mt-4 text-lg text-white/90">
              {asString(
                heroS,
                "subtitle",
                "Dedicated to providing exceptional care in the comfort of your own home, across London, Essex, and Hertfordshire.",
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Who we are */}
      {whoParagraphs.length > 0 && (
        <section aria-labelledby="who-we-are-h" className="mx-auto max-w-content px-4 py-16 lg:py-24">
          <div className="fade-up">
            <h2 id="who-we-are-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
              {asString(whoS, "title", "Who we are")}
            </h2>
            <div className="prose-legal mt-5">
              {whoParagraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Who we support */}
      {support.length > 0 && (
        <section aria-labelledby="who-we-support-h" className="bg-surface-alt">
          <div className="mx-auto max-w-content px-4 py-16 lg:py-24">
            <div className="fade-up">
              {asString(supportS, "eyebrow", "") && <p className="eyebrow">{asString(supportS, "eyebrow", "")}</p>}
              <h2 id="who-we-support-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
                {asString(supportS, "title", "Who we support")}
              </h2>
              <p className="mt-3 text-ink-muted">
                {asString(supportS, "subtitle", "We provide care for a wide range of individuals with diverse needs.")}
              </p>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {support.map((w, i) => {
                const Icon = SUPPORT_ICONS[i % SUPPORT_ICONS.length]!;
                return (
                  <div key={w.label} className="fade-up uc-card flex items-center gap-4 p-5" data-stagger={i}>
                    {w.thumb && (
                      <img
                        src={w.thumb}
                        alt=""
                        loading="lazy"
                        className="h-24 w-24 shrink-0 rounded-2xl object-cover"
                      />
                    )}
                    <span className="uc-icon h-12 w-12 shrink-0">
                      <Icon aria-hidden />
                    </span>
                    <p className="font-medium text-ink">{w.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* What drives us */}
      {drivers.length > 0 && (
        <section aria-labelledby="drives-h" className="mx-auto max-w-content px-4 py-16 lg:py-24">
          {asString(driversS, "eyebrow", "") && (
            <p className="eyebrow fade-up">{asString(driversS, "eyebrow", "")}</p>
          )}
          <h2 id="drives-h" className="fade-up font-heading text-3xl font-semibold text-ink md:text-4xl">
            {asString(driversS, "title", "What drives us")}
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {drivers.map((d, i) => (
              <div key={d.title} className="fade-up uc-card overflow-hidden" data-stagger={i}>
                {d.thumb && <img src={d.thumb} alt="" loading="lazy" className="h-44 w-full object-cover" />}
                <div className="p-6">
                  <span className="uc-icon h-14 w-14">
                    <d.icon aria-hidden />
                  </span>
                  <h3 className="mt-4 font-heading text-xl font-semibold text-ink">{d.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{d.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section aria-labelledby="about-cta-h" className="bg-brand-soft">
        <div className="fade-up mx-auto max-w-content px-4 py-16 text-center">
          <h2 id="about-cta-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
            {asString(ctaS, "title", "Ready to discuss care?")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            {asString(ctaS, "text", "Book a free, no-obligation assessment. We'll come to you at a time that suits.")}
          </p>
          <div className="uc-cta-row uc-cta-row-center mt-7">
            <CtaLink href={ctaPrimary.href} ariaLabel={ctaPrimary.label} className="uc-btn-primary">
              {ctaPrimary.label} <ArrowRight className="h-4 w-4" aria-hidden />
            </CtaLink>
            <CtaLink
              href={ctaSecondary.href}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-brand-primary px-6 py-3.5 font-semibold text-brand-primary transition hover:bg-white"
            >
              {ctaSecondary.href.startsWith("tel:") && <Phone className="h-4 w-4" aria-hidden />} {ctaSecondary.label}
            </CtaLink>
          </div>
        </div>
      </section>
    </>
  );
}
