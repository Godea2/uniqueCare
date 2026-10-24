import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { areas } from "@/content/areas";

export const metadata: Metadata = {
  title: "Areas We Serve | Home Care London & Hertfordshire | Unique Care UK",
  description:
    "Unique Care UK provides domiciliary care, live-in care, and supported living across London, Essex, and Hertfordshire. ISO certified. CQC 'Good' rated. Call 02039170260.",
  alternates: { canonical: "/areas" },
};

export default function AreasPage() {
  return (
    <div className="mx-auto max-w-content px-4 pb-16 pt-12 md:pb-20">
      <h1 className="font-heading text-4xl font-semibold text-ink md:text-5xl">Areas We Serve</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-muted">
        Unique Care UK provides professional home care services across London, Essex, and Hertfordshire.
        Select your area below to learn more about our services near you.
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {areas.map((a) => (
          <article
            key={a.slug}
            className="fade-up flex flex-col rounded-card border border-line bg-white p-6 shadow-card transition hover:-translate-y-1 hover:shadow-card-hover"
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-secondary">
              <MapPin className="h-3.5 w-3.5" aria-hidden /> {a.region}
            </span>
            <h2 className="mt-2 font-heading text-2xl font-semibold text-ink">{a.name}</h2>
            <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-muted">{a.intro}</p>
            <Link
              href={`/areas/${a.slug}`}
              className="mt-4 inline-flex items-center gap-1.5 font-semibold text-brand-primary hover:underline"
            >
              View services in {a.name} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
