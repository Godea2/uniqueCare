import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Clock3,
  GraduationCap,
  HeartHandshake,
  MapPin,
  PhoneCall,
  Zap,
} from "lucide-react";
import { getJobs, employmentLabel } from "@/lib/jobs-source";

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
  },
  {
    icon: Banknote,
    title: "Good Rates of Pay",
    text: "Competitive pay rates that reflect your skills and dedication. We value the work our carers do every day.",
  },
  {
    icon: HeartHandshake,
    title: "Various Work Environments",
    text: "Opportunities across both public and private healthcare sectors. Gain diverse experience and grow your career.",
  },
  {
    icon: MapPin,
    title: "A Variety of Work Locations",
    text: "Placements across London, Essex, and Hertfordshire. Work close to home or explore new areas. The choice is yours.",
  },
  {
    icon: Zap,
    title: "Fast Track Applications",
    text: "Our streamlined application process gets you into work quickly. Apply today and start making a difference sooner.",
  },
  {
    icon: PhoneCall,
    title: "Contact Available Around the Clock",
    text: "24/7 on-call management support. Whether it's day or night, our team is always there when you need us.",
  },
  {
    icon: Clock3,
    title: "Flexible Working",
    text: "Days, evenings, nights, weekends, and bank holidays. Choose a schedule that works around your life.",
  },
];

export default async function CareersPage() {
  const jobs = (await getJobs()).filter((j) => j.listedInGrid);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden" aria-labelledby="careers-h">
        <Image
          src="/images/careers-hero.jpg"
          alt="Healthcare team working together"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/55 to-ink/25" aria-hidden />
        <div className="relative mx-auto max-w-content px-4 py-20 md:py-28">
          <div className="max-w-2xl text-white">
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
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3.5 font-semibold text-white transition hover:bg-brand-primary-dark"
            >
              View Open Positions <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section aria-labelledby="benefits-h" className="mx-auto max-w-content px-4 py-16 md:py-20">
        <p className="eyebrow">Benefits</p>
        <h2 id="benefits-h" className="mt-2 font-heading text-3xl font-semibold text-ink md:text-4xl">
          Why work with us?
        </h2>
        <p className="mt-3 max-w-2xl text-ink-muted">
          We strive to create a supportive and nurturing environment for both our service users and our staff.
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="fade-up rounded-card border border-line bg-white p-6 shadow-card">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand-primary">
                <b.icon className="h-6 w-6" aria-hidden />
              </span>
              <h3 className="mt-4 font-heading text-lg font-semibold text-ink">{b.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Current openings */}
      <section aria-labelledby="openings-h" className="bg-surface-alt">
        <div className="mx-auto max-w-content px-4 py-16 md:py-20">
          <h2 id="openings-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
            Current openings
          </h2>
          <p className="mt-3 text-ink-muted">Browse our available positions and apply today.</p>
          <ul className="mt-8 divide-y divide-line overflow-hidden rounded-card border border-line bg-white shadow-card">
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
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" aria-hidden /> {j.location}
                        </span>
                      )}
                      {j.type && (
                        <span className="flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" aria-hidden /> {employmentLabel(j.type)}
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
