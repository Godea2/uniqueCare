import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { breadcrumbJsonLd, JsonLd } from "@/lib/jsonld";

export default function Breadcrumbs({ items }: { items: { name: string; url: string }[] }) {
  const all = [{ name: "Home", url: "/" }, ...items];
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(all)} />
      <nav aria-label="Breadcrumb" className="mx-auto max-w-content px-4 pt-5">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
          {all.map((it, i) => (
            <li key={it.url + it.name} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
              {i === all.length - 1 ? (
                <span aria-current="page" className="font-medium text-ink">
                  {it.name}
                </span>
              ) : (
                <Link href={it.url} className="hover:text-brand-primary hover:underline">
                  {it.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
