import type { MetadataRoute } from "next";
import { services } from "@/content/services";
import { areas } from "@/content/areas";
import { posts } from "@/content/posts";
import { site } from "@/content/site";
import { getLiveJobsOnly } from "@/lib/jobs-source";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const jobs = await getLiveJobsOnly();

  const staticRoutes = [
    "",
    "/about",
    "/services",
    "/areas",
    "/careers",
    "/careers/jobs",
    "/careers/jobs/general-application",
    "/blog",
    "/reviews",
    "/contact",
    "/privacy",
    "/terms",
    "/modern-slavery",
    "/carbon-reduction-plan",
  ];

  return [
    ...staticRoutes.map((p) => ({
      url: `${site.url}${p}`,
      lastModified: new Date(),
      changeFrequency: p === "" ? ("weekly" as const) : ("monthly" as const),
      priority: p === "" ? 1 : 0.7,
    })),
    ...services.map((s) => ({
      url: `${site.url}/services/${s.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...areas.map((a) => ({
      url: `${site.url}/areas/${a.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...posts.map((p) => ({
      url: `${site.url}/blog/${p.slug}`,
      lastModified: new Date(p.date),
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
    ...jobs.map((j) => ({
      url: `${site.url}/careers/jobs/${j.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
