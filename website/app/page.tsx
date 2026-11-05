import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Award, Clock3, Heart, MapPin, Phone, ShieldCheck, Users } from "lucide-react";
import { getAllPosts, isRemoteImage } from "@/lib/posts-source";
import { getServices } from "@/lib/services-source";
import { getAreas } from "@/lib/areas-source";
import { getSiteSettings, getYearsOfCare } from "@/lib/site-source";
import { asCta, asItems, asString, asStrings, getSectionMap } from "@/lib/sections-source";
import { getCertifications } from "@/lib/certifications-source";
import { getApprovedReviews } from "@/lib/supabase";
import { organizationJsonLd, JsonLd } from "@/lib/jsonld";
import ServiceCard from "@/components/ServiceCard";
import CertificationGrid from "@/components/CertificationGrid";
import CtaLink from "@/components/CtaLink";
import { iconByName } from "@/components/CmsIcon";
import HeroVideo from "@/components/HeroVideo";
import TestimonialCarousel, { type CarouselReview } from "@/components/TestimonialCarousel";

export const metadata: Metadata = {
  title: "Unique Care UK | Home Care in London & Hertfordshire",
  description:
    "Professional domiciliary, live-in care, and supported living across London and Hertfordshire. Compassionate, personalised home care.",
  alternates: { canonical: "/" },
  openGraph: {
    images: [{ url: "/images/hero-caregiver.jpg", width: 1200, height: 630, alt: "Unique Care UK" }],
  },
  twitter: { card: "summary_large_image" },
};

export const revalidate = 300;

const DEFAULT_HERO_VIDEOS = [
  "/videos/hero-home-care.mp4",
  "/videos/personal-care.mp4",
  "/videos/companionship.mp4",
  "/videos/complex-care.mp4",
  "/videos/home-support.mp4",
];

function heroVideos(c: Record<string, unknown> | null): string[] {
  const list = asStrings(c, "videos");
  if (list.length > 0) return list;
  const single = asString(c, "videoSrc", "");
  return single ? [single] : DEFAULT_HERO_VIDEOS;
}

/** Image that may be a remote CMS URL (not in next/image remotePatterns) or a local /public path. */
const remote = (src: string) => /^https?:\/\//i.test(src);

