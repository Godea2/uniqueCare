import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, Chip, EmptyState } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtMinutes, fmtMoney } from "@/lib/geolocation";
import { ClipboardList, Download } from "lucide-react";

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

export default function Timesheets() {
  const meQ = trpc.core.me.useQuery();
  const role = meQ.data?.homeRole ?? meQ.data?.role;
  const isAdmin = role === "super_admin" || role === "admin" || role === "care_coordinator";

  const [from, setFrom] = useState(() => mondayOf());
  const [to, setTo] = useState(() => sundayOf(mondayOf()));
  const [staffId, setStaffId] = useState<string>("all");

  const staffQ = trpc.core.staffList.useQuery(undefined, { enabled: isAdmin });
  const mineQ = trpc.attendance.myTimesheet.useQuery({ from, to }, { enabled: !isAdmin && !!meQ.data });
  const payQ = trpc.attendance.payrollSummary.useQuery(
    { from, to, staffId: staffId === "all" ? undefined : Number(staffId) },
    { enabled: isAdmin },
  );

  const carers = useMemo(
    () => (staffQ.data ?? []).filter((s) => ["care_worker", "team_leader", "supervisor"].includes(s.role) && s.status === "active"),
    [staffQ.data],
  );

  if (meQ.isLoading) return <Loading rows={6} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={isAdmin ? "Timesheets & payroll" : "My timesheet"}
        subtitle={isAdmin
          ? "Paid hours from geofenced clock-in/out. Grace time after leaving a visit is unpaid."
          : "Hours from your clocked visits this period."}
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
          </div>
        }
      />

      {isAdmin ? (
        payQ.isLoading ? <Loading rows={6} /> : payQ.error ? <ErrorState message={payQ.error.message} onRetry={() => payQ.refetch()} /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Paid hours" value={fmtMinutes(payQ.data!.totals.paidMinutes)} />
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
                          Rate {s.hourlyRate ? fmtMoney(Number(s.hourlyRate)) + "/h" : "not set"} · {fmtMinutes(s.paidMinutes)} paid · {fmtMoney(s.grossPay)}
                        </p>
                      </div>
                      <Chip value={s.visits ? "verified" : "pending"} label={`${s.visits} visit${s.visits === 1 ? "" : "s"}`} />
                    </div>
                    <DayTable days={s.days} />
                  </section>
                ))}
                <ExportHint from={from} to={to} />
              </div>
            )}
          </>
        )
      ) : (
        mineQ.isLoading ? <Loading rows={6} /> : mineQ.error ? <ErrorState message={mineQ.error.message} onRetry={() => mineQ.refetch()} /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Paid hours" value={fmtMinutes(mineQ.data!.totals.paidMinutes)} />
              <Stat label="Unpaid grace" value={fmtMinutes(mineQ.data!.totals.unpaidGraceMinutes)} />
              <Stat label="Visits" value={String(mineQ.data!.totals.visits)} />
              <Stat label="Estimated pay" value={fmtMoney(mineQ.data!.totals.grossPay)} />
            </div>
            {mineQ.data!.days.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No clocked visits yet" hint="Open My Rota and clock in when you arrive at the client's address." />
            ) : (
              <div className="uc-card overflow-hidden">
                <DayTable days={mineQ.data!.days} />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              <Link to="/me" className="text-[--brand-600] hover:underline">← Back to My Rota</Link>
            </p>
          </>
        )
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

function DayTable({ days }: { days: { date: string; paidMinutes: number; unpaidGraceMinutes: number; grossPay: number; sessions: { clientName: string; clockInAt: string; clockOutAt: string | null; paidMinutes: number; unpaidGraceMinutes: number; grossPay: number; reason: string | null; status: string }[] }[] }) {
  if (!days.length) return <p className="px-4 py-6 text-sm text-muted-foreground">No sessions.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
            <th className="px-4 py-2.5 font-medium">Day / client</th>
            <th className="px-4 py-2.5 font-medium">Clock</th>
            <th className="px-4 py-2.5 font-medium">Paid</th>
            <th className="px-4 py-2.5 font-medium">Unpaid grace</th>
            <th className="px-4 py-2.5 font-medium">Pay</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <Fragment key={d.date}>
              <tr className="bg-[--brand-50]/50 border-b" style={{ borderColor: "var(--line)" }}>
                <td className="px-4 py-2 font-medium" colSpan={2}>
                  {new Date(d.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
                </td>
                <td className="px-4 py-2 text-xs font-medium">{fmtMinutes(d.paidMinutes)}</td>
                <td className="px-4 py-2 text-xs">{fmtMinutes(d.unpaidGraceMinutes)}</td>
                <td className="px-4 py-2 text-xs font-medium">{fmtMoney(d.grossPay)}</td>
                <td />
              </tr>
              {d.sessions.map((s, i) => (
                <tr key={`${d.date}-${i}`} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-2.5 pl-8">{s.clientName}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(s.clockInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    {" – "}
                    {s.clockOutAt
                      ? new Date(s.clockOutAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                      : "…"}
                  </td>
                  <td className="px-4 py-2.5 text-xs">{fmtMinutes(s.paidMinutes)}</td>
                  <td className="px-4 py-2.5 text-xs">{fmtMinutes(s.unpaidGraceMinutes)}</td>
                  <td className="px-4 py-2.5 text-xs">{fmtMoney(s.grossPay)}</td>
                  <td className="px-4 py-2.5"><Chip value={s.status} label={(s.reason ?? s.status).replaceAll("_", " ")} /></td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExportHint({ from, to }: { from: string; to: string }) {
  return (
    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
      <Download className="h-3.5 w-3.5" />
      Period {from} → {to}. Set each carer's hourly rate on their staff profile to calculate gross pay.
    </p>
  );
}
