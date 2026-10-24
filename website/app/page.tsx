import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Award, Clock3, Heart, MapPin, Phone, ShieldCheck, Sparkles, Users } from "lucide-react";
import { services } from "@/content/services";
import { areas } from "@/content/areas";
import { posts } from "@/content/posts";
import { site, yearsOfCare } from "@/content/site";
import { getApprovedReviews } from "@/lib/supabase";
import { organizationJsonLd, JsonLd } from "@/lib/jsonld";
import ServiceCard from "@/components/ServiceCard";
import CertificationGrid from "@/components/CertificationGrid";
import TestimonialCarousel, { type CarouselReview } from "@/components/TestimonialCarousel";

export const metadata: Metadata = {
  title: "Unique Care UK | Home Care in London & Hertfordshire",
  description:
    "Professional domiciliary, live-in care, and supported living across London and Hertfordshire. Compassionate, personalised home care.",
  alternates: { canonical: "/" },
};

export const revalidate = 300;

const SEED_REVIEW: CarouselReview = {
  id: "seed",
  name: "Emilio A",
  relationship: "Son of Client",
  rating: 5,
  title: "Outstanding care",
  body: "Had two visits from one particular carer from Unique Care UK as my mother had to return to hospital. She is outstanding! Very caring, full of concern for my mothers well being and knows exactly how to handle all situations. Thank you to her.",
};

const WHY_US = [
  {
    icon: ShieldCheck,
    title: "Certified Quality",
    text: "We don't just claim quality. We prove it. Our ISO 9001 and ISO 45001 certifications mean every process, every visit, and every care plan meets independently verified standards.",
  },
  {
    icon: Heart,
    title: "Genuine Compassion",
    text: "Our care workers are chosen for their warmth and empathy first. Skills can be taught; a caring heart cannot. We treat every service user as we would our own family.",
  },
  {
    icon: MapPin,
    title: "Local Roots",
    text: "We live and work in the communities we serve across London, Essex, and Hertfordshire. We understand the unique needs of our neighbours.",
  },
  {
    icon: Sparkles,
    title: "Transparent Trust",
    text: "We welcome scrutiny. Our CQC 'Good' rating, our certifications, and our commitment to honest communication mean you always know exactly where you stand.",
  },
];

