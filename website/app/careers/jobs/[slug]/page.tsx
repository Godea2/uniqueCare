import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Banknote, CalendarDays, Clock3, MapPin } from "lucide-react";
import { employmentLabel, getJob, getLiveJobsOnly } from "@/lib/jobs-source";
import Breadcrumbs from "@/components/Breadcrumbs";
import { Markdown } from "@/lib/markdown";
import { JsonLd, jobPostingJsonLd } from "@/lib/jsonld";

export const revalidate = 60;
export const dynamicParams = true;

export async function generateStaticParams() {
  const live = await getLiveJobsOnly();
  return live.map((j) => ({ slug: j.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const job = await getJob(params.slug);
  if (!job) return {};
  return {
    title: `${job.title} | Careers at Unique Care UK`,
    description: job.summary ?? `Apply for ${job.title} at Unique Care UK.`,
    alternates: { canonical: `/careers/jobs/${job.slug}` },
  };
}

function ListSection({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="font-heading text-2xl font-semibold text-ink">{title}</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6 leading-relaxed text-ink-muted">
        {items.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
    </section>
  );
}

export default async function JobPage({ params }: { params: { slug: string } }) {
  const job = await getJob(params.slug);
  if (!job) notFound();

  return (
    <>
      <JsonLd data={jobPostingJsonLd(job)} />
      <Breadcrumbs
        items={[
          { name: "Careers", url: "/careers" },
          { name: "Jobs", url: "/careers/jobs" },
          { name: job.title, url: `/careers/jobs/${job.slug}` },
        ]}
      />

      <div className="mx-auto max-w-content px-4 pb-16 pt-6 md:pb-20">
        <Link
          href="/careers/jobs"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> All positions
        </Link>

        <h1 className="mt-4 font-heading text-4xl font-semibold text-ink md:text-5xl">{job.title}</h1>

        <div className="mt-4 flex flex-wrap gap-2">
          {job.location && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-4 py-2 text-sm font-medium text-ink">
              <MapPin className="h-4 w-4 text-brand-primary" aria-hidden /> {job.location}
            </span>
          )}
          {job.type && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-4 py-2 text-sm font-medium text-ink">
              <Clock3 className="h-4 w-4 text-brand-primary" aria-hidden /> {employmentLabel(job.type)}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-4 py-2 text-sm font-semibold text-brand-primary">
            {job.statusLabel}
          </span>
          {job.salary && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-4 py-2 text-sm font-medium text-ink">
              <Banknote className="h-4 w-4 text-brand-primary" aria-hidden /> {job.salary}
            </span>
          )}
          {job.closesAt && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-4 py-2 text-sm font-medium text-ink">
              <CalendarDays className="h-4 w-4 text-brand-primary" aria-hidden /> Closing date: {job.closesAt}
            </span>
          )}
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_340px]">
          <div className="space-y-10">
            {job.descriptionMd ? (
              <section aria-label="About the role">
                <Markdown text={job.descriptionMd} />
              </section>
            ) : (
              <section aria-label="About the role">
                <p className="leading-relaxed text-ink-muted">
                  See the requirements below, then apply through our recruitment portal.
                </p>
              </section>
            )}

            <ListSection title="Requirements" items={job.requirements} />
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-card border border-line bg-brand-soft p-6" id="apply">
              <h2 className="font-heading text-2xl font-semibold text-ink">Apply for this role</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                Applications are handled through our secure recruitment portal, where our team reviews every
                application.
              </p>
              {job.applyUrl ? (
                <a
                  href={job.applyUrl}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-primary-dark"
                >
                  Submit Application <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              ) : (
                <a
                  href={`mailto:info@uniquecareuk.com?subject=${encodeURIComponent(`Application: ${job.title}`)}`}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-primary-dark"
                >
                  Apply by email <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              )}
              <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                You&apos;ll need your contact details, right-to-work status and, optionally, your CV
                (PDF/DOC/DOCX, max 5 MB).
              </p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
