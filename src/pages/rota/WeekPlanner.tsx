import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import type { RouterOutputs } from "@/lib/router-types";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtTime, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CalendarRange, Download, Lock, CalendarPlus, Percent, Route, HeartHandshake } from "lucide-react";
import { toast } from "sonner";

function mondayOf(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

export default function WeekPlanner() {
  const utils = trpc.useUtils();
  const weeksQ = trpc.rota.weeks.useQuery();
  const kpisQ = trpc.rota.kpis.useQuery();
  const [weekId, setWeekId] = useState<number | null>(null);
  const [genDate, setGenDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return mondayOf(d);
  });

  const selectedWeekId = weekId ?? (weeksQ.data?.[0] ? Number(weeksQ.data[0].id) : null);
  const dataQ = trpc.rota.weekData.useQuery({ weekId: selectedWeekId! }, { enabled: selectedWeekId !== null });

  const generate = trpc.rota.generateWeek.useMutation({
    onSuccess: (r) => {
      utils.rota.weeks.invalidate();
      setWeekId(r.weekId);
      toast.success(`Generated ${r.visits} visits — ${r.assigned} assigned automatically, ${r.unassigned} need attention`);
    },
    onError: (e) => toast.error(e.message),
  });
  const publish = trpc.rota.publishWeek.useMutation({
    onSuccess: () => { utils.rota.weeks.invalidate(); utils.rota.weekData.invalidate(); toast.success("Week published — care workers notified"); },
    onError: (e) => toast.error(e.message),
  });

  const exportCsv = trpc.rota.exportWeekCsv.useQuery({ weekId: selectedWeekId! }, { enabled: false });

  const byDay = useMemo(() => {
    const days: Record<number, NonNullable<typeof dataQ.data>["visits"]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const v of dataQ.data?.visits ?? []) {
      const dow = (new Date(v.scheduledStart).getDay() + 6) % 7;
      days[dow].push(v);
    }
    return days;
  }, [dataQ.data]);

  const [assignVisit, setAssignVisit] = useState<number | null>(null);

  const week = dataQ.data?.week;
  const visits = dataQ.data?.visits ?? [];
  const unassignedCount = visits.filter((v) => v.status === "unassigned" || v.status === "partially_assigned").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Week planner"
        subtitle="Generate from visit templates, review assignments, publish to care workers"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Input type="date" value={genDate} onChange={(e) => setGenDate(mondayOf(new Date(e.target.value)))} className="w-40" aria-label="Week starting (Monday)" />
            <Button variant="outline" disabled={generate.isPending} onClick={() => generate.mutate({ weekStartDate: genDate })}>
              {generate.isPending ? "Generating…" : "Generate week"}
            </Button>
            {week?.status === "draft" && (
              <Button disabled={publish.isPending} onClick={() => publish.mutate({ weekId: Number(week.id) })}>
                <Lock className="h-4 w-4 mr-1.5" /> Publish week
              </Button>
            )}
            {week && (
              <Button variant="outline" onClick={async () => {
                const r = await exportCsv.refetch();
                if (r.data) {
                  const blob = new Blob([r.data.csv], { type: "text/csv" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `rota-${week.weekStartDate}.csv`;
                  a.click();
                }
              }}>
                <Download className="h-4 w-4 mr-1.5" /> CSV
              </Button>
            )}
          </div>
        }
      />

      {kpisQ.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Fill rate (this week)" value={`${kpisQ.data.fillRate}%`} hint={`${kpisQ.data.unassigned} unassigned`} icon={Percent} tone={kpisQ.data.fillRate >= 98 ? "good" : kpisQ.data.fillRate >= 90 ? "warn" : "bad"} />
          <StatCard label="Missed visits" value={kpisQ.data.missed} hint="This week" icon={CalendarRange} tone={kpisQ.data.missed > 0 ? "bad" : "good"} />
          <StatCard label="Continuity" value={`${kpisQ.data.continuity}%`} hint="Visits with primary carer" icon={HeartHandshake} tone={kpisQ.data.continuity >= 70 ? "good" : "warn"} />
          <StatCard label="Travel time" value={`${kpisQ.data.travelMinutes} min`} hint="Total between visits" icon={Route} />
        </div>
      )}

      {/* Week selector */}
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Rota weeks">
        {(weeksQ.data ?? []).map((w) => (
          <button key={w.id} role="tab" aria-selected={selectedWeekId === Number(w.id)}
            onClick={() => setWeekId(Number(w.id))}
            className={`uc-focus shrink-0 rounded-xl border px-3.5 py-2 text-sm ${selectedWeekId === Number(w.id) ? "bg-[--brand-600] text-white border-[--brand-600]" : "bg-white hover:bg-[--brand-50]"}`}
            style={{ borderColor: selectedWeekId === Number(w.id) ? undefined : "var(--line)" }}>
            <span className="block font-medium">{new Date(w.weekStartDate + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            <Chip value={w.status} />
          </button>
        ))}
        {(weeksQ.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No rota weeks yet — generate one above.</p>
        )}
      </div>

      {selectedWeekId === null ? (
        <EmptyState icon={CalendarPlus} title="Generate your first week" hint="Visits are created from each client's visit templates, then assigned automatically within every hard constraint." />
      ) : dataQ.isLoading ? <Loading rows={6} /> : dataQ.error ? <ErrorState message={dataQ.error.message} onRetry={() => dataQ.refetch()} /> : (
        <>
          {week?.status === "draft" && unassignedCount > 0 && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {unassignedCount} visit{unassignedCount === 1 ? "" : "s"} still need{unassignedCount === 1 ? "s" : ""} a worker — click a visit to assign manually. The engine only assigns within hard constraints (skills, availability, gender preference, no overlaps, hours caps).
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-7 gap-2" data-tour="rota-grid">
            {[0, 1, 2, 3, 4, 5, 6].map((dow) => (
              <div key={dow} className="min-h-40 uc-kanban-col" style={{ background: dow % 2 === 0 ? "#e8f3fb" : "#eef1f9" }}>
                <p className="mb-2 flex items-center justify-between px-1 pt-0.5 text-[13px] font-semibold text-[#2f7fc4]">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][dow]}
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold text-[#2f7fc4] shadow-sm">
                    {week ? new Date(new Date(week.weekStartDate + "T00:00").getTime() + dow * 864e5).toLocaleDateString("en-GB", { day: "numeric" }) : ""}
                  </span>
                </p>
                <div className="space-y-1.5">
                  {byDay[dow].map((v) => {
                    const names = v.assignments.map((a) => a.staff?.fullName).filter(Boolean);
                    const open = v.status === "unassigned" || v.status === "partially_assigned";
                    return (
                      <button
                        key={v.id}
                        onClick={() => setAssignVisit(Number(v.id))}
                        className={`uc-focus w-full rounded-xl border p-2.5 text-left text-xs shadow-sm transition-shadow hover:shadow-md ${open ? "border-red-300 bg-red-50/60" : "bg-white"}`}
                        style={{ borderColor: open ? undefined : "var(--line)" }}
                      >
                        <span className="block font-semibold text-[--brand-900]">
                          {fmtTime(v.scheduledStart)}–{fmtTime(v.scheduledEnd)}
                        </span>
                        <span className="block truncate">{v.client?.firstName} {v.client?.lastName}</span>
                        <span className="block text-muted-foreground">{(v.visitType ?? "visit").replace(/_/g, " ")}{v.callType === "double" ? " · 2 carers" : ""}</span>
                        <span className={`block mt-1 font-medium ${open ? "text-red-700" : "text-[--brand-700]"}`}>
                          {names.length ? names.join(" & ") : "Unassigned"}
                        </span>
                      </button>
                    );
                  })}
                  {byDay[dow].length === 0 && <div className="rounded-lg border border-dashed py-4 text-center text-[10px] text-muted-foreground" style={{ borderColor: "var(--line)" }}>No visits</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {assignVisit !== null && dataQ.data && (
        <AssignDialog
          visit={dataQ.data.visits.find((v) => Number(v.id) === assignVisit)!}
          staff={dataQ.data.staff}
          onClose={() => setAssignVisit(null)}
          onDone={() => { utils.rota.weekData.invalidate(); setAssignVisit(null); }}
        />
      )}
    </div>
  );
}

type VisitRow = NonNullable<RouterOutputs["rota"]["weekData"]>["visits"][number];
type StaffRow = NonNullable<RouterOutputs["rota"]["weekData"]>["staff"][number];

function AssignDialog({ visit, staff, onClose, onDone }: {
  visit: VisitRow; staff: StaffRow[]; onClose: () => void; onDone: () => void;
}) {
  const [staffId, setStaffId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const check = trpc.rota.checkAssignment.useQuery(
    { visitId: Number(visit.id), staffId: staffId! },
    { enabled: staffId !== null },
  );
  const reassign = trpc.rota.reassignVisit.useMutation({
    onSuccess: () => { toast.success("Visit assigned"); onDone(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {visit.client?.firstName} {visit.client?.lastName} — {fmtTime(visit.scheduledStart)} {new Date(visit.scheduledStart).toLocaleDateString("en-GB")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {(visit.visitType ?? "visit").replace(/_/g, " ")} · {visit.callType === "double" ? "double-handed (assign lead here)" : "single"} · currently {visit.status.replace(/_/g, " ")}
          {visit.assignments.length > 0 && ` · assigned to ${visit.assignments.map((a) => a.staff?.fullName).join(", ")}`}
        </p>
        <div className="mt-2 max-h-64 overflow-y-auto space-y-1" role="radiogroup" aria-label="Choose worker">
          {staff.map((s) => (
            <button key={s.id} type="button" onClick={() => setStaffId(Number(s.id))}
              aria-pressed={staffId === Number(s.id)}
              className={`uc-focus w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${staffId === Number(s.id) ? "border-[--brand-600] bg-[--brand-50]" : "bg-white hover:bg-[--brand-50]/60"}`}
              style={{ borderColor: staffId === Number(s.id) ? undefined : "var(--line)" }}>
              <span className="font-medium">{s.fullName}</span>
              <span className="text-xs text-muted-foreground">{s.jobTitle}</span>
            </button>
          ))}
        </div>
        {staffId !== null && check.data && (
          <p className={`mt-2 rounded-lg border p-2.5 text-xs ${check.data.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"}`}>
            {check.data.ok ? "✓ Within all hard constraints (skills, availability, gender preference, no overlaps, hours cap)." : `✕ ${check.data.reason}`}
          </p>
        )}
        <div className="mt-2">
          <Input placeholder="Reason (optional, shown in audit log)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Assignment reason" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={staffId === null || !check.data?.ok || reassign.isPending}
            onClick={() => reassign.mutate({ visitId: Number(visit.id), staffId: staffId!, reason: reason || undefined })}>
            Assign visit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