export default async function HomePage() {
  const dbReviews = await getApprovedReviews();
  const reviews: CarouselReview[] =
    dbReviews.length > 0
      ? dbReviews.map((r) => ({ id: r.id, name: r.name, relationship: r.relationship, rating: r.rating, title: r.title, body: r.body }))
      : [SEED_REVIEW];

  return (
    <>
      <JsonLd data={organizationJsonLd()} />

      {/* 1. Hero */}
      <section className="relative overflow-hidden" aria-labelledby="home-hero-h">
        <Image
          src="/images/hero-caregiver.jpg"
          alt="Professional caregiver providing compassionate home care"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/60 to-ink/25" aria-hidden />
        <div className="relative mx-auto max-w-content px-4 py-24 md:py-32">
          <div className="max-w-2xl text-white">
            <span className="inline-block rounded-full bg-brand-secondary px-4 py-1.5 text-xs font-semibold uppercase tracking-wide">
              ISO certified care provider
            </span>
            <h1 id="home-hero-h" className="mt-5 font-heading text-4xl font-semibold leading-tight md:text-6xl">
              Exceptional care in the comfort of your home
            </h1>
            <p className="mt-4 font-heading text-xl text-white/90 md:text-2xl">
              Care that meets the standard. Compassion that exceeds it.
            </p>
            <p className="mt-3 text-white/85 md:text-lg">
              Trusted CQC-rated home care provider, ISO 9001 &amp; 45001 certified for quality and safety.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3.5 font-semibold text-white transition hover:bg-brand-primary-dark"
              >
                Book a free assessment <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a
                href={site.phonePrimaryTel}
                className="inline-flex items-center gap-2 rounded-full border-2 border-white px-6 py-3.5 font-semibold text-white transition hover:bg-white/10"
              >
                <Phone className="h-4 w-4" aria-hidden /> Call us
              </a>
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
      <section aria-label="Key facts" className="border-b border-line bg-white">
        <div className="mx-auto grid max-w-content grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-3">
          {[
            { icon: Award, figure: "ISO 9001", label: "Quality certified" },
            { icon: Clock3, figure: "24/7", label: "Support available" },
            { icon: Users, figure: `${yearsOfCare}+ years`, label: "Of trusted care" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-4">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-primary">
                <s.icon className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <p className="font-heading text-2xl font-semibold text-ink">{s.figure}</p>
                <p className="text-sm text-ink-muted">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Services */}
      <section aria-labelledby="home-services-h" className="mx-auto max-w-content px-4 py-16 md:py-20">
        <p className="eyebrow">Services</p>
        <h2 id="home-services-h" className="mt-2 font-heading text-3xl font-semibold text-ink md:text-4xl">
          What we offer
        </h2>
        <p className="mt-3 max-w-2xl text-ink-muted">Eight specialist care services, all independently certified.</p>
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
            View all 8 services <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      {/* 3. Why us */}
      <section aria-labelledby="home-why-h" className="bg-surface-alt">
        <div className="mx-auto grid max-w-content items-center gap-10 px-4 py-16 md:py-20 lg:grid-cols-2">
          <div className="fade-up relative">
            <Image
              src="/images/why-choose-us.jpg"
              alt="Carer discussing care plan with elderly client at home"
              width={1200}
              height={800}
              className="w-full rounded-card object-cover shadow-card"
            />
            <div className="absolute -bottom-5 left-5 rounded-card bg-white px-5 py-4 shadow-card-hover">
              <p className="font-heading text-lg font-semibold text-brand-primary">Dual ISO certified</p>
              <p className="text-sm text-ink-muted">Quality you can verify</p>
            </div>
          </div>
          <div>
            <p className="eyebrow">Why us</p>
            <h2 id="home-why-h" className="mt-2 font-heading text-3xl font-semibold text-ink md:text-4xl">
              What makes us different
            </h2>
            <p className="mt-3 text-ink-muted">
              In a market with 45+ providers, here&apos;s why families choose us.
            </p>
            <div className="mt-8 space-y-6">
              {WHY_US.map((f) => (
                <div key={f.title} className="fade-up flex gap-4">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-primary">
                    <f.icon className="h-5 w-5" aria-hidden />
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

      {/* 4. Certifications */}
      <section aria-labelledby="home-certs-h" className="bg-brand-soft">
        <div className="mx-auto max-w-content px-4 py-16 md:py-20">
          <p className="eyebrow">Certified Quality</p>
          <h2 id="home-certs-h" className="mt-2 font-heading text-3xl font-semibold text-ink md:text-4xl">
            Our certifications
          </h2>
          <p className="mt-3 max-w-2xl text-ink-muted">
            Independently verified standards you can trust. We go beyond CQC registration with international
            certifications.
          </p>
          <div className="mt-8">
            <CertificationGrid />
          </div>
        </div>
      </section>

      {/* 5. Testimonials */}
      <section aria-labelledby="home-testimonials-h" className="mx-auto max-w-content px-4 py-16 md:py-20">
        <div className="text-center">
          <h2 id="home-testimonials-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
            Trusted by families
          </h2>
          <p className="mt-3 text-ink-muted">
            Don&apos;t take our word for it. Hear from the people we care for.
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

      {/* 6. Blog */}
      <section aria-labelledby="home-blog-h" className="bg-surface-alt">
        <div className="mx-auto max-w-content px-4 py-16 md:py-20">
          <div className="flex items-end justify-between gap-4">
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
              <article key={p.slug} className="fade-up group overflow-hidden rounded-card border border-line bg-white shadow-card transition hover:-translate-y-1 hover:shadow-card-hover">
                <Link href={`/blog/${p.slug}`} className="block">
                  <span className="relative block aspect-[16/10] overflow-hidden">
                    <Image src={p.image} alt={p.imageAlt} fill sizes="(min-width:768px) 33vw, 100vw" className="object-cover transition-transform group-hover:scale-105" />
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

      {/* 7. Areas we serve */}
      <section aria-labelledby="home-areas-h" className="mx-auto max-w-content px-4 py-16 md:py-20">
        <div className="text-center">
          <h2 id="home-areas-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
            Areas we serve
          </h2>
          <p className="mt-3 text-ink-muted">
            Professional home care across London, Essex, and Hertfordshire.
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

      {/* 8. Closing CTA */}
      <section aria-labelledby="home-closing-h" className="bg-surface-alt">
        <div className="mx-auto grid max-w-content items-center gap-10 px-4 py-16 md:py-20 lg:grid-cols-2">
          <div>
            <h2 id="home-closing-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
              Ready to talk about care?
            </h2>
            <p className="mt-3 text-ink-muted">
              Book a free, no-obligation assessment. We&apos;ll come to you at a time that suits.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3.5 font-semibold text-white transition hover:bg-brand-primary-dark"
              >
                Book a free assessment <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/careers"
                className="inline-flex items-center gap-2 rounded-full border-2 border-brand-primary px-6 py-3.5 font-semibold text-brand-primary transition hover:bg-brand-soft"
              >
                View careers
              </Link>
            </div>
          </div>
          <Image
            src="/images/live-in-care.jpg"
            alt="Home care environment"
            width={1200}
            height={800}
            className="fade-up w-full rounded-card object-cover shadow-card"
          />
        </div>
      </section>
    </>
  );
}
