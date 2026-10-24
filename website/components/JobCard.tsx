import Link from "next/link";
import { ArrowRight, Clock3, MapPin } from "lucide-react";
import { employmentLabel, type WebsiteJob } from "@/lib/jobs-source";

export default function JobCard({ job }: { job: WebsiteJob }) {
  return (
    <article className="fade-up rounded-card border border-line bg-white p-6 shadow-card transition hover:-translate-y-1 hover:shadow-card-hover">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-xl font-semibold text-ink">
            <Link href={`/careers/jobs/${job.slug}`} className="hover:text-brand-primary hover:underline">
              {job.title}
            </Link>
          </h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
            {job.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> {job.location}
              </span>
            )}
            {job.type && (
              <span className="flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" aria-hidden /> {employmentLabel(job.type)}
              </span>
            )}
          </p>
        </div>
        <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-primary">
          {job.statusLabel}
        </span>
      </div>
      {job.summary && <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">{job.summary}</p>}
      <Link
        href={`/careers/jobs/${job.slug}`}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-primary-dark"
        aria-label={`View and apply for ${job.title}`}
      >
        Apply <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </article>
  );
}
