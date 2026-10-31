"use client";

import { useMemo, useState } from "react";
import type { WebsiteJob } from "@/lib/jobs-source";
import { employmentLabel } from "@/lib/jobs-source";
import JobCard from "./JobCard";

export default function JobsList({ jobs }: { jobs: WebsiteJob[] }) {
  const [filter, setFilter] = useState("All");
  const types = useMemo(
    () => ["All", ...Array.from(new Set(jobs.filter((j) => j.type).map((j) => employmentLabel(j.type))))],
    [jobs]
  );
  const shown =
    filter === "All" ? jobs : jobs.filter((j) => employmentLabel(j.type) === filter);

  return (
    <div>
      {types.length > 2 && (
        <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter jobs by employment type">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={filter === t}
              onClick={() => setFilter(t)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                filter === t
                  ? "bg-brand-primary text-white"
                  : "border border-line bg-white text-ink hover:bg-brand-soft"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {shown.map((j) => (
          <JobCard key={j.slug} job={j} />
        ))}
      </div>
      {shown.length === 0 && (
        <p className="rounded-card border border-line bg-surface-alt p-8 text-center text-ink-muted">
          There are no open positions right now.{" "}
          <a href="/contact" className="font-semibold text-brand-primary hover:underline">
            Get in touch
          </a>{" "}
          if you&apos;d like to introduce yourself.
        </p>
      )}
    </div>
  );
}
