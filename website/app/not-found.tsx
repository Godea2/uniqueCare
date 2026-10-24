import Link from "next/link";
import { ArrowRight, Phone, Search } from "lucide-react";
import { site } from "@/content/site";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-content px-4 py-24 text-center">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand-primary">
        <Search className="h-8 w-8" aria-hidden />
      </span>
      <h1 className="mt-6 font-heading text-4xl font-semibold text-ink">We couldn&apos;t find that page</h1>
      <p className="mx-auto mt-3 max-w-md text-ink-muted">
        The page you were looking for may have moved or no longer exists. Try one of these links, or call us
        on <a href={site.phonePrimaryTel} className="font-semibold text-brand-primary hover:underline">{site.phonePrimaryDisplay}</a>.
      </p>
      <nav aria-label="Quick links" className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {[
          { href: "/", label: "Home" },
          { href: "/services", label: "Services" },
          { href: "/contact", label: "Contact" },
          { href: "/careers", label: "Careers" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-brand-primary px-5 py-2.5 font-semibold text-brand-primary transition hover:bg-brand-soft"
          >
            {l.label} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ))}
      </nav>
      <p className="mt-10">
        <a href={site.phonePrimaryTel} className="inline-flex items-center gap-2 text-brand-primary hover:underline">
          <Phone className="h-4 w-4" aria-hidden /> {site.phonePrimaryDisplay}
        </a>
      </p>
    </div>
  );
}
