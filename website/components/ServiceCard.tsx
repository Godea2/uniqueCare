import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Service } from "@/content/services";
import ServiceIcon from "./ServiceIcon";

export function excerpt(text: string, max = 140): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

export default function ServiceCard({ service, full }: { service: Service; full?: boolean }) {
  return (
    <article className="fade-up group flex flex-col rounded-card border border-line bg-white p-6 shadow-card transition hover:-translate-y-1 hover:shadow-card-hover">
      <div className="flex items-start justify-between">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand-primary">
          <ServiceIcon name={service.icon} />
        </span>
        {service.badge && (
          <span className="rounded-full bg-brand-secondary px-3 py-1 text-xs font-semibold text-white">
            {service.badge}
          </span>
        )}
      </div>
      <h3 className="mt-4 font-heading text-xl font-semibold text-ink">{service.name}</h3>
      <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-muted">
        {full ? service.short : excerpt(service.short)}
      </p>
      <Link
        href={`/services/${service.slug}`}
        className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-primary hover:underline"
        aria-label={`Learn more about ${service.name}`}
      >
        Learn more <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </article>
  );
}
