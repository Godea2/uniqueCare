import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, StatCard, Loading, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, FileText, Users, ClipboardList, Star,
  AlertTriangle, CalendarRange, ShieldAlert,
} from "lucide-react";

export default function Readiness() {
  const q = trpc.cqc.readiness.useQuery();
  const kpisQ = trpc.rota.kpis.useQuery();

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const d = q.data!;

  const questions = [
    {
      key: "Safe", icon: ShieldCheck,
      stats: [
        { label: "Open safeguarding concerns", value: d.openSafeguarding, bad: d.openSafeguarding > 0 },
        { label: "Open incidents", value: d.openIncidents, bad: false },
        { label: "Missed visits this week", value: d.missedVisits, bad: d.missedVisits > 0 },
      ],
      to: "/cqc/incidents",
    },
    {
      key: "Effective", icon: FileText,
      stats: [
        { label: "Care plans in date", value: `${d.carePlansPct}%`, bad: d.carePlansPct < 90 },
        { label: "Support plans in date", value: `${d.supportPlansPct}%`, bad: d.supportPlansPct < 90 },
        { label: "Overdue reviews", value: d.overdueReviews, bad: d.overdueReviews > 0 },
      ],
      to: "/clients/reviews",
    },
    {
      key: "Caring", icon: Users,
      stats: [
        { label: "Continuity (primary carer)", value: `${kpisQ.data?.continuity ?? "—"}%`, bad: (kpisQ.data?.continuity ?? 100) < 60 },
        { label: "Visit fill rate", value: `${kpisQ.data?.fillRate ?? "—"}%`, bad: (kpisQ.data?.fillRate ?? 100) < 95 },
      ],
      to: "/rota",
    },
    {
      key: "Responsive", icon: CalendarRange,
      stats: [
        { label: "Assigned visits this week", value: d.assignments, bad: false },
        { label: "Unfilled visits", value: kpisQ.data?.unassigned ?? "—", bad: (kpisQ.data?.unassigned ?? 0) > 0 },
      ],
      to: "/rota",
    },
    {
      key: "Well-led", icon: Star,
      stats: [
        { label: "Staff compliance", value: `${d.staffCompliancePct}%`, bad: d.staffCompliancePct < 90 },
        { label: "Supervisions (90 days)", value: d.supervisions90d, bad: false },
        { label: "Appraisals in date", value: d.appraisalsInDate, bad: false },
      ],
      to: "/staff/compliance",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="CQC readiness"
        subtitle="Live evidence against the five key questions — what an inspector would ask for first"
        actions={
          <Link to="/cqc/inspection-pack">
            <Button variant="outline"><ClipboardList className="h-4 w-4 mr-1.5" /> Inspection pack</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {questions.map((qq) => (
          <Link key={qq.key} to={qq.to} className="uc-focus rounded-xl">
            <div className="uc-card p-4 h-full hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-3">
                <qq.icon className="h-4 w-4 text-[--brand-600]" aria-hidden />
                <h2 className="font-semibold text-[--brand-900]">{qq.key}</h2>
              </div>
              <ul className="space-y-2">
                {qq.stats.map((s) => (
                  <li key={s.label} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground text-xs pr-2">{s.label}</span>
                    <span className={`font-bold ${s.bad ? "text-red-700" : "text-[--brand-900]"}`}>{s.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Care plans in date" value={`${d.carePlansPct}%`} hint={`${d.carePlansInDate} of ${d.carePlansTotal}`} icon={FileText} tone={d.carePlansPct >= 90 ? "good" : "warn"} />
        <StatCard label="Overdue reviews" value={d.overdueReviews} hint="Annual + change-triggered" icon={ClipboardList} tone={d.overdueReviews > 0 ? "bad" : "good"} />
        <StatCard label="Staff compliance" value={`${d.staffCompliancePct}%`} hint="DBS + RTW + training" icon={Users} tone={d.staffCompliancePct >= 90 ? "good" : "warn"} />
        <StatCard label="Open safeguarding" value={d.openSafeguarding} hint="Management only" icon={ShieldAlert} tone={d.openSafeguarding > 0 ? "bad" : "good"} />
      </div>

      <div className="uc-card p-5">
        <h2 className="uc-label mb-2 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> How this dashboard works</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Every figure is computed live from the operational database — plans and review dates from the plan register,
          staffing from the compliance matrix, visits from the rota. Nothing here is entered by hand, so the dashboard
          can be shown to an inspector as-is.
        </p>
      </div>
    </div>
  );
}
