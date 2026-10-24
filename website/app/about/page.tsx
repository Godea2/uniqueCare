import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Award, Brain, Heart, HeartHandshake, Phone, Sparkles, Users, Zap } from "lucide-react";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "About Us | ISO Certified Home Care Provider Since 2017 | Unique Care UK",
  description:
    "Unique Care UK is an ISO 9001 and ISO 45001 certified home care provider serving London, Essex, and Hertfordshire since 2017. CQC rated Good.",
  alternates: { canonical: "/about" },
};

const WHO_WE_SUPPORT = [
  "People living with long-term illnesses",
  "Elderly people with dementia and Alzheimer's",
  "Young and old with learning disabilities",
  "Those with mental health needs",
  "People living with addiction",
  "Individuals recovering from illness or injury",
];

const DRIVERS = [
  {
    icon: Heart,
    title: "Our Mission",
    text: "To provide compassionate, person-centred care that empowers individuals to live independently and with dignity in their own homes.",
  },
  {
    icon: Award,
    title: "Quality Assured",
    text: "We hold ISO 9001 and ISO 45001 certifications, demonstrating our commitment to quality management and occupational health & safety.",
  },
  {
    icon: Users,
    title: "Our Team",
    text: "Our care workers are carefully recruited, professionally trained, and share our passion for delivering outstanding care to every client.",
  },
  {
    icon: Sparkles,
    title: "Our Values",
    text: "Compassion, respect, reliability, and excellence guide everything we do. We treat every service user as we would treat our own family.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden" aria-labelledby="about-h">
        <Image
          src="/images/about-hero.jpg"
          alt="Unique Care UK team providing compassionate home care"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/55 to-ink/25" aria-hidden />
        <div className="relative mx-auto max-w-content px-4 py-20 md:py-28">
          <div className="max-w-2xl text-white">
            <span className="inline-block rounded-full bg-brand-secondary px-4 py-1.5 text-xs font-semibold uppercase tracking-wide">
              Est. 2017
            </span>
            <h1 id="about-h" className="mt-5 font-heading text-4xl font-semibold md:text-5xl">
              About Unique Care UK
            </h1>
            <p className="mt-4 text-lg text-white/90">
              Dedicated to providing exceptional care in the comfort of your own home, across London, Essex,
              and Hertfordshire.
            </p>
          </div>
        </div>
      </section>

      {/* Who we are */}
      <section aria-labelledby="who-we-are-h" className="mx-auto max-w-content px-4 py-16 md:py-20">
        <h2 id="who-we-are-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
          Who we are
        </h2>
        <div className="prose-legal mt-5">
          <p>
            Unique Care UK is a division of Unique Resourcing Ltd. We offer bespoke specialist care solutions
            across private and public healthcare sectors including care homes, hospitals, charity
            organisations, and not-for-profit organisations.
          </p>
          <p>
            Our extensive experience in social care enables us to provide reliable, skilled, and competent care
            workers with a caring and compassionate attitude. We have deployed trained and qualified specialist
            nurses, general nursing staff, and healthcare assistants across Greater London and surrounding
            regions including Essex, Surrey, and the home counties.
          </p>
        </div>
      </section>

      {/* Who we support */}
      <section aria-labelledby="who-we-support-h" className="bg-surface-alt">
        <div className="mx-auto max-w-content px-4 py-16 md:py-20">
          <h2 id="who-we-support-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
            Who we support
          </h2>
          <p className="mt-3 text-ink-muted">We provide care for a wide range of individuals with diverse needs.</p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {WHO_WE_SUPPORT.map((w, i) => {
              const icons = [HeartHandshake, Brain, Users, Sparkles, Zap, Heart];
              const Icon = icons[i % icons.length];
              return (
                <div key={w} className="fade-up flex items-center gap-4 rounded-card border border-line bg-white p-5 shadow-card">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="font-medium text-ink">{w}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* What drives us */}
      <section aria-labelledby="drives-h" className="mx-auto max-w-content px-4 py-16 md:py-20">
        <h2 id="drives-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
          What drives us
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {DRIVERS.map((d) => (
            <div key={d.title} className="fade-up rounded-card border border-line bg-white p-6 shadow-card">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand-primary">
                <d.icon className="h-6 w-6" aria-hidden />
              </span>
              <h3 className="mt-4 font-heading text-xl font-semibold text-ink">{d.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{d.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section aria-labelledby="about-cta-h" className="bg-brand-soft">
        <div className="mx-auto max-w-content px-4 py-16 text-center">
          <h2 id="about-cta-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
            Ready to discuss care?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            Book a free, no-obligation assessment. We&apos;ll come to you at a time that suits.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3.5 font-semibold text-white transition hover:bg-brand-primary-dark"
            >
              Book a free assessment <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <a
              href={site.phonePrimaryTel}
              className="inline-flex items-center gap-2 rounded-full border-2 border-brand-primary px-6 py-3.5 font-semibold text-brand-primary transition hover:bg-white"
            >
              <Phone className="h-4 w-4" aria-hidden /> Call us now
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
