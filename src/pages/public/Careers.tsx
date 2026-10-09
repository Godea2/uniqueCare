import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { Loading, ErrorState, fmtDate, Markdown } from "@/components/common";
import { MapPin, Clock3, ArrowRight } from "lucide-react";

export default function Careers() {
  const q = trpc.hr.publicJobs.useQuery();

  return (
    <div className="min-h-screen bg-[--brand-50]">
      <header className="bg-white border-b" style={{ borderColor: "var(--line)" }}>
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <img src="/logo.png" alt="Unique Care UK" className="h-9 w-auto" />
          <span className="text-xs text-muted-foreground">CQC-registered domiciliary care · Birmingham</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold text-[--brand-900] tracking-tight">Work with Unique Care UK</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-700">
          We provide outstanding, person-centred home care across Birmingham. If you are kind, reliable and
          want a role where what you do genuinely matters, we would love to hear from you. We offer full
          induction training, funded qualifications, paid travel time and real progression.
        </p>

        <h2 className="uc-label mt-10 mb-3">Current vacancies</h2>
        {q.isLoading ? <Loading rows={3} /> : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} /> : (
          <div className="space-y-3">
            {(q.data ?? []).map((j) => (
              <article key={j.id} id={j.publicSlug} className="uc-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-lg text-[--brand-900]">{j.title}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{j.location}</span>
                      {j.salaryText && <span className="font-medium text-[--brand-700]">{j.salaryText}</span>}
                      <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden />{j.employmentType.replace(/_/g, " ")}</span>
                    </p>
                  </div>
                  <Link to={`/apply/${j.applySlug ?? j.publicSlug}`}>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-[--brand-600] px-4 py-2 text-sm font-semibold text-white hover:bg-[--brand-700] transition-colors uc-focus">
                      Apply now <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
                  </Link>
                </div>
                <div className="mt-3 text-sm text-slate-700 line-clamp-5 overflow-hidden"><Markdown text={(j.descriptionMd ?? "").split("\n\n").slice(1, 3).join("\n\n")} /></div>
                {j.closesAt && <p className="mt-2 text-xs text-muted-foreground">Closing date: {fmtDate(j.closesAt)}</p>}
              </article>
            ))}
            {(q.data ?? []).length === 0 && (
              <p className="uc-card p-8 text-center text-sm text-muted-foreground">
                No open vacancies right now — please check back soon.
              </p>
            )}
          </div>
        )}

        <footer className="mt-12 border-t pt-4 text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
          Unique Care UK is an equal opportunities employer. All roles require an enhanced DBS check and
          satisfactory references in line with CQC Regulation 19 (fit and proper persons employed).
        </footer>
      </main>
    </div>
  );
}
