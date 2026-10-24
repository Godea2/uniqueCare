import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Phone } from "lucide-react";
import { getService, otherServices, services } from "@/content/services";
import { site } from "@/content/site";
import Breadcrumbs from "@/components/Breadcrumbs";
import { JsonLd, serviceJsonLd } from "@/lib/jsonld";

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const s = getService(params.slug);
  if (!s) return {};
  return {
    title: `${s.name} Services | Unique Care UK`,
    description: s.short,
    alternates: { canonical: `/services/${s.slug}` },
  };
}

export default function ServicePage({ params }: { params: { slug: string } }) {
  const s = getService(params.slug);
  if (!s) notFound();

  return (
    <>
      <JsonLd data={serviceJsonLd(s)} />
      <Breadcrumbs items={[{ name: "Services", url: "/services" }, { name: s.name, url: `/services/${s.slug}` }]} />

      <div className="mx-auto max-w-content px-4 pb-16 pt-6 md:pb-20">
        {/* Hero */}
        <div className="max-w-3xl">
          <h1 className="font-heading text-4xl font-semibold text-ink md:text-5xl">{s.name}</h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-muted">{s.short}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/contact?service=${s.slug}`}
              className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 font-semibold text-white transition hover:bg-brand-primary-dark"
            >
              Enquire about this service <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <a
              href={site.phonePrimaryTel}
              className="inline-flex items-center gap-2 rounded-full border-2 border-brand-primary px-6 py-3 font-semibold text-brand-primary transition hover:bg-brand-soft"
            >
              <Phone className="h-4 w-4" aria-hidden /> {site.phonePrimary}
            </a>
          </div>
        </div>

        <Image
          src={s.image}
          alt={s.imageAlt}
          width={1200}
          height={800}
          className="mt-10 w-full rounded-card object-cover shadow-card"
          priority={s.slug === "domiciliary-care"}
        />

        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="prose-legal">
            <p>{s.body[0]}</p>
            <p>{s.body[1]}</p>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-card border border-line bg-brand-soft p-6">
              <h2 className="font-heading text-xl font-semibold text-ink">Need this service?</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                Contact us today for a free, non-obligatory assessment of your care needs.
              </p>
              <Link
                href={`/contact?service=${s.slug}`}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-primary-dark"
              >
                Get in Touch <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <nav aria-label="Other services" className="rounded-card border border-line bg-white p-6 shadow-card">
              <h2 className="font-heading text-xl font-semibold text-ink">Other Services</h2>
              <ul className="mt-3 space-y-2">
                {otherServices(s.slug).map((o) => (
                  <li key={o.slug}>
                    <Link
                      href={`/services/${o.slug}`}
                      className="flex items-center justify-between rounded-lg px-3 py-2.5 text-[15px] font-medium text-ink hover:bg-brand-soft hover:text-brand-primary"
                    >
                      {o.name}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        </div>
      </div>
    </>
  );
}
