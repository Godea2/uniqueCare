import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, Chip, fmtDate } from "@/components/common";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Inspection pack — a print-friendly, single-page summary an inspector can be handed.
 * Everything is computed live; no hand-written figures.
 */
export default function InspectionPack() {
  const readiness = trpc.cqc.readiness.useQuery();
  const plans = trpc.cqc.plans.useQuery({});
  const incidents = trpc.cqc.incidents.useQuery();
  const org = trpc.core.organisation.useQuery();
  const reviews = trpc.cqc.reviews.useQuery();

  const loading = readiness.isLoading || plans.isLoading || incidents.isLoading || org.isLoading;
  if (loading) return <Loading rows={8} />;
  if (readiness.error) return <ErrorState message={readiness.error.message} onRetry={() => readiness.refetch()} />;

  const d = readiness.data!;
  const approvedPlans = (plans.data ?? []).filter((p) => p.status === "approved");
  const openIncidents = (incidents.data ?? []).filter((i) => i.status !== "closed");
  const dueReviews = (reviews.data ?? []).filter((r) => r.status !== "completed");

  return (
    <div className="max-w-3xl mx-auto space-y-6 print:max-w-none">
      <div className="no-print">
        <PageHeader
          title="Inspection pack"
          subtitle="Print or save as PDF — a live snapshot for CQC"
          actions={<Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" /> Print / save PDF</Button>}
        />
      </div>

      <header className="uc-card p-6 print:border-0 print:shadow-none">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Unique Care UK" className="h-10 w-auto" />
          <div>
            <h1 className="text-lg font-bold text-[--brand-900]">{org.data?.name ?? "Unique Care UK"}</h1>
            <p className="text-xs text-muted-foreground">
              Domiciliary care · CQC-registered · Generated {new Date().toLocaleString("en-GB")}
            </p>
          </div>
        </div>
      </header>

      <section className="uc-card p-6 print:break-inside-avoid">
        <h2 className="uc-label mb-3">Key question metrics</h2>
        <table className="w-full text-sm">
          <tbody>
            {[
              ["Care plans in date", `${d.carePlansPct}% (${d.carePlansInDate}/${d.carePlansTotal})`],
              ["Support plans in date", `${d.supportPlansPct}%`],
              ["Overdue plan reviews", String(d.overdueReviews)],
              ["Staff compliance (DBS + RTW + training)", `${d.staffCompliancePct}%`],
              ["Supervisions in last 90 days", String(d.supervisions90d)],
              ["Appraisals in date", String(d.appraisalsInDate)],
              ["Missed visits this week", String(d.missedVisits)],
              ["Open incidents", String(d.openIncidents)],
              ["Open safeguarding concerns", String(d.openSafeguarding)],
            ].map(([k, v]) => (
              <tr key={k} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                <td className="py-2 text-muted-foreground">{k}</td>
                <td className="py-2 text-right font-semibold">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="uc-card p-6 print:break-inside-avoid">
        <h2 className="uc-label mb-3">Approved plans ({approvedPlans.length})</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
              <th className="py-1.5 font-medium">Client</th>
              <th className="py-1.5 font-medium">Type</th>
              <th className="py-1.5 font-medium">Version</th>
              <th className="py-1.5 font-medium">Approved by</th>
              <th className="py-1.5 font-medium">Next review</th>
            </tr>
          </thead>
          <tbody>
            {approvedPlans.map((p) => (
              <tr key={p.id} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                <td className="py-1.5">{p.client?.firstName} {p.client?.lastName} ({p.client?.clientRef})</td>
                <td className="py-1.5 capitalize">{p.planType}</td>
                <td className="py-1.5">v{p.version}</td>
                <td className="py-1.5">{p.approvedBy}</td>
                <td className="py-1.5">{p.nextReviewDue ? fmtDate(p.nextReviewDue) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className="uc-card p-6 print:break-inside-avoid">
        <h2 className="uc-label mb-3">Open incidents ({openIncidents.length})</h2>
        {openIncidents.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
          <ul className="space-y-2 text-sm">
            {openIncidents.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3">
                <span>{i.category} — {i.description.slice(0, 120)}{i.description.length > 120 ? "…" : ""}</span>
                <span className="flex gap-1.5 shrink-0"><Chip value={i.severity} />{i.notifiableToCqc && <Chip value="escalated" label="CQC" />}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="uc-card p-6 print:break-inside-avoid">
        <h2 className="uc-label mb-3">Reviews due ({dueReviews.length})</h2>
        {dueReviews.length === 0 ? <p className="text-sm text-muted-foreground">None outstanding.</p> : (
          <ul className="space-y-1.5 text-sm">
            {dueReviews.slice(0, 20).map((r) => (
              <li key={r.id} className="flex justify-between">
                <span>{r.client?.firstName} {r.client?.lastName} — {r.planType} plan ({r.trigger.replace(/_/g, " ")})</span>
                <span className="text-muted-foreground">{fmtDate(r.dueDate)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-xs text-muted-foreground pb-6">
        UniqueCare Connect · All figures computed live from operational records · {new Date().toLocaleDateString("en-GB")}
      </p>
    </div>
  );
}
