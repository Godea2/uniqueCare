import Link from "next/link";
import { ArrowRight, Clock3, MapPin } from "lucide-react";
import { employmentLabel, type WebsiteJob } from "@/lib/jobs-source";

export default function JobCard({ job }: { job: WebsiteJob }) {
  return (
    <article className="fade-up uc-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-xl font-semibold text-ink">
            <Link href={`/careers/jobs/${job.slug}`} className="hover:text-brand-primary hover:underline">
              {job.title}
            </Link>
          </h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
            {job.location && (
              <span className="flex items-center gap-1.5">
                <span className="uc-icon-3d h-6 w-6 shrink-0"><MapPin className="h-3 w-3" aria-hidden /></span> {job.location}
              </span>
            )}
            {job.type && (
              <span className="flex items-center gap-1.5">
                <span className="uc-icon-3d h-6 w-6 shrink-0"><Clock3 className="h-3 w-3" aria-hidden /></span> {employmentLabel(job.type)}
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
        className="uc-btn-primary mt-4 self-start px-5 py-2.5 text-sm"
        aria-label={`View and apply for ${job.title}`}
      >
        Apply <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </article>
  );
}
