import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, Chip, EmptyState } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fmtMinutes, fmtMoney } from "@/lib/geolocation";
import { ClipboardList, Download, MapPin, ChevronRight } from "lucide-react";
import { toast } from "sonner";

function mondayOf(d = new Date()) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}
function sundayOf(monday: string) {
  const x = new Date(monday + "T12:00:00");
  x.setDate(x.getDate() + 6);
  return x.toISOString().slice(0, 10);
}

type DaySession = {
  id: number;
  visitId: number;
  clientName: string;
  clockInAt: string;
  clockOutAt: string | null;
  clockMinutes: number;
  paidMinutes: number;
  unpaidGraceMinutes: number;
  grossPay: number;
  reason: string | null;
  status: string;
};

type DayRow = {
  date: string;
  paidMinutes: number;
  unpaidGraceMinutes: number;
  clockMinutes: number;
  grossPay: number;
  sessions: DaySession[];
};

export default function Timesheets() {
  const meQ = trpc.core.me.useQuery();
  const role = meQ.data?.homeRole ?? meQ.data?.role;
  const isAdmin = role === "super_admin" || role === "admin" || role === "care_coordinator" || role === "team_leader";
  const canExport = role === "super_admin" || role === "admin" || role === "care_coordinator";

  const [from, setFrom] = useState(() => mondayOf());
  const [to, setTo] = useState(() => sundayOf(mondayOf()));
  const [staffId, setStaffId] = useState<string>("all");
  const [trailId, setTrailId] = useState<number | null>(null);

  const staffQ = trpc.core.staffList.useQuery(undefined, { enabled: isAdmin });
  const mineQ = trpc.attendance.myTimesheet.useQuery({ from, to }, { enabled: !isAdmin && !!meQ.data });
  const payQ = trpc.attendance.payrollSummary.useQuery(
    { from, to, staffId: staffId === "all" ? undefined : Number(staffId) },
    { enabled: isAdmin },
  );
  const exportQ = trpc.attendance.payrollExportCsv.useQuery(
    { from, to, staffId: staffId === "all" ? undefined : Number(staffId) },
    { enabled: false },
  );

  const carers = useMemo(
    () => (staffQ.data ?? []).filter((s) => ["care_worker", "team_leader", "supervisor"].includes(s.role) && s.status === "active"),
    [staffQ.data],
  );

  async function downloadCsv() {
    const r = await exportQ.refetch();
    if (!r.data) {
      toast.error(r.error?.message ?? "Could not build payroll CSV");
      return;
    }
    const blob = new Blob([r.data.csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = r.data.filename;
    a.click();
    toast.success("Payroll CSV downloaded");
  }

  if (meQ.isLoading) return <Loading rows={6} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={isAdmin ? "Timesheets & payroll" : "My timesheet"}
        subtitle={isAdmin
          ? "Paid hours from geofenced clock-in/out, per-day visit breakdown, and location trail. Grace after leaving a visit is unpaid."
          : "Hours from your clocked visits this period, broken down by day."}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="ts-from" className="text-xs">From</Label>
              <Input id="ts-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label htmlFor="ts-to" className="text-xs">To</Label>
              <Input id="ts-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            {isAdmin && (
              <div>
                <Label className="text-xs">Staff</Label>
                <Select value={staffId} onValueChange={setStaffId}>
                  <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All carers</SelectItem>
                    {carers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button variant="outline" onClick={() => { const m = mondayOf(); setFrom(m); setTo(sundayOf(m)); }}>
              This week
            </Button>
            {canExport && (
              <Button variant="outline" onClick={() => void downloadCsv()} disabled={exportQ.isFetching}>
                <Download className="h-4 w-4 mr-1.5" />
                {exportQ.isFetching ? "Preparing…" : "Export payroll CSV"}
              </Button>
            )}
          </div>
        }
      />

      {isAdmin ? (
        payQ.isLoading ? <Loading rows={6} /> : payQ.error ? <ErrorState message={payQ.error.message} onRetry={() => payQ.refetch()} /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="Paid hours" value={fmtMinutes(payQ.data!.totals.paidMinutes)} />
              <Stat label="Clock hours" value={fmtMinutes(payQ.data!.totals.clockMinutes)} />
              <Stat label="Unpaid grace" value={fmtMinutes(payQ.data!.totals.unpaidGraceMinutes)} />
              <Stat label="Visits clocked" value={String(payQ.data!.totals.visits)} />
              <Stat label="Gross pay" value={fmtMoney(payQ.data!.totals.grossPay)} />
            </div>
            {payQ.data!.staff.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No clocked visits in this period" hint="Carers clock in from My Rota when they arrive at a client." />
            ) : (
              <div className="space-y-4">
                {payQ.data!.staff.map((s) => (
                  <section key={s.staffId} className="uc-card overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "var(--line)" }}>
                      <div>
                        <Link to={`/staff/${s.staffId}`} className="font-semibold text-[--brand-900] hover:underline">{s.fullName}</Link>
                        <p className="text-xs text-muted-foreground">
                          Rate {s.hourlyRate ? `${fmtMoney(Number(s.hourlyRate))}/h` : "not set"}
                          {" · "}{fmtMinutes(s.paidMinutes)} paid
                          {" · "}{fmtMinutes(s.clockMinutes)} clocked
                          {" · "}{fmtMoney(s.grossPay)}
                          {!s.hourlyRate && <span className="text-amber-700"> — set hourly rate on their profile for payroll</span>}
                        </p>
                      </div>
                      <Chip value={s.visits ? "verified" : "pending"} label={`${s.visits} visit${s.visits === 1 ? "" : "s"}`} />
                    </div>
                    <DayTable days={s.days as DayRow[]} onOpenTrail={setTrailId} showTrail />
                  </section>
                ))}
                <p className="text-xs text-muted-foreground">
                  Period {from} → {to}. Gross pay = paid hours × hourly rate (geofence grace is unpaid). Open a visit row to see the 15-minute location trail.
                </p>
              </div>
            )}
          </>
        )
      ) : (
        mineQ.isLoading ? <Loading rows={6} /> : mineQ.error ? <ErrorState message={mineQ.error.message} onRetry={() => mineQ.refetch()} /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Paid hours" value={fmtMinutes(mineQ.data!.totals.paidMinutes)} />
              <Stat label="Clock hours" value={fmtMinutes(mineQ.data!.totals.clockMinutes)} />
              <Stat label="Visits" value={String(mineQ.data!.totals.visits)} />
              <Stat label="Estimated pay" value={fmtMoney(mineQ.data!.totals.grossPay)} />
            </div>
            {mineQ.data!.openSessions > 0 && (
              <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                You have {mineQ.data!.openSessions} visit{mineQ.data!.openSessions === 1 ? "" : "s"} still in progress — paid hours finalise when you clock out.
              </p>
            )}
            {mineQ.data!.days.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No clocked visits yet" hint="Open My Rota and clock in when you arrive at the client's address." />
            ) : (
              <div className="uc-card overflow-hidden">
                <DayTable days={mineQ.data!.days as DayRow[]} onOpenTrail={setTrailId} showTrail />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              <Link to="/me" className="text-[--brand-600] hover:underline">← Back to My Rota</Link>
            </p>
          </>
        )
      )}

      {trailId != null && (
        <LocationTrailDialog attendanceId={trailId} onClose={() => setTrailId(null)} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="uc-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function DayTable({
  days, onOpenTrail, showTrail,
}: {
  days: DayRow[];
  onOpenTrail: (id: number) => void;
  showTrail?: boolean;
}) {
  if (!days.length) return <p className="px-4 py-6 text-sm text-muted-foreground">No sessions.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
            <th className="px-4 py-2.5 font-medium">Day / client</th>
            <th className="px-4 py-2.5 font-medium">Clock</th>
            <th className="px-4 py-2.5 font-medium">Clocked</th>
            <th className="px-4 py-2.5 font-medium">Paid</th>
            <th className="px-4 py-2.5 font-medium">Unpaid grace</th>
            <th className="px-4 py-2.5 font-medium">Pay</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            {showTrail && <th className="px-4 py-2.5 font-medium" />}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <Fragment key={d.date}>
              <tr className="bg-[--brand-50]/50 border-b" style={{ borderColor: "var(--line)" }}>
                <td className="px-4 py-2 font-medium" colSpan={2}>
                  {new Date(d.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
                </td>
                <td className="px-4 py-2 text-xs font-medium">{fmtMinutes(d.clockMinutes)}</td>
                <td className="px-4 py-2 text-xs font-medium">{fmtMinutes(d.paidMinutes)}</td>
                <td className="px-4 py-2 text-xs">{fmtMinutes(d.unpaidGraceMinutes)}</td>
                <td className="px-4 py-2 text-xs font-medium">{fmtMoney(d.grossPay)}</td>
                <td colSpan={showTrail ? 2 : 1} />
              </tr>
              {d.sessions.map((s) => (
                <tr key={s.id} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-2.5 pl-8">{s.clientName}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(s.clockInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    {" – "}
                    {s.clockOutAt
                      ? new Date(s.clockOutAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                      : "…"}
                  </td>
                  <td className="px-4 py-2.5 text-xs">{fmtMinutes(s.clockMinutes)}</td>
                  <td className="px-4 py-2.5 text-xs">{fmtMinutes(s.paidMinutes)}</td>
                  <td className="px-4 py-2.5 text-xs">{fmtMinutes(s.unpaidGraceMinutes)}</td>
                  <td className="px-4 py-2.5 text-xs">{fmtMoney(s.grossPay)}</td>
                  <td className="px-4 py-2.5"><Chip value={s.status} label={(s.reason ?? s.status).replaceAll("_", " ")} /></td>
                  {showTrail && (
                    <td className="px-4 py-2.5 text-right">
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => onOpenTrail(s.id)}>
                        <MapPin className="h-3.5 w-3.5 mr-1" /> Trail
                        <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LocationTrailDialog({ attendanceId, onClose }: { attendanceId: number; onClose: () => void }) {
  const q = trpc.attendance.sessionDetail.useQuery({ attendanceId });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Visit location trail</DialogTitle>
          <DialogDescription>
            {q.data
              ? `${q.data.session.clientName} · ${q.data.session.staffName} · 15-minute GPS checks while clocked in`
              : "Loading visit session…"}
          </DialogDescription>
        </DialogHeader>
        {q.isLoading && <Loading rows={4} />}
        {q.error && <ErrorState message={q.error.message} onRetry={() => q.refetch()} />}
        {q.data && (
          <div className="space-y-3">
            <div className="rounded-lg border px-3 py-2 text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
              <p>
                Clock {new Date(q.data.session.clockInAt).toLocaleString("en-GB")}
                {" → "}
                {q.data.session.clockOutAt
                  ? new Date(q.data.session.clockOutAt).toLocaleString("en-GB")
                  : "in progress"}
              </p>
              {q.data.session.clientAddress && <p className="mt-0.5">{q.data.session.clientAddress}</p>}
              <p className="mt-0.5">
                Paid {fmtMinutes(q.data.session.paidMinutes ?? 0)}
                {q.data.session.unpaidGraceMinutes
                  ? ` · unpaid grace ${fmtMinutes(q.data.session.unpaidGraceMinutes)}`
                  : ""}
                {q.data.session.leftGeofenceAt
                  ? ` · left fence ${new Date(q.data.session.leftGeofenceAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </p>
            </div>
            {q.data.probes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No location probes recorded for this visit (probes run from My Rota; the server still auto clock-outs if the app was closed).</p>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-lg border" style={{ borderColor: "var(--line)" }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b text-left text-muted-foreground" style={{ borderColor: "var(--line)" }}>
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Distance</th>
                      <th className="px-3 py-2 font-medium">Inside</th>
                      <th className="px-3 py-2 font-medium">Coords</th>
                      <th className="px-3 py-2 font-medium">Alert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.probes.map((p) => (
                      <tr key={p.id} className={`border-b last:border-0 ${p.insideGeofence ? "" : "bg-red-50"}`} style={{ borderColor: "var(--line)" }}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {new Date(p.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </td>
                        <td className="px-3 py-2">{p.distanceM != null ? `${Number(p.distanceM).toFixed(1)} m` : "—"}</td>
                        <td className="px-3 py-2">{p.insideGeofence ? "Yes" : "No"}</td>
                        <td className="px-3 py-2 font-mono text-[10px]">
                          {p.lat && p.lng ? (
                            <a
                              className="text-[--brand-700] hover:underline"
                              href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=18/${p.lat}/${p.lng}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {Number(p.lat).toFixed(5)}, {Number(p.lng).toFixed(5)}
                            </a>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2">{p.violationNotified ? "Notified" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