export default async function HomePage() {
  const [dbReviews, posts, services, areas, site, yearsOfCare, sections, certs] = await Promise.all([
    getApprovedReviews(),
    getAllPosts(),
    getServices(),
    getAreas(),
    getSiteSettings(),
    getYearsOfCare(),
    getSectionMap("home"),
    getCertifications(),
  ]);
  const heroSection = sections.hero ?? null;
  const whySection = sections.why_us ?? null;
  const whySide = sections.why_side ?? null;
  const statsSection = sections.stats ?? null;
  const servicesIntro = sections.services_intro ?? null;
  const certsIntro = sections.certs_intro ?? null;
  const testimonialsIntro = sections.testimonials_intro ?? null;
  const areasIntro = sections.areas_intro ?? null;
  const closing = sections.closing_cta ?? null;
  const reviews: CarouselReview[] = dbReviews.map((r) => ({
    id: r.id,
    name: r.name,
    relationship: r.relationship,
    rating: r.rating,
    title: r.title,
    body: r.body,
  }));

  const hero = {
    eyebrow: String(heroSection?.eyebrow ?? "ISO certified care provider"),
    title: String(heroSection?.title ?? "Exceptional care in the comfort of your home"),
    subtitle: String(heroSection?.subtitle ?? "Care that meets the standard. Compassion that exceeds it."),
    text: String(
      heroSection?.text ?? "Trusted CQC-rated home care provider, ISO 9001 & 45001 certified for quality and safety.",
    ),
    videos: heroVideos(heroSection),
    poster: asString(heroSection, "poster", "/images/hero-caregiver.jpg"),
    primaryCta: asCta(heroSection, "primaryCta", { label: "Book a free assessment", href: "/contact" }),
    secondaryCta: asCta(heroSection, "secondaryCta", { label: "Call us", href: site.phonePrimaryTel }),
  };

  const whyRaw = asItems(whySection);
  const whyItems = whyRaw.map((item) => ({
    title: asString(item, "title", ""),
    text: asString(item, "text", ""),
    icon: iconByName(item.icon, Heart),
    thumb: asString(item, "thumb", ""),
  })).filter((w) => w.title);

  const whySideImage = asString(whySide, "image", "/images/why-choose-us.jpg");
  const closingImage = asString(closing, "image", "/images/live-in-care.jpg");
  const closingPrimary = asCta(closing, "primaryCta", { label: "Book a free assessment", href: "/contact" });
  const closingSecondary = asCta(closing, "secondaryCta", { label: "View careers", href: "/careers" });

  const statIcons = [Award, Clock3, Users, ShieldCheck];
  const stats = asItems(statsSection).map((s, i) => {
    let figure = asString(s, "label", "");
    // Keep the "N+ years" figure live rather than a stale number typed into the CMS.
    if (/^\d+\+?\s*years?$/i.test(figure.trim())) figure = `${yearsOfCare}+ years`;
    return { icon: iconByName(s.icon, statIcons[i % statIcons.length]), figure, label: asString(s, "text", "") };
  }).filter((s) => s.figure || s.label);
  const statsGrid =
    stats.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : stats.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";

  return (
    <>
      <JsonLd data={organizationJsonLd(site)} />

      {/* 1. Hero */}
      <section className="relative overflow-hidden" aria-labelledby="home-hero-h">
        <HeroVideo
          src={hero.videos[0] ?? "/videos/hero-home-care.mp4"}
          poster={hero.poster}
          sources={hero.videos}
        />
        <div className="relative mx-auto max-w-content px-4 py-24 md:py-32">
          <div className="fade-up max-w-2xl text-white">
            <span className="inline-block rounded-full bg-brand-secondary px-4 py-1.5 text-xs font-semibold uppercase tracking-wide">
              {hero.eyebrow}
            </span>
            <h1 id="home-hero-h" className="mt-5 font-heading font-semibold">
              {hero.title}
            </h1>
            <p className="mt-4 font-heading text-xl text-white/90 md:text-2xl">
              {hero.subtitle}
            </p>
            <p className="mt-3 text-white/85 md:text-lg">
              {hero.text}
            </p>
            <div className="uc-cta-row mt-8">
              <CtaLink href={hero.primaryCta.href} ariaLabel={hero.primaryCta.label} className="uc-btn-primary">
                {hero.primaryCta.label} <ArrowRight className="h-4 w-4" aria-hidden />
              </CtaLink>
              <CtaLink href={hero.secondaryCta.href} ariaLabel={hero.secondaryCta.label} className="uc-btn-outline">
                {hero.secondaryCta.href.startsWith("tel:") && <Phone className="h-4 w-4" aria-hidden />}{" "}
                {hero.secondaryCta.label}
              </CtaLink>
            </div>
            <div className="mt-8 inline-flex items-center gap-3 rounded-card bg-white/95 p-4 text-ink shadow-card">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-cqc-good text-white">
                <ShieldCheck className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <p className="font-semibold">CQC &quot;Good&quot;</p>
                <a
                  href={site.cqcReportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primary hover:underline"
                >
                  View report <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      {stats.length > 0 && (
        <section aria-label="Key facts" className="uc-stats-bar">
          <div className={`mx-auto grid max-w-content grid-cols-1 gap-6 px-4 py-8 ${statsGrid}`}>
            {stats.map((s, i) => (
              <div key={`${s.figure}-${s.label}`} className="fade-up flex items-center gap-4" data-stagger={i}>
                <span className="uc-icon h-14 w-14 shrink-0">
                  <s.icon aria-hidden />
                </span>
                <div>
                  <p className="font-heading text-2xl font-semibold text-ink">{s.figure}</p>
                  <p className="text-sm text-ink-muted">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2. Services */}
      {services.length > 0 && (
        <section aria-labelledby="home-services-h" className="mx-auto max-w-content px-4 py-16 lg:py-24">
          <div className="fade-up">
            <p className="eyebrow">{asString(servicesIntro, "eyebrow", "Services")}</p>
            <h2 id="home-services-h" className="mt-2 font-heading text-3xl font-semibold text-ink md:text-4xl">
              {asString(servicesIntro, "title", "What we offer")}
            </h2>
            <p className="mt-3 max-w-2xl text-ink-muted">
              {asString(servicesIntro, "subtitle", "Eight specialist care services, all independently certified.")}
            </p>
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {services.slice(0, 4).map((s) => (
              <ServiceCard key={s.slug} service={s} />
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/services"
              className="inline-flex items-center gap-2 rounded-full border-2 border-brand-primary px-6 py-3 font-semibold text-brand-primary transition hover:bg-brand-soft"
            >
              View all {services.length} services <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      )}

      {/* 3. Why us */}
      {whyItems.length > 0 && (
        <section aria-labelledby="home-why-h" className="bg-surface-alt">
          <div className="mx-auto grid max-w-content items-center gap-10 px-4 py-16 lg:py-24 lg:grid-cols-2">
            <div className="fade-up relative">
              <Image
                src={whySideImage}
                alt={asString(whySide, "imageAlt", "Carer discussing care plan with elderly client at home")}
                width={1200}
                height={800}
                unoptimized={remote(whySideImage)}
                className="w-full rounded-card object-cover shadow-card"
              />
              <div className="absolute -bottom-5 left-5 rounded-card bg-white px-5 py-4 shadow-card-hover">
                <p className="font-heading text-lg font-semibold text-brand-primary">
                  {asString(whySide, "overlayTitle", "Dual ISO certified")}
                </p>
                <p className="text-sm text-ink-muted">{asString(whySide, "overlayText", "Quality you can verify")}</p>
              </div>
            </div>
            <div>
              <div className="fade-up">
                <p className="eyebrow">{String(whySection?.eyebrow ?? "Why us")}</p>
                <h2 id="home-why-h" className="mt-2 font-heading text-3xl font-semibold text-ink md:text-4xl">
                  {String(whySection?.title ?? "What makes us different")}
                </h2>
                <p className="mt-3 text-ink-muted">
                  {String(whySection?.subtitle ?? "In a market with 45+ providers, here's why families choose us.")}
                </p>
              </div>
              <div className="mt-8 space-y-6">
                {whyItems.map((f, i) => (
                  <div key={f.title} className="fade-up flex gap-4" data-stagger={i}>
                    {f.thumb ? (
                      <img
                        src={f.thumb}
                        alt=""
                        loading="lazy"
                        className="h-24 w-24 shrink-0 rounded-2xl object-cover"
                      />
                    ) : null}
                    <span className="uc-icon h-12 w-12 shrink-0">
                      <f.icon aria-hidden />
                    </span>
                    <div>
                      <h3 className="font-heading text-lg font-semibold text-ink">{f.title}</h3>
                      <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">{f.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 4. Certifications */}
      {certs.length > 0 && (
        <section aria-labelledby="home-certs-h" className="bg-brand-soft">
          <div className="mx-auto max-w-content px-4 py-16 lg:py-24">
            <div className="fade-up">
              <p className="eyebrow">{asString(certsIntro, "eyebrow", "Certified Quality")}</p>
              <h2 id="home-certs-h" className="mt-2 font-heading text-3xl font-semibold text-ink md:text-4xl">
                {asString(certsIntro, "title", "Our certifications")}
              </h2>
              <p className="mt-3 max-w-2xl text-ink-muted">
                {asString(
                  certsIntro,
                  "subtitle",
                  "Independently verified standards you can trust. We go beyond CQC registration with international certifications.",
                )}
              </p>
            </div>
            <div className="mt-8">
              <CertificationGrid certs={certs} />
            </div>
          </div>
        </section>
      )}

      {/* 5. Testimonials */}
      {reviews.length > 0 && (
        <section aria-labelledby="home-testimonials-h" className="mx-auto max-w-content px-4 py-16 lg:py-24">
          <div className="fade-up text-center">
            {testimonialsIntro && asString(testimonialsIntro, "eyebrow", "") && (
              <p className="eyebrow">{asString(testimonialsIntro, "eyebrow", "")}</p>
            )}
            <h2 id="home-testimonials-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
              {asString(testimonialsIntro, "title", "Trusted by families")}
            </h2>
            <p className="mt-3 text-ink-muted">
              {asString(testimonialsIntro, "subtitle", "Don't take our word for it. Hear from the people we care for.")}
            </p>
          </div>
          <div className="mt-10">
            <TestimonialCarousel reviews={reviews} />
          </div>
          <div className="mt-8 text-center">
            <Link href="/reviews" className="inline-flex items-center gap-1.5 font-semibold text-brand-primary hover:underline">
              Read more reviews <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      )}

      {/* 6. Blog */}
      {posts.length > 0 && (
        <section aria-labelledby="home-blog-h" className="bg-surface-alt">
          <div className="mx-auto max-w-content px-4 py-16 lg:py-24">
            <div className="fade-up flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Blog</p>
                <h2 id="home-blog-h" className="mt-2 font-heading text-3xl font-semibold text-ink md:text-4xl">
                  Latest insights
                </h2>
              </div>
              <Link href="/blog" className="hidden shrink-0 items-center gap-1.5 font-semibold text-brand-primary hover:underline sm:inline-flex">
                View all <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {posts.slice(0, 3).map((p) => (
                <article key={p.slug} className="fade-up uc-card group overflow-hidden">
                  <Link href={`/blog/${p.slug}`} className="block">
                    <span className="relative block aspect-[16/10] overflow-hidden">
                      <Image src={p.image} alt={p.imageAlt} fill unoptimized={isRemoteImage(p.image)} sizes="(min-width:768px) 33vw, 100vw" className="object-cover transition-transform group-hover:scale-105" />
                    </span>
                    <span className="block p-5">
                      <span className="inline-block rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-primary">
                        {p.category}
                      </span>
                      <h3 className="mt-3 font-heading text-lg font-semibold leading-snug text-ink group-hover:text-brand-primary">
                        {p.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{p.excerpt}</p>
                    </span>
                  </Link>
                </article>
              ))}
            </div>
            <div className="mt-8 text-center sm:hidden">
              <Link href="/blog" className="inline-flex items-center gap-1.5 font-semibold text-brand-primary hover:underline">
                View all articles <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* 7. Areas we serve */}
      {areas.length > 0 && (
      <section aria-labelledby="home-areas-h" className="mx-auto max-w-content px-4 py-16 lg:py-24">
        <div className="fade-up text-center">
          {areasIntro && asString(areasIntro, "eyebrow", "") && (
            <p className="eyebrow">{asString(areasIntro, "eyebrow", "")}</p>
          )}
          <h2 id="home-areas-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
            {asString(areasIntro, "title", "Areas we serve")}
          </h2>
          <p className="mt-3 text-ink-muted">
            {asString(areasIntro, "subtitle", "Professional home care across London, Essex, and Hertfordshire.")}
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {areas.map((a) => (
            <Link
              key={a.slug}
              href={`/areas/${a.slug}`}
              className="fade-up flex items-center justify-center gap-2 rounded-full border-2 border-brand-primary px-6 py-4 font-heading text-lg font-semibold text-brand-primary transition hover:bg-brand-soft"
            >
              <MapPin className="h-5 w-5" aria-hidden /> {a.name}
            </Link>
          ))}
        </div>
      </section>
      )}

      {/* 8. Closing CTA */}
      <section aria-labelledby="home-closing-h" className="bg-surface-alt">
        <div className="mx-auto grid max-w-content items-center gap-10 px-4 py-16 lg:py-24 lg:grid-cols-2">
          <div className="fade-up">
            <h2 id="home-closing-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
              {asString(closing, "title", "Ready to talk about care?")}
            </h2>
            <p className="mt-3 text-ink-muted">
              {asString(closing, "text", "Book a free, no-obligation assessment. We'll come to you at a time that suits.")}
            </p>
            <div className="uc-cta-row mt-7">
              <CtaLink href={closingPrimary.href} ariaLabel={closingPrimary.label} className="uc-btn-primary">
                {closingPrimary.label} <ArrowRight className="h-4 w-4" aria-hidden />
              </CtaLink>
              <CtaLink
                href={closingSecondary.href}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-brand-primary px-6 py-3.5 font-semibold text-brand-primary transition hover:bg-brand-soft"
              >
                {closingSecondary.label}
              </CtaLink>
            </div>
          </div>
          <Image
            src={closingImage}
            alt={asString(closing, "imageAlt", "Home care environment")}
            width={1200}
            height={800}
            unoptimized={remote(closingImage)}
            className="fade-up w-full rounded-card object-cover shadow-card"
          />
        </div>
      </section>
    </>
  );
}
