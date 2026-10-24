import { site } from "@/content/site";
import type { WebsiteJob } from "./jobs-source";

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON-LD is generated from our own typed content, not user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "HomeHealthCareService"],
    name: site.name,
    legalName: site.legalName,
    url: site.url,
    logo: `${site.url}/images/logo-horizontal.png`,
    telephone: "+442039170260",
    email: site.email,
    foundingDate: String(site.founded),
    vatID: site.vat,
    openingHours: "Mo-Fr 09:00-17:00",
    address: site.offices.map((o) => ({
      "@type": "PostalAddress",
      name: o.name,
      streetAddress: o.address,
      addressCountry: "GB",
    })),
    areaServed: site.areas.map((a) => ({ "@type": "AdministrativeArea", name: a })),
    sameAs: [site.social.facebook, site.social.instagram, site.social.linkedin],
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${site.url}${it.url}`,
    })),
  };
}

export function serviceJsonLd(s: { name: string; short: string; slug: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: s.name,
    description: s.short,
    url: `${site.url}/services/${s.slug}`,
    provider: { "@type": "Organization", name: site.name, url: site.url },
    areaServed: site.areas.map((a) => ({ "@type": "AdministrativeArea", name: a })),
  };
}

export function localBusinessJsonLd(area: string) {
  return {
    "@context": "https://schema.org",
    "@type": ["HomeHealthCareService", "LocalBusiness"],
    name: `${site.name} — ${area}`,
    url: site.url,
    telephone: "+442039170260",
    email: site.email,
    areaServed: { "@type": "AdministrativeArea", name: area },
    address: site.offices.map((o) => ({
      "@type": "PostalAddress",
      name: o.name,
      streetAddress: o.address,
      addressCountry: "GB",
    })),
  };
}

const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  nights: "OTHER",
  bank: "TEMPORARY",
  temporary: "TEMPORARY",
  permanent: "FULL_TIME",
};

export function jobPostingJsonLd(job: WebsiteJob) {
  const now = new Date();
  const validThrough = new Date(now.getTime() + 90 * 24 * 3600 * 1000).toISOString();
  const description = [job.summary, job.descriptionMd?.replace(/[#*]/g, "")]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description,
    hiringOrganization: { "@type": "Organization", name: site.name, sameAs: site.url, logo: `${site.url}/images/logo-horizontal.png` },
    jobLocation: site.areas.map((a) => ({
      "@type": "Place",
      address: { "@type": "PostalAddress", addressRegion: a, addressCountry: "GB" },
    })),
    employmentType: EMPLOYMENT_TYPE_MAP[job.type ?? ""] ?? "FULL_TIME",
    datePosted: job.postedAt ?? now.toISOString(),
    validThrough: job.closesAt ? `${job.closesAt}T23:59:59Z` : validThrough,
    directApply: true,
    url: `${site.url}/careers/jobs/${job.slug}`,
  };
}

export function articleJsonLd(p: {
  slug: string;
  title: string;
  excerpt: string;
  image: string;
  date: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: p.title,
    description: p.excerpt,
    image: `${site.url}${p.image}`,
    datePublished: p.date,
    author: { "@type": "Organization", name: site.name, url: site.url },
    publisher: {
      "@type": "Organization",
      name: site.name,
      logo: { "@type": "ImageObject", url: `${site.url}/images/logo-horizontal.png` },
    },
    mainEntityOfPage: `${site.url}/blog/${p.slug}`,
  };
}

export function aggregateRatingJsonLd(rating: number, count: number) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: rating.toFixed(1),
      reviewCount: count,
    },
  };
}
