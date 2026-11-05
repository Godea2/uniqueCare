import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, HeartHandshake, MapPin } from "lucide-react";
import { getJobs, employmentLabel } from "@/lib/jobs-source";
import HeroVideo from "@/components/HeroVideo";
import CtaLink from "@/components/CtaLink";
import { iconByName } from "@/components/CmsIcon";
import { asCta, asItems, asString, getSectionMap } from "@/lib/sections-source";
import JsonLd from "@/components/JsonLd";
import { jobPostingJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "Careers in Care | Join Our Team in London & Essex | Unique Care UK",
  description:
    "Join our compassionate care team. Full training, flexible hours, and career progression. View care assistant vacancies across London and Hertfordshire.",
  alternates: { canonical: "/careers" },
};

export const revalidate = 60;

export default async function CareersPage() {
  const [allJobs, sections] = await Promise.all([getJobs(), getSectionMap("careers")]);
  const jobs = allJobs.filter((j) => j.listedInGrid);
  const heroS = sections.hero ?? null;
  const benefitsS = sections.benefits ?? null;

  const heroCta = asCta(heroS, "primaryCta", { label: "View Open Positions", href: "/careers/jobs" });
  const benefits = asItems(benefitsS)
    .map((b) => ({
      title: asString(b, "title", ""),
      text: asString(b, "text", ""),
      icon: iconByName(b.icon, HeartHandshake),
      thumb: asString(b, "thumb", ""),
    }))
    .filter((b) => b.title);

  return (
    <>
      <JsonLd data={jobs.map((job) => jobPostingJsonLd(job))} />

      {/* Hero */}
      <section className="relative overflow-hidden" aria-labelledby="careers-h">
        <HeroVideo
          src={asString(heroS, "videoSrc", "/videos/care-at-home.mp4")}
          poster={asString(heroS, "poster", "/images/careers-hero.jpg")}
        />
        <div className="relative mx-auto max-w-content px-4 py-20 md:py-28">
          <div className="fade-up max-w-2xl text-white">
            <span className="inline-block rounded-full bg-brand-secondary px-4 py-1.5 text-xs font-semibold uppercase tracking-wide">
              {asString(heroS, "eyebrow", "We're Hiring")}
            </span>
            <h1 id="careers-h" className="mt-5 font-heading text-4xl font-semibold md:text-5xl">
              {asString(heroS, "title", "Join our team")}
            </h1>
            <p className="mt-4 text-lg text-white/90">
              {asString(
                heroS,
                "subtitle",
                "Are you a compassionate individual with a genuine desire to improve the lives of others? We'd love to hear from you.",
              )}
            </p>
            <CtaLink
              href={heroCta.href}
              ariaLabel={heroCta.label}
              className="uc-btn-primary mt-7 w-full sm:w-auto"
            >
              {heroCta.label} <ArrowRight className="h-4 w-4" aria-hidden />
            </CtaLink>
          </div>
        </div>
      </section>

      {/* Benefits */}
      {benefits.length > 0 && (
        <section aria-labelledby="benefits-h" className="mx-auto max-w-content px-4 py-16 lg:py-24">
          <div className="fade-up">
            <p className="eyebrow">{asString(benefitsS, "eyebrow", "Benefits")}</p>
            <h2 id="benefits-h" className="mt-2 font-heading text-3xl font-semibold text-ink md:text-4xl">
              {asString(benefitsS, "title", "Why work with us?")}
            </h2>
            <p className="mt-3 max-w-2xl text-ink-muted">
              {asString(
                benefitsS,
                "subtitle",
                "We strive to create a supportive and nurturing environment for both our service users and our staff.",
              )}
            </p>
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((b) => (
              <div key={b.title} className="fade-up uc-card overflow-hidden">
                {b.thumb && <img src={b.thumb} alt="" loading="lazy" className="h-44 w-full object-cover" />}
                <div className="p-6">
                  <span className="uc-icon h-14 w-14">
                    <b.icon className="h-6 w-6" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-heading text-lg font-semibold text-ink">{b.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{b.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Current openings */}
      <section aria-labelledby="openings-h" className="bg-surface-alt">
        <div className="mx-auto max-w-content px-4 py-16 lg:py-24">
          <div className="fade-up">
            <h2 id="openings-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
              Current openings
            </h2>
            <p className="mt-3 text-ink-muted">Browse our available positions and apply today.</p>
          </div>
          <ul className="fade-up mt-8 divide-y divide-line overflow-hidden rounded-card border border-line bg-white shadow-card">
            {jobs.map((j) => (
              <li key={j.slug}>
                <Link
                  href={`/careers/jobs/${j.slug}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 transition hover:bg-brand-soft/60"
                >
                  <div>
                    <h3 className="font-heading text-lg font-semibold text-ink">{j.title}</h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                      {j.location && (
                        <span className="flex items-center gap-1.5">
                          <span className="uc-icon-inline"><MapPin className="h-4 w-4" aria-hidden /></span> {j.location}
                        </span>
                      )}
                      {j.type && (
                        <span className="flex items-center gap-1.5">
                          <span className="uc-icon-inline"><Clock3 className="h-4 w-4" aria-hidden /></span> {employmentLabel(j.type)}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="flex items-center gap-3">
                    <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-primary">
                      {j.statusLabel}
                    </span>
                    <ArrowRight className="h-4 w-4 text-brand-primary" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
            {jobs.length === 0 && (
              <li className="px-6 py-8 text-center text-ink-muted">
                There are no open positions right now. Check back soon, or{" "}
                <Link href="/contact" className="font-semibold text-brand-primary hover:underline">
                  get in touch
                </Link>{" "}
                if you&apos;d like to introduce yourself.
              </li>
            )}
          </ul>
        </div>
      </section>
    </>
  );
}
