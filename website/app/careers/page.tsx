import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Bike,
  Clock3,
  GraduationCap,
  HeartHandshake,
  MapPin,
  PhoneCall,
  Zap,
} from "lucide-react";
import { getJobs, employmentLabel } from "@/lib/jobs-source";
import HeroVideo from "@/components/HeroVideo";
import JsonLd from "@/components/JsonLd";
import { jobPostingJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "Careers in Care | Join Our Team in London & Essex | Unique Care UK",
  description:
    "Join our compassionate care team. Full training, flexible hours, and career progression. View care assistant vacancies across London and Hertfordshire.",
  alternates: { canonical: "/careers" },
};

export const revalidate = 60;

const BENEFITS = [
  {
    icon: GraduationCap,
    title: "Mandatory Training for Staff",
    text: "Comprehensive induction course and ongoing mandatory training provided to all staff members at no cost.",
    thumb: "/images/cards/benefits-training.jpg",
  },
  {
    icon: Banknote,
    title: "Good Rates of Pay",
    text: "Competitive pay rates that reflect your skills and dedication. We value the work our carers do every day.",
    thumb: "/images/cards/benefits-pay.jpg",
  },
  {
    icon: HeartHandshake,
    title: "Various Work Environments",
    text: "Opportunities across both public and private healthcare sectors. Gain diverse experience and grow your career.",
    thumb: "/images/cards/benefits-environments.jpg",
  },
  {
    icon: MapPin,
    title: "A Variety of Work Locations",
    text: "Placements across London, Essex, and Hertfordshire. Work close to home or explore new areas. The choice is yours.",
    thumb: "/images/cards/benefits-locations.jpg",
  },
  {
    icon: Zap,
    title: "Fast Track Applications",
    text: "Our streamlined application process gets you into work quickly. Apply today and start making a difference sooner.",
    thumb: "/images/cards/benefits-fasttrack.jpg",
  },
  {
    icon: PhoneCall,
    title: "Contact Available Around the Clock",
    text: "24/7 on-call management support. Whether it's day or night, our team is always there when you need us.",
    thumb: "/images/cards/benefits-247.jpg",
  },
  {
    icon: Clock3,
    title: "Flexible Working",
    text: "Days, evenings, nights, weekends, and bank holidays. Choose a schedule that works around your life.",
    thumb: "/images/cards/benefits-flexible.jpg",
  },
  {
    icon: Bike,
    title: "Paid Mileage & Motorbike Scheme",
    text: "Mileage paid on every client visit, or ride one of our company motorbikes on your daily rounds. Your travel to clients is always covered.",
    thumb: "/images/cards/benefits-mileage.jpg",
  },
];

export default async function CareersPage() {
  const jobs = (await getJobs()).filter((j) => j.listedInGrid);

  return (
    <>
      <JsonLd data={jobs.map(jobPostingJsonLd)} />

      {/* Hero */}
      <section className="relative overflow-hidden" aria-labelledby="careers-h">
        <HeroVideo src="/videos/care-at-home.mp4" poster="/images/careers-hero.jpg" />
        <div className="relative mx-auto max-w-content px-4 py-20 md:py-28">
          <div className="fade-up max-w-2xl text-white">
            <span className="inline-block rounded-full bg-brand-secondary px-4 py-1.5 text-xs font-semibold uppercase tracking-wide">
              We&apos;re Hiring
            </span>
            <h1 id="careers-h" className="mt-5 font-heading text-4xl font-semibold md:text-5xl">
              Join our team
            </h1>
            <p className="mt-4 text-lg text-white/90">
              Are you a compassionate individual with a genuine desire to improve the lives of others?
              We&apos;d love to hear from you.
            </p>
            <Link
              href="/careers/jobs"
              aria-label="View Open Positions"
              className="uc-btn-primary mt-7"
            >
              View Open Positions <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section aria-labelledby="benefits-h" className="mx-auto max-w-content px-4 py-16 lg:py-24">
        <div className="fade-up">
          <p className="eyebrow">Benefits</p>
          <h2 id="benefits-h" className="mt-2 font-heading text-3xl font-semibold text-ink md:text-4xl">
            Why work with us?
          </h2>
          <p className="mt-3 max-w-2xl text-ink-muted">
            We strive to create a supportive and nurturing environment for both our service users and our staff.
          </p>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="fade-up uc-card overflow-hidden">
              <img src={b.thumb} alt="" loading="lazy" className="h-44 w-full object-cover" />
              <div className="p-6">
                <span className="uc-icon-3d h-12 w-12">
                  <b.icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="mt-4 font-heading text-lg font-semibold text-ink">{b.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{b.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

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
                          <span className="uc-icon-3d h-6 w-6 shrink-0"><MapPin className="h-3 w-3" aria-hidden /></span> {j.location}
                        </span>
                      )}
                      {j.type && (
                        <span className="flex items-center gap-1.5">
                          <span className="uc-icon-3d h-6 w-6 shrink-0"><Clock3 className="h-3 w-3" aria-hidden /></span> {employmentLabel(j.type)}
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
