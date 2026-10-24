import type { Metadata } from "next";
import { services } from "@/content/services";
import ServiceCard from "@/components/ServiceCard";

export const metadata: Metadata = {
  title: "Home Care Services | Domiciliary, Live-in & Supported Living | Unique Care UK",
  description:
    "Explore our 8 specialist care services including domiciliary care, live-in care, supported living, dementia care and more. ISO certified, CQC rated Good.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <div className="mx-auto max-w-content px-4 pb-16 pt-12 md:pb-20">
      <span className="inline-block rounded-full bg-brand-soft px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-brand-primary">
        8 specialist services
      </span>
      <h1 className="mt-4 font-heading text-4xl font-semibold text-ink md:text-5xl">Our care services</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-muted">
        We are committed to supporting our service users with the best care and support to achieve comfortable
        and independent living.
      </p>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {services.map((s) => (
          <ServiceCard key={s.slug} service={s} full />
        ))}
      </div>
    </div>
  );
}
