import { useState } from "react";
import { useParams, Link } from "react-router";
import { trpc } from "@/providers/trpc";
import {
  Chip, Loading, ErrorState, AvatarDot, EmptyState,
  fmtDate, fmtDateTime, fmtTime,
} from "@/components/common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  ArrowLeft, Phone, Mail, MapPin, Car, Languages, GraduationCap,
  CalendarDays, ShieldCheck, Clock, Users, History,
} from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Registered Manager", admin: "Office / HR Admin", care_coordinator: "Care Coordinator",
  team_leader: "Team Leader", supervisor: "Field Supervisor", interview_panel: "Interview Panel",
  care_worker: "Care Worker", crm_agent: "CRM Agent",
};
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-time", part_time: "Part-time", zero_hours: "Zero-hours", bank: "Bank",
};

function lengthOfService(startDate?: string | null) {
  if (!startDate) return "—";
  const ms = Date.now() - new Date(startDate).getTime();
  const months = Math.floor(ms / (30.44 * 864e5));
  if (months < 1) return "<1 month";
  const y = Math.floor(months / 12);
  return y > 0 ? `${y}y ${months % 12}m` : `${months} months`;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value ?? "—"}</div>
    </div>
  );
}

export default function StaffDetail() {
  const { id } = useParams<{ id: string }>();
  const staffId = Number(id);
  const meQ = trpc.core.me.useQuery();
  const q = trpc.core.staffDetail.useQuery({ id: staffId }, { enabled: !!staffId });
  const hist = trpc.core.staffHistory.useQuery({ id: staffId }, { enabled: !!staffId });
  const utils = trpc.useUtils();
  const upd = trpc.core.updateStaffPattern.useMutation({
    onSuccess: () => {
      toast.success("Work pattern updated");
      utils.core.staffDetail.invalidate({ id: staffId });
      utils.core.staffList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const [tab, setTab] = useState("overview");

  if (q.isLoading) return <Loading rows={8} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const s = d.staff;
  const skills = (s.skills as string[] | null) ?? [];
  const languages = (s.languages as string[] | null) ?? [];
  const myRole = meQ.data?.homeRole ?? meQ.data?.role;
  const canEditPattern = myRole === "super_admin" || myRole === "admin" || myRole === "care_coordinator";

  return (
    <div>
      <Link to="/staff" className="uc-focus inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[--brand-600] mb-3">
        <ArrowLeft className="h-4 w-4" /> Staff directory
      </Link>

      <div className="uc-card p-5 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <AvatarDot name={s.fullName} color={s.avatarColor} />
            <div>
              <h1 className="text-xl font-semibold tracking-tight flex flex-wrap items-center gap-2">
                {s.fullName}
                {!!s.isStudent && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[--brand-50] text-[--brand-900] px-2 py-0.5 text-xs font-medium border" style={{ borderColor: "var(--line)" }}>
                    <GraduationCap className="h-3 w-3" /> Student · 20h cap
                  </span>
                )}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {s.jobTitle ?? ROLE_LABELS[s.role] ?? s.role} · {EMPLOYMENT_LABELS[s.employmentType ?? ""] ?? s.employmentType ?? "—"}
                {s.employeeNo ? ` · ${s.employeeNo}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Chip value={s.status} />
            <Chip value={s.role} label={ROLE_LABELS[s.role] ?? s.role} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-4 border-t" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" />{s.email ?? "—"}</div>
          <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" />{s.phone ?? "—"}</div>
          <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" />{s.homePostcode ?? "—"}</div>
          <div className="flex items-center gap-2 text-sm"><Car className="h-4 w-4 text-muted-foreground" />{s.drives ? (s.hasVehicle ? "Driver · own vehicle" : "Driver") : "Non-driver"}</div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="hr">HR record</TabsTrigger>
          <TabsTrigger value="history"><History className="h-3.5 w-3.5 mr-1" />History</TabsTrigger>
          <TabsTrigger value="rota">Rota & availability</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="uc-card p-5">
              <h3 className="text-sm font-semibold mb-3">Employment</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Start date" value={fmtDate(s.startDate)} />
                <Field label="Length of service" value={lengthOfService(s.startDate)} />
                <Field label="Contracted hours" value={`${s.contractedHours ?? "—"}h / week`} />
                <Field label="Max weekly hours" value={`${s.maxWeeklyHours ?? "—"}h${s.isStudent ? " (student cap, incl. travel)" : ""}`} />
                <Field label="Work pattern" value={s.workPattern === "five_day_flex"
                  ? `5-day flex${s.fixedDayOff != null ? ` · fixed off ${DAYS[s.fixedDayOff]}` : ""}`
                  : "6-day contract"} />
                <Field label="WTD opt-out" value={s.wtdOptOut ? "Yes" : "No"} />
              </div>
            </div>
            <div className="uc-card p-5">
              <h3 className="text-sm font-semibold mb-3">Skills & languages</h3>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {skills.length ? skills.map((sk) => (
                  <span key={sk} className="rounded-md bg-[--brand-50] text-[--brand-900] px-2.5 py-1 text-xs font-medium">{sk.replaceAll("_", " ")}</span>
                )) : <span className="text-sm text-muted-foreground">No skills recorded</span>}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Languages className="h-4 w-4" />
                {languages.join(", ") || "English"}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="hr">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="uc-card p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Compliance documents</h3>
              {d.compliance.length === 0 && <p className="text-sm text-muted-foreground">No compliance documents on file.</p>}
              <ul className="space-y-2">
                {d.compliance.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm border-b pb-2 last:border-0" style={{ borderColor: "var(--line)" }}>
                    <span>{c.requirementKey.replaceAll("_", " ")}</span>
                    <span className="flex items-center gap-2">
                      {c.expiresAt && <span className="text-xs text-muted-foreground">exp {fmtDate(c.expiresAt)}</span>}
                      <Chip value={c.status} />
                    </span>
                  </li>
                ))}
              </ul>
              <h3 className="text-sm font-semibold mt-5 mb-3">DBS</h3>
              {d.dbs.length === 0 && <p className="text-sm text-muted-foreground">No DBS verification recorded.</p>}
              <ul className="space-y-2">
                {d.dbs.map((x) => (
                  <li key={x.id} className="text-sm flex items-center justify-between">
                    <span>Certificate {x.certificateNo}</span>
                    <span className="text-xs text-muted-foreground">{x.verifiedAt ? `Verified ${fmtDate(x.verifiedAt)}` : "Unverified"}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="uc-card p-5">
              <h3 className="text-sm font-semibold mb-3">Training record</h3>
              {d.training.length === 0 && <p className="text-sm text-muted-foreground">No training enrolments.</p>}
              <ul className="space-y-2">
                {d.training.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 text-sm border-b pb-2 last:border-0" style={{ borderColor: "var(--line)" }}>
                    <span>{t.course?.title ?? `Course #${t.courseId}`}{t.course?.mandatory ? <span className="text-xs text-red-600 ml-1">mandatory</span> : null}</span>
                    <span className="flex items-center gap-2">
                      {t.expiresAt && <span className="text-xs text-muted-foreground">exp {fmtDate(t.expiresAt)}</span>}
                      <Chip value={t.status} />
                    </span>
                  </li>
                ))}
              </ul>
              <h3 className="text-sm font-semibold mt-5 mb-3">Appraisals</h3>
              {d.appraisals.length === 0 && <p className="text-sm text-muted-foreground">No appraisals yet.</p>}
              <ul className="space-y-2">
                {d.appraisals.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm">
                    <span>{fmtDate(a.periodStart)} → {fmtDate(a.periodEnd)}</span>
                    <Chip value={a.status} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="uc-card p-5">
            <h3 className="text-sm font-semibold mb-4">Timeline</h3>
            {hist.isLoading && <Loading rows={5} />}
            {hist.data && hist.data.length === 0 && <EmptyState title="No history yet" hint="Events will appear here as they happen." />}
            <ol className="relative border-l pl-5 space-y-4" style={{ borderColor: "var(--line)" }}>
              {(hist.data ?? []).map((h, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white ${
                    h.kind === "incident" ? "bg-red-500" : h.kind === "appraisal" ? "bg-green-600"
                    : h.kind === "supervision" ? "bg-[--brand-500]" : h.kind === "leave" ? "bg-amber-500" : "bg-slate-400"}`} />
                  <div className="text-xs text-muted-foreground">{fmtDateTime(h.at)}</div>
                  <div className="text-sm font-medium capitalize">{h.title}</div>
                  {h.detail && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{h.detail}</div>}
                </li>
              ))}
            </ol>
          </div>
        </TabsContent>

        <TabsContent value="rota">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="uc-card p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock className="h-4 w-4" /> Weekly availability</h3>
              {d.availability.length === 0 && <p className="text-sm text-muted-foreground">No availability windows set.</p>}
              <ul className="space-y-1.5">
                {DAYS.map((day, dow) => {
                  const wins = d.availability.filter((a) => a.dayOfWeek === dow);
                  if (!wins.length) return null;
                  return (
                    <li key={day} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{day}</span>
                      <span>{wins.map((w) => `${w.startTime}–${w.endTime}`).join(", ")}</span>
                    </li>
                  );
                })}
              </ul>
              <h3 className="text-sm font-semibold mt-5 mb-3 flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Leave & unavailability</h3>
              {d.unavailability.length === 0 && <p className="text-sm text-muted-foreground">None recorded.</p>}
              <ul className="space-y-1.5">
                {d.unavailability.slice(0, 8).map((u) => (
                  <li key={u.id} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{u.reason.replaceAll("_", " ")}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(u.startsAt)} → {fmtDate(u.endsAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-4">
              {canEditPattern && (
                <div className="uc-card p-5">
                  <h3 className="text-sm font-semibold mb-3">Work pattern & hours</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">Pattern</span>
                      <Select
                        value={s.workPattern ?? "six_day"}
                        onValueChange={(v) => upd.mutate({ id: staffId, workPattern: v as "six_day" | "five_day_flex" })}
                      >
                        <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="six_day">6-day contract (Sun off)</SelectItem>
                          <SelectItem value="five_day_flex">5-day flex (fixed + flexible day off)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(s.workPattern ?? "six_day") === "five_day_flex" && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm">Fixed day off</span>
                        <Select
                          value={s.fixedDayOff != null ? String(s.fixedDayOff) : "none"}
                          onValueChange={(v) => upd.mutate({ id: staffId, fixedDayOff: v === "none" ? null : Number(v) })}
                        >
                          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not set</SelectItem>
                            {DAYS.map((d2, i) => <SelectItem key={d2} value={String(i)}>{d2}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">Student (max 20h/week incl. travel)</span>
                      <Switch
                        checked={!!s.isStudent}
                        onCheckedChange={(v) => upd.mutate({ id: staffId, isStudent: v })}
                        aria-label="Student worker"
                      />
                    </div>
                    {upd.isPending && <p className="text-xs text-muted-foreground">Saving…</p>}
                  </div>
                </div>
              )}
              <div className="uc-card p-5">
                <h3 className="text-sm font-semibold mb-3">Recent visits</h3>
                {d.recentVisits.length === 0 && <p className="text-sm text-muted-foreground">No visits recorded.</p>}
                <ul className="space-y-1.5">
                  {d.recentVisits.slice(0, 8).map((v) => (
                    <li key={v.id} className="flex items-center justify-between text-sm">
                      <span>{v.client ? `${v.client.firstName} ${v.client.lastName}` : `Visit #${v.id}`}</span>
                      <span className="text-xs text-muted-foreground">{fmtDate(v.scheduledStart)} {fmtTime(v.scheduledStart)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="clients">
          <div className="uc-card p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4" /> Assigned service users (continuity of care)</h3>
            {d.assignedClients.length === 0 && (
              <EmptyState title="No assigned clients" hint="Assign this worker as a primary or regular carer from a client's page." />
            )}
            <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
              {d.assignedClients.map((w) => (
                <li key={w.id} className="py-2.5 flex items-center justify-between">
                  <Link to={`/clients/${w.clientId}`} className="uc-focus text-sm font-medium text-[--brand-900] hover:text-[--brand-600]">
                    {w.client ? `${w.client.firstName} ${w.client.lastName}` : `Client #${w.clientId}`}
                  </Link>
                  {!!w.isPrimary && <span className="rounded-md bg-[--brand-50] text-[--brand-900] px-2.5 py-0.5 text-xs font-medium">Primary carer</span>}
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
