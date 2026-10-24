import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getJobs } from "@/lib/jobs-source";
import JobsList from "@/components/JobsList";

export const metadata: Metadata = {
  title: "Care Jobs | Open Positions in London, Essex & Hertfordshire | Unique Care UK",
  description:
    "Browse open care positions at Unique Care UK. Compassionate carers wanted across London, Essex, and Hertfordshire. Full training provided.",
  alternates: { canonical: "/careers/jobs" },
};

export const revalidate = 300;

export default async function JobsPage() {
  const all = await getJobs();
  const jobs = all.filter((j) => j.listedInGrid);

  return (
    <div className="mx-auto max-w-content px-4 pb-16 pt-12 md:pb-20">
      <p className="eyebrow">We&apos;re always hiring</p>
      <h1 className="mt-2 font-heading text-4xl font-semibold text-ink md:text-5xl">Open Positions</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-muted">
        We&apos;re always looking for compassionate people to join our team. All positions are continuously
        open. Apply anytime and we&apos;ll be in touch.
      </p>

      <div className="mt-10">
        <JobsList jobs={jobs} />
      </div>

      <div className="mt-12 rounded-card border border-line bg-brand-soft p-8 text-center">
        <h2 className="font-heading text-2xl font-semibold text-ink">Don&apos;t see your role?</h2>
        <p className="mx-auto mt-2 max-w-xl text-ink-muted">
          We&apos;re always interested in hearing from talented care professionals. Send us your CV and
          we&apos;ll keep it on file for future opportunities.
        </p>
        <Link
          href="/careers/jobs/general-application"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 font-semibold text-white transition hover:bg-brand-primary-dark"
        >
          Send a General Application <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
