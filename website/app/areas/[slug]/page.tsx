import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Award, Leaf, MapPin, Phone, ShieldCheck } from "lucide-react";
import { areas, getArea, otherAreas } from "@/content/areas";
import { services } from "@/content/services";
import { site } from "@/content/site";
import Breadcrumbs from "@/components/Breadcrumbs";
import ServiceCard, { excerpt } from "@/components/ServiceCard";
import { JsonLd, localBusinessJsonLd } from "@/lib/jsonld";

export function generateStaticParams() {
  return areas.map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const a = getArea(params.slug);
  if (!a) return {};
  return {
    title: `Home Care in ${a.name} | Unique Care UK`,
    description: `Unique Care UK provides CQC-rated, ISO-certified domiciliary care, live-in care, and supported living services in ${a.name}. Call 02039170260 for a free assessment.`,
    alternates: { canonical: `/areas/${a.slug}` },
  };
}

export default function AreaPage({ params }: { params: { slug: string } }) {
  const a = getArea(params.slug);
  if (!a) notFound();

  const whyItems = [
    {
      icon: Award,
      title: "Independently certified quality.",
      text: `We hold both ISO 9001 (Quality Management) and ISO 45001 (Occupational Health & Safety) certifications. Most small care providers in ${a.name} don't have these. They mean every aspect of our service meets independently verified international standards.`,
    },
    {
      icon: ShieldCheck,
      title: "CQC \"Good\" rated.",
      text: "The Care Quality Commission has rated our services as Good overall, confirming we meet national standards for safe, effective, caring, responsive, and well-led care.",
    },
    {
      icon: MapPin,
      title: "Locally rooted.",
      text: `We're not a national franchise. We're a local provider with deep roots in London, Essex, and Hertfordshire. Our carers live in and know ${a.name} and the surrounding communities.`,
    },
    {
      icon: Leaf,
      title: "Environmentally responsible.",
      text: "Our published Carbon Reduction Plan demonstrates our commitment to sustainable operations, increasingly important for local authority commissioning.",
    },
  ];

  return (
    <>
      <JsonLd data={localBusinessJsonLd(a.name)} />
      <Breadcrumbs items={[{ name: "Areas We Serve", url: "/areas" }, { name: a.name, url: `/areas/${a.slug}` }]} />

      <div className="mx-auto max-w-content px-4 pb-16 pt-6 md:pb-20">
        <p className="eyebrow">{a.region}</p>
        <h1 className="mt-2 font-heading text-4xl font-semibold text-ink md:text-5xl">Home Care in {a.name}</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-muted">{a.intro}</p>
        <p className="mt-4 max-w-3xl leading-relaxed text-ink-muted">
          Unique Care UK is proud to serve families across {a.name} with CQC-rated, ISO-certified care
          services. As a locally-rooted provider, we understand the unique needs of our community and deliver
          care that combines professional excellence with genuine compassion.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <a
            href={site.cqcReportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-cqc-good px-4 py-2 text-sm font-semibold text-white"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden /> CQC &quot;Good&quot; Rated
          </a>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-4 py-2 text-sm font-semibold text-brand-primary">
            <Award className="h-4 w-4" aria-hidden /> ISO 9001 Certified
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-4 py-2 text-sm font-semibold text-brand-primary">
            <Award className="h-4 w-4" aria-hidden /> ISO 45001 Certified
          </span>
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 font-semibold text-white transition hover:bg-brand-primary-dark"
          >
            Book a Free Assessment <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <a
            href={site.phonePrimaryTel}
            className="inline-flex items-center gap-2 rounded-full border-2 border-brand-primary px-6 py-3 font-semibold text-brand-primary transition hover:bg-brand-soft"
          >
            <Phone className="h-4 w-4" aria-hidden /> {site.phonePrimary}
          </a>
        </div>

        <section aria-labelledby="area-services-h" className="mt-14">
          <h2 id="area-services-h" className="font-heading text-3xl font-semibold text-ink">
            Care Services in {a.name}
          </h2>
          <p className="mt-3 text-ink-muted">
            We provide a full range of home care services across {a.surrounding}.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((s) => (
              <ServiceCard key={s.slug} service={{ ...s, short: excerpt(s.short, 120) }} />
            ))}
          </div>
        </section>

        <section aria-labelledby="area-why-h" className="mt-14">
          <h2 id="area-why-h" className="font-heading text-3xl font-semibold text-ink">
            Why Choose Unique Care UK in {a.name}?
          </h2>
          <p className="mt-3 max-w-3xl text-ink-muted">
            With over 45 home care providers in the local area alone, choosing the right one matters.
            Here&apos;s what sets Unique Care UK apart:
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {whyItems.map((w) => (
              <div key={w.title} className="fade-up flex gap-4 rounded-card border border-line bg-white p-6 shadow-card">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-primary">
                  <w.icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-heading text-lg font-semibold text-ink">{w.title}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">{w.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 font-semibold text-white transition hover:bg-brand-primary-dark"
            >
              Request a Free Assessment in {a.name} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>

        <section aria-labelledby="area-also-h" className="mt-14">
          <h2 id="area-also-h" className="font-heading text-2xl font-semibold text-ink">
            We also serve these areas
          </h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {otherAreas(a.slug).map((o) => (
              <Link
                key={o.slug}
                href={`/areas/${o.slug}`}
                className="inline-flex items-center gap-2 rounded-full border-2 border-brand-primary px-5 py-2.5 font-semibold text-brand-primary transition hover:bg-brand-soft"
              >
                <MapPin className="h-4 w-4" aria-hidden /> {o.name}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
