import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Award, Brain, Heart, HeartHandshake, Phone, Sparkles, Users, Zap } from "lucide-react";
import { site } from "@/content/site";
import HeroVideo from "@/components/HeroVideo";

export const metadata: Metadata = {
  title: "About Us | ISO Certified Home Care Provider Since 2017 | Unique Care UK",
  description:
    "Unique Care UK is an ISO 9001 and ISO 45001 certified home care provider serving London, Essex, and Hertfordshire since 2017. CQC rated Good.",
  alternates: { canonical: "/about" },
};

const WHO_WE_SUPPORT = [
  { label: "People living with long-term illnesses", thumb: "/images/cards/support-longterm.jpg" },
  { label: "Elderly people with dementia and Alzheimer's", thumb: "/images/cards/support-dementia.jpg" },
  { label: "Young and old with learning disabilities", thumb: "/images/cards/support-learning.jpg" },
  { label: "Those with mental health needs", thumb: "/images/cards/support-mentalhealth.jpg" },
  { label: "People living with addiction", thumb: "/images/cards/support-addiction.jpg" },
  { label: "Individuals recovering from illness or injury", thumb: "/images/cards/support-recovery.jpg" },
];

const DRIVERS = [
  {
    icon: Heart,
    title: "Our Mission",
    text: "To provide compassionate, person-centred care that empowers individuals to live independently and with dignity in their own homes.",
    thumb: "/images/cards/drives-mission.jpg",
  },
  {
    icon: Award,
    title: "Quality Assured",
    text: "We hold ISO 9001 and ISO 45001 certifications, demonstrating our commitment to quality management and occupational health & safety.",
    thumb: "/images/cards/drives-quality.jpg",
  },
  {
    icon: Users,
    title: "Our Team",
    text: "Our care workers are carefully recruited, professionally trained, and share our passion for delivering outstanding care to every client.",
    thumb: "/images/cards/drives-team.jpg",
  },
  {
    icon: Sparkles,
    title: "Our Values",
    text: "Compassion, respect, reliability, and excellence guide everything we do. We treat every service user as we would treat our own family.",
    thumb: "/images/cards/drives-values.jpg",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden" aria-labelledby="about-h">
        <HeroVideo src="/videos/care-at-home.mp4" poster="/images/about-hero.jpg" />
        <div className="relative mx-auto max-w-content px-4 py-20 md:py-28">
          <div className="fade-up max-w-2xl text-white">
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
      <section aria-labelledby="who-we-are-h" className="mx-auto max-w-content px-4 py-16 lg:py-24">
        <div className="fade-up">
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
        </div>
      </section>

      {/* Who we support */}
      <section aria-labelledby="who-we-support-h" className="bg-surface-alt">
        <div className="mx-auto max-w-content px-4 py-16 lg:py-24">
          <div className="fade-up">
            <h2 id="who-we-support-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
              Who we support
            </h2>
            <p className="mt-3 text-ink-muted">We provide care for a wide range of individuals with diverse needs.</p>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {WHO_WE_SUPPORT.map((w, i) => {
              const icons = [HeartHandshake, Brain, Users, Sparkles, Zap, Heart];
              const Icon = icons[i % icons.length];
              return (
                <div key={w.label} className="fade-up uc-card flex items-center gap-4 p-5" data-stagger={i}>
                  <img
                    src={w.thumb}
                    alt=""
                    loading="lazy"
                    className="h-24 w-24 shrink-0 rounded-2xl object-cover"
                  />
                  <span className="uc-icon-3d h-11 w-11 shrink-0">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="font-medium text-ink">{w.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* What drives us */}
      <section aria-labelledby="drives-h" className="mx-auto max-w-content px-4 py-16 lg:py-24">
        <h2 id="drives-h" className="fade-up font-heading text-3xl font-semibold text-ink md:text-4xl">
          What drives us
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {DRIVERS.map((d, i) => (
            <div key={d.title} className="fade-up uc-card overflow-hidden" data-stagger={i}>
              <img src={d.thumb} alt="" loading="lazy" className="h-44 w-full object-cover" />
              <div className="p-6">
                <span className="uc-icon-3d h-12 w-12">
                  <d.icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="mt-4 font-heading text-xl font-semibold text-ink">{d.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{d.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section aria-labelledby="about-cta-h" className="bg-brand-soft">
        <div className="fade-up mx-auto max-w-content px-4 py-16 text-center">
          <h2 id="about-cta-h" className="font-heading text-3xl font-semibold text-ink md:text-4xl">
            Ready to discuss care?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            Book a free, no-obligation assessment. We&apos;ll come to you at a time that suits.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/contact" aria-label="Book a free assessment" className="uc-btn-primary">
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
