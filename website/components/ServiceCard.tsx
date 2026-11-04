import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Service } from "@/content/services";
import ServiceIcon from "./ServiceIcon";

export function excerpt(text: string, max = 140): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

export default function ServiceCard({ service, full, thumb }: { service: Service; full?: boolean; thumb?: string }) {
  const image = thumb ?? service.image;
  return (
    <article className="fade-up uc-card group flex flex-col overflow-hidden">
      <div className="relative">
        <img src={image} alt="" loading="lazy" className="h-40 w-full object-cover" />
        {service.badge && (
          <span className="absolute left-4 top-4 rounded-full bg-brand-secondary px-3 py-1 text-xs font-semibold text-white shadow-card">
            {service.badge}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
        <span className="uc-icon h-14 w-14">
          <ServiceIcon name={service.icon} />
        </span>
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
      </div>
    </article>
  );
}
