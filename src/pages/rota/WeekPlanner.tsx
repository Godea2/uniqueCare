import { useMemo, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import type { RouterOutputs } from "@/lib/router-types";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtTime, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { CalendarRange, Download, Lock, CalendarPlus, Percent, Route, HeartHandshake, Upload } from "lucide-react";
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
  const insightsQ = trpc.rota.weekInsights.useQuery(
    { weekId: selectedWeekId! },
    { enabled: selectedWeekId !== null },
  );

  const generate = trpc.rota.generateWeek.useMutation({
    onSuccess: (r) => {
      utils.rota.weeks.invalidate();
      utils.rota.weekData.invalidate();
      utils.rota.weekInsights.invalidate();
      utils.rota.kpis.invalidate();
      setWeekId(r.weekId);
      toast.success(`Generated ${r.visits} visits — ${r.assigned} assigned automatically, ${r.unassigned} need attention`);
    },
    onError: (e) => toast.error(e.message),
  });
  const publish = trpc.rota.publishWeek.useMutation({
    onSuccess: () => {
      utils.rota.weeks.invalidate();
      utils.rota.weekData.invalidate();
      utils.rota.weekInsights.invalidate();
      toast.success("Week published — care workers notified");
    },
    onError: (e) => toast.error(e.message),
  });

  const exportExcel = trpc.rota.exportWeekExcel.useQuery({ weekId: selectedWeekId! }, { enabled: false });
  const previewImport = trpc.rota.previewWeekImport.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const applyImport = trpc.rota.applyWeekImport.useMutation({
    onSuccess: (r) => {
      toast.success(`Imported ${r.applied} visit row(s)`);
      setImportPreview(null);
      setImportBase64(null);
      utils.rota.weekData.invalidate();
      utils.rota.weekInsights.invalidate();
      utils.rota.kpis.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<RouterOutputs["rota"]["previewWeekImport"] | null>(null);
  const [importBase64, setImportBase64] = useState<string | null>(null);

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
        subtitle="Build from each client's master visit templates, auto-assign within hard rules, export/import Excel, then publish"
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
              <>
                <Button variant="outline" onClick={async () => {
                  const r = await exportExcel.refetch();
                  if (r.data) {
                    const bin = atob(r.data.base64);
                    const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `rota-${week.weekStartDate}.xlsx`;
                    a.click();
                  }
                }}>
                  <Download className="h-4 w-4 mr-1.5" /> Excel template
                </Button>
                {week.status === "draft" && (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file || selectedWeekId == null) return;
                        const buf = await file.arrayBuffer();
                        const bytes = new Uint8Array(buf);
                        let binary = "";
                        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
                        const base64 = btoa(binary);
                        setImportBase64(base64);
                        const preview = await previewImport.mutateAsync({ weekId: selectedWeekId, base64 });
                        setImportPreview(preview);
                      }}
                    />
                    <Button variant="outline" disabled={previewImport.isPending} onClick={() => fileRef.current?.click()}>
                      <Upload className="h-4 w-4 mr-1.5" /> {previewImport.isPending ? "Checking…" : "Upload Excel"}
                    </Button>
                  </>
                )}
              </>
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
          {insightsQ.data && (
            <div className="uc-card p-4 space-y-3" data-tour="rota-insights">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
                <span className="font-semibold">Rule compliance</span>
                <span className="text-muted-foreground">
                  On-time <strong className={insightsQ.data.stats.onTimePct >= 90 ? "text-green-700" : "text-amber-700"}>{insightsQ.data.stats.onTimePct}%</strong>
                </span>
                <span className="text-muted-foreground">
                  Continuity <strong className={insightsQ.data.stats.continuityPct >= 70 ? "text-green-700" : "text-amber-700"}>{insightsQ.data.stats.continuityPct}%</strong> with primary carer
                </span>
                <span className="text-muted-foreground">Travel <strong>{insightsQ.data.stats.travelMinutes} min</strong> total</span>
                <span className="text-muted-foreground">
                  {insightsQ.data.violations.filter((v) => v.severity === "error").length === 0
                    ? <strong className="text-green-700">No rule breaches</strong>
                    : <strong className="text-red-700">{insightsQ.data.violations.filter((v) => v.severity === "error").length} breach(es)</strong>}
                </span>
              </div>
              {insightsQ.data.violations.length > 0 && (
                <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                  {insightsQ.data.violations.map((v, i) => (
                    <li key={i} className={`rounded-lg border px-3 py-2 text-xs ${
                      v.severity === "error" ? "border-red-300 bg-red-50 text-red-900"
                      : v.severity === "warning" ? "border-amber-300 bg-amber-50 text-amber-900"
                      : "border-sky-200 bg-sky-50 text-sky-900"}`}>
                      <span className="font-semibold uppercase tracking-wide mr-1.5">
                        {v.type === "rest_break" ? "11h rest" : v.type === "student_hours" ? "Student cap" : v.type === "time_window" ? "Time window" : "Continuity"}
                      </span>
                      {v.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {week?.status === "draft" && unassignedCount > 0 && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {unassignedCount} visit{unassignedCount === 1 ? "" : "s"} still need{unassignedCount === 1 ? "s" : ""} a worker — click a visit to assign manually. The engine only assigns within hard constraints (skills, availability, rest breaks, time windows, student caps, no overlaps).
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
          onDone={() => { utils.rota.weekData.invalidate(); utils.rota.weekInsights.invalidate(); setAssignVisit(null); }}
        />
      )}

      {importPreview && (
        <Dialog open onOpenChange={(o) => { if (!o) { setImportPreview(null); setImportBase64(null); } }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Import rota preview</DialogTitle>
              <DialogDescription>
                {importPreview.okCount} row(s) ready · {importPreview.errorCount} with errors
                {importPreview.sheetUsed ? ` · sheet “${importPreview.sheetUsed}”` : ""}.
                Fix errors in Excel and re-upload, or confirm when there are zero errors.
              </DialogDescription>
            </DialogHeader>
            {(importPreview.warnings?.length ?? 0) > 0 && (
              <ul className="mb-2 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {importPreview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
              {importPreview.rows.map((r) => (
                <li key={r.rowNum} className={`rounded-lg border px-3 py-2 ${r.ok ? "border-green-200 bg-green-50/50" : "border-red-300 bg-red-50"}`}>
                  <p className="font-medium">Row {r.rowNum}: {r.summary}</p>
                  {!r.ok && (
                    <ul className="mt-1 list-disc pl-4 text-xs text-red-800">
                      {r.errors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setImportPreview(null); setImportBase64(null); }}>Cancel</Button>
              <Button
                disabled={importPreview.errorCount > 0 || !importBase64 || applyImport.isPending || selectedWeekId == null}
                onClick={() => applyImport.mutate({ weekId: selectedWeekId!, base64: importBase64! })}
              >
                {applyImport.isPending ? "Applying…" : "Confirm import"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

type VisitRow = NonNullable<RouterOutputs["rota"]["weekData"]>["visits"][number];
type StaffRow = NonNullable<RouterOutputs["rota"]["weekData"]>["staff"][number];

function AssignDialog({ visit, staff, onClose, onDone }: {
  visit: VisitRow; staff: StaffRow[]; onClose: () => void; onDone: () => void;
}) {
  const isDouble = visit.callType === "double";
  const [staffId, setStaffId] = useState<number | null>(null);
  const [secondId, setSecondId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const check = trpc.rota.checkAssignment.useQuery(
    { visitId: Number(visit.id), staffId: staffId! },
    { enabled: staffId !== null },
  );
  const check2 = trpc.rota.checkAssignment.useQuery(
    { visitId: Number(visit.id), staffId: secondId! },
    { enabled: isDouble && secondId !== null },
  );
  const reassign = trpc.rota.reassignVisit.useMutation({
    onSuccess: () => { toast.success("Visit assigned"); onDone(); },
    onError: (e) => toast.error(e.message),
  });
  const canAssign = staffId !== null && !!check.data?.ok
    && (!isDouble || (secondId !== null && secondId !== staffId && !!check2.data?.ok));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {visit.client?.firstName} {visit.client?.lastName} — {fmtTime(visit.scheduledStart)} {new Date(visit.scheduledStart).toLocaleDateString("en-GB")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {(visit.visitType ?? "visit").replace(/_/g, " ")} · {isDouble ? "double-handed — pick lead then second" : "single"} · currently {visit.status.replace(/_/g, " ")}
          {visit.assignments.length > 0 && ` · assigned to ${visit.assignments.map((a) => a.staff?.fullName).join(", ")}`}
        </p>
        <p className="mt-2 text-xs font-medium text-muted-foreground">{isDouble ? "Lead carer" : "Carer"}</p>
        <div className="max-h-40 overflow-y-auto space-y-1" role="radiogroup" aria-label="Choose lead worker">
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
        {isDouble && (
          <>
            <p className="mt-3 text-xs font-medium text-muted-foreground">Second carer</p>
            <div className="max-h-40 overflow-y-auto space-y-1" role="radiogroup" aria-label="Choose second worker">
              {staff.filter((s) => Number(s.id) !== staffId).map((s) => (
                <button key={s.id} type="button" onClick={() => setSecondId(Number(s.id))}
                  aria-pressed={secondId === Number(s.id)}
                  className={`uc-focus w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${secondId === Number(s.id) ? "border-[--brand-600] bg-[--brand-50]" : "bg-white hover:bg-[--brand-50]/60"}`}
                  style={{ borderColor: secondId === Number(s.id) ? undefined : "var(--line)" }}>
                  <span className="font-medium">{s.fullName}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {staffId !== null && check.data && (
          <p className={`mt-2 rounded-lg border p-2.5 text-xs ${check.data.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"}`}>
            {check.data.ok ? "✓ Lead within hard constraints." : `✕ Lead: ${check.data.reason}`}
          </p>
        )}
        {isDouble && secondId !== null && check2.data && (
          <p className={`mt-1 rounded-lg border p-2.5 text-xs ${check2.data.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"}`}>
            {check2.data.ok ? "✓ Second within hard constraints." : `✕ Second: ${check2.data.reason}`}
          </p>
        )}
        <div className="mt-2">
          <Input placeholder="Reason (optional, shown in audit log)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Assignment reason" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!canAssign || reassign.isPending}
            onClick={() => reassign.mutate({
              visitId: Number(visit.id),
              staffId: staffId!,
              secondStaffId: isDouble ? secondId! : undefined,
              reason: reason || undefined,
            })}>
            Assign visit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
