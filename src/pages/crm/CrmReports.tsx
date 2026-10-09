import { trpc } from "@/providers/trpc";
import { PageHeader, StatCard, Loading, ErrorState } from "@/components/common";
import { Headset, Timer, AlarmClock, TrendingUp, Star, PhoneMissed } from "lucide-react";

export default function CrmReports() {
  const q = trpc.crm.crmStats.useQuery();

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const d = q.data!;

  const maxCat = Math.max(1, ...Object.values(d.byCategory));

  return (
    <div className="space-y-6">
      <PageHeader title="CRM reports" subtitle="Volumes, SLA performance and call handling" />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Total tickets" value={d.total} icon={Headset} />
        <StatCard label="Avg first response" value={d.avgFirstResponseMin !== null ? `${d.avgFirstResponseMin} min` : "—"} icon={Timer}
          tone={d.avgFirstResponseMin !== null && d.avgFirstResponseMin > 240 ? "warn" : "good"} />
        <StatCard label="Avg resolution" value={d.avgResolutionHrs !== null ? `${d.avgResolutionHrs} hrs` : "—"} icon={TrendingUp} />
        <StatCard label="SLA breaches" value={d.slaBreaches} icon={AlarmClock} tone={d.slaBreaches > 0 ? "bad" : "good"} />
        <StatCard label="Satisfaction" value={d.csat !== null ? `${d.csat}/5` : "—"} hint={`${d.reopened} reopened · ${d.escalations} escalated`} icon={Star} />
        <StatCard label="Missed call rate" value={`${d.missedCallRate}%`} hint={`${d.missedCalls} of ${d.callsTotal} calls`} icon={PhoneMissed}
          tone={d.missedCallRate > 10 ? "bad" : d.missedCallRate > 5 ? "warn" : "good"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BarBlock title="By category" data={d.byCategory} max={maxCat} />
        <BarBlock title="By channel" data={d.byChannel} max={Math.max(1, ...Object.values(d.byChannel))} />
        <BarBlock title="By status" data={d.byStatus} max={Math.max(1, ...Object.values(d.byStatus))} />
      </div>
    </div>
  );
}

function BarBlock({ title, data, max }: { title: string; data: Record<string, number>; max: number }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <section className="uc-card p-5" aria-label={title}>
      <h2 className="uc-label mb-3">{title}</h2>
      {entries.length === 0 ? <p className="text-sm text-muted-foreground">No data yet.</p> : (
        <ul className="space-y-2">
          {entries.map(([k, v]) => (
            <li key={k}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="capitalize">{k.replace(/_/g, " ")}</span>
                <span className="font-semibold">{v}</span>
              </div>
              <div className="h-2 rounded-full bg-[--brand-100] overflow-hidden">
                <div className="h-full rounded-full bg-[--brand-500] transition-all" style={{ width: `${Math.round((v / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
