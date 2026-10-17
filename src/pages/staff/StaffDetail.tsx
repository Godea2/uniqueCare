import { useState } from "react";
import { useParams, Link } from "react-router";
import { trpc } from "@/providers/trpc";
import {
  Chip, Loading, ErrorState, AvatarDot, EmptyState,
  fmtDate, fmtDateTime, fmtTime,
} from "@/components/common";
import { StaffAvailabilityWindowsView } from "@/components/AvailabilityGridView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, Phone, Mail, MapPin, Car, Languages, GraduationCap,
  CalendarDays, ShieldCheck, Clock, Users, History, FileText, ExternalLink, StickyNote, Upload,
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
const PRIVILEGED = new Set(["super_admin", "admin", "care_coordinator", "team_leader", "supervisor"]);

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

function patternLabel(workPattern: string | null | undefined, fixedDayOff: number | null | undefined, flexibleDayOff: number | null | undefined) {
  if (workPattern === "five_day_flex") {
    const fixed = fixedDayOff != null ? DAYS[fixedDayOff] : "not set";
    const flex = flexibleDayOff != null ? DAYS[flexibleDayOff] : "Sunday";
    return `5-day flex · fixed off ${fixed} · flexible ${flex}`;
  }
  return "6-day contract (Sunday off)";
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
  const openDoc = trpc.hr2.documentUrl.useMutation({
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const [tab, setTab] = useState("overview");
  const [renewKey, setRenewKey] = useState<string | null>(null);

  if (q.isLoading) return <Loading rows={8} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const s = d.staff;
  const skills = (s.skills as string[] | null) ?? [];
  const languages = (s.languages as string[] | null) ?? [];
  const myRole = meQ.data?.role;
  const myId = meQ.data?.id != null ? Number(meQ.data.id) : null;
  const isSelf = myId != null && myId === Number(s.id);
  const canSeeDirectory = !!myRole && PRIVILEGED.has(myRole);
  const canEditPattern = myRole === "super_admin" || myRole === "admin" || myRole === "care_coordinator";
  const canRenewDocs = canEditPattern || myRole === "team_leader";
  const canSeePay = canEditPattern || myRole === "team_leader" || myRole === "supervisor";
  const showRate = canSeePay || isSelf;

  return (
    <div>
      {canSeeDirectory ? (
        <Link to="/staff" className="uc-focus inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[--brand-600] mb-3">
          <ArrowLeft className="h-4 w-4" /> Staff directory
        </Link>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">{isSelf ? "Your profile" : "Staff profile"}</p>
      )}

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
                {showRate && (
                  <Field label="Hourly rate" value={s.hourlyRate != null ? `£${Number(s.hourlyRate).toFixed(2)}` : "—"} />
                )}
                <Field label="Work pattern" value={patternLabel(s.workPattern, s.fixedDayOff, s.flexibleDayOff)} />
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
          <div className="space-y-4">
            <div className="uc-card p-5">
              <h3 className="text-sm font-semibold mb-3">Employment details</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Job title" value={s.jobTitle ?? ROLE_LABELS[s.role] ?? s.role} />
                <Field label="Employment type" value={EMPLOYMENT_LABELS[s.employmentType ?? ""] ?? s.employmentType} />
                <Field label="Employee number" value={s.employeeNo} />
                <Field label="Start date" value={fmtDate(s.startDate)} />
                <Field label="Length of service" value={lengthOfService(s.startDate)} />
                <Field label="Contracted hours" value={`${s.contractedHours ?? "—"}h / week`} />
                {showRate && (
                  <Field label="Hourly rate" value={s.hourlyRate != null ? `£${Number(s.hourlyRate).toFixed(2)}` : "—"} />
                )}
                <Field label="Work pattern" value={patternLabel(s.workPattern, s.fixedDayOff, s.flexibleDayOff)} />
                <Field label="Student" value={s.isStudent ? "Yes (20h/week cap)" : "No"} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="uc-card p-5">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Compliance documents</h3>
                {d.compliance.length === 0 && <p className="text-sm text-muted-foreground">No compliance documents on file.</p>}
                <ul className="space-y-2">
                  {d.compliance
                    .filter((c) => c.status !== "superseded" && c.status !== "cancelled")
                    .map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-sm border-b pb-2 last:border-0" style={{ borderColor: "var(--line)" }}>
                      <span className="capitalize">{c.requirementKey.replaceAll("_", " ")}</span>
                      <span className="flex items-center gap-2">
                        {c.expiresAt && <span className="text-xs text-muted-foreground">exp {fmtDate(c.expiresAt)}</span>}
                        <Chip value={c.status} />
                        {c.fileKey && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            disabled={openDoc.isPending}
                            onClick={() => openDoc.mutate({ id: Number(c.id) })}
                            aria-label="Open document"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canRenewDocs && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => setRenewKey(c.requirementKey)}
                          >
                            <Upload className="h-3 w-3 mr-1" /> Renew
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {canRenewDocs && renewKey && (
                  <RenewDocumentDialog
                    staffId={staffId}
                    requirementKey={renewKey}
                    onClose={() => setRenewKey(null)}
                    onDone={() => {
                      setRenewKey(null);
                      utils.core.staffDetail.invalidate({ id: staffId });
                      utils.hr2.expiryDashboard.invalidate();
                      utils.hr2.complianceMatrix.invalidate();
                    }}
                  />
                )}
                <h3 className="text-sm font-semibold mt-5 mb-3">DBS verifications</h3>
                {d.dbs.length === 0 && <p className="text-sm text-muted-foreground">No DBS verification recorded.</p>}
                <ul className="space-y-2">
                  {d.dbs.map((x) => (
                    <li key={x.id} className="text-sm flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-muted-foreground" /> Certificate {x.certificateNo}</span>
                      <span className="text-xs text-muted-foreground">{x.verifiedAt ? `Verified ${fmtDate(x.verifiedAt)}` : "Unverified"}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="uc-card p-5">
                <h3 className="text-sm font-semibold mb-3">Training records</h3>
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
                <h3 className="text-sm font-semibold mt-5 mb-3 flex items-center justify-between gap-2">
                  <span>Appraisals</span>
                  {canSeeDirectory && (
                    <Link to="/staff/appraisals" className="text-xs font-medium text-[--brand-700] hover:underline">Open appraisals</Link>
                  )}
                </h3>
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

            <div className="uc-card p-5">
              <h3 className="text-sm font-semibold mb-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><StickyNote className="h-4 w-4" /> Supervisor notes</span>
                {canSeeDirectory && (
                  <Link to="/staff/supervision" className="text-xs font-medium text-[--brand-700] hover:underline">Record a note</Link>
                )}
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                {isSelf && !canSeeDirectory
                  ? "Notes your supervisor has shared with you."
                  : "Internal notes are visible to managers; staff only see notes marked visible to them."}
              </p>
              {d.supervisorNotes.length === 0 && (
                <p className="text-sm text-muted-foreground">No supervisor notes on this record.</p>
              )}
              <ul className="space-y-3">
                {d.supervisorNotes.map((n) => (
                  <li key={n.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--line)" }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium capitalize">{n.noteType.replaceAll("_", " ")}</span>
                      <span className="flex items-center gap-2">
                        {!n.visibleToStaff && canSeeDirectory && (
                          <span className="rounded-md bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 text-[11px] font-medium">Internal</span>
                        )}
                        <span className="text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</span>
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.supervisorName ? `By ${n.supervisorName}` : "Supervisor"}
                      {n.method ? ` · ${n.method.replaceAll("_", " ")}` : ""}
                      {n.rating != null ? ` · Rating ${n.rating}` : ""}
                    </p>
                    {(n.strengths || n.improvements || n.transcript) && (
                      <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap line-clamp-4">
                        {n.strengths || n.improvements || n.transcript}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="uc-card p-5">
            <h3 className="text-sm font-semibold mb-1">Staff history timeline</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Audit events, supervision, appraisals, incidents and leave — newest first.
              {isSelf && !canSeeDirectory ? " Internal supervisor notes are hidden." : ""}
            </p>
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
              <p className="text-xs text-muted-foreground mb-2">
                Synced from the application form when hired (coordinators can refine later).
              </p>
              <StaffAvailabilityWindowsView windows={d.availability} />
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
                  <h3 className="text-sm font-semibold mb-3">Work pattern & pay</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">Pattern</span>
                      <Select
                        value={s.workPattern ?? "six_day"}
                        onValueChange={(v) => upd.mutate({
                          id: staffId,
                          workPattern: v as "six_day" | "five_day_flex",
                          ...(v === "five_day_flex" && s.flexibleDayOff == null ? { flexibleDayOff: 6 } : {}),
                        })}
                      >
                        <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="six_day">6-day contract (Sun off)</SelectItem>
                          <SelectItem value="five_day_flex">5-day flex (fixed + flexible day off)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(s.workPattern ?? "six_day") === "five_day_flex" && (
                      <>
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
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm">Flexible day off</span>
                          <Select
                            value={s.flexibleDayOff != null ? String(s.flexibleDayOff) : "6"}
                            onValueChange={(v) => upd.mutate({ id: staffId, flexibleDayOff: Number(v) })}
                          >
                            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {DAYS.map((d2, i) => <SelectItem key={d2} value={String(i)}>{d2}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">Student (max 20h/week incl. travel)</span>
                      <Switch
                        checked={!!s.isStudent}
                        onCheckedChange={(v) => upd.mutate({ id: staffId, isStudent: v })}
                        aria-label="Student worker"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="contracted-hours" className="text-sm">Contracted hours / week</Label>
                      <div className="flex gap-2">
                        <Input
                          id="contracted-hours"
                          type="number"
                          min={0}
                          max={60}
                          step={0.5}
                          defaultValue={s.contractedHours ?? ""}
                          key={`ch-${s.contractedHours ?? "none"}`}
                          className="w-36"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={upd.isPending}
                          onClick={() => {
                            const el = document.getElementById("contracted-hours") as HTMLInputElement | null;
                            const raw = el?.value.trim() ?? "";
                            if (raw === "") return toast.error("Enter contracted hours");
                            upd.mutate({ id: staffId, contractedHours: Number(raw) });
                          }}
                        >
                          Save hours
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="hourly-rate" className="text-sm">Hourly rate (£)</Label>
                      <div className="flex gap-2">
                        <Input
                          id="hourly-rate"
                          type="number"
                          min={0}
                          max={500}
                          step={0.01}
                          defaultValue={s.hourlyRate ?? ""}
                          key={`rate-${s.hourlyRate ?? "none"}`}
                          className="w-36"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={upd.isPending}
                          onClick={() => {
                            const el = document.getElementById("hourly-rate") as HTMLInputElement | null;
                            const raw = el?.value.trim() ?? "";
                            upd.mutate({
                              id: staffId,
                              hourlyRate: raw === "" ? null : Number(raw),
                            });
                          }}
                        >
                          Save rate
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Used for timesheet gross pay when they clock out.</p>
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

const TEXT_KEYS = new Set(["right_to_work", "bank_details", "reference_1", "reference_2"]);

function RenewDocumentDialog({
  staffId, requirementKey, onClose, onDone,
}: {
  staffId: number;
  requirementKey: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const isText = TEXT_KEYS.has(requirementKey);
  const [expiresAt, setExpiresAt] = useState("");
  const [textValue, setTextValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const uploadUrl = trpc.hr2.renewUploadUrl.useMutation();
  const renew = trpc.hr2.renewDocument.useMutation({
    onSuccess: () => {
      toast.success("Document renewed — reminders reset");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  async function submit() {
    if (!expiresAt) {
      toast.error("Set the new expiry date");
      return;
    }
    setBusy(true);
    try {
      if (isText) {
        await renew.mutateAsync({
          staffId, requirementKey, expiresAt, textValue: textValue.trim(),
        });
      } else {
        if (!file) {
          toast.error("Choose the renewed file");
          return;
        }
        const target = await uploadUrl.mutateAsync({
          staffId, requirementKey, fileName: file.name, size: file.size,
        });
        const put = await fetch(target.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!put.ok) throw new Error("Upload failed — try again");
        await renew.mutateAsync({
          staffId, requirementKey, expiresAt, fileName: file.name, key: target.key,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Renewal failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="capitalize">Renew {requirementKey.replaceAll("_", " ")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="renew-exp">New expiry date</Label>
            <Input id="renew-exp" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          {isText ? (
            <div>
              <Label htmlFor="renew-text">Updated value</Label>
              <Textarea id="renew-text" rows={3} value={textValue} onChange={(e) => setTextValue(e.target.value)} />
            </div>
          ) : (
            <div>
              <Label htmlFor="renew-file">Renewed document</Label>
              <Input id="renew-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            The previous file is kept as superseded. Reminder escalation resets for this document.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={busy || renew.isPending || uploadUrl.isPending} onClick={() => void submit()}>
            {busy ? "Saving…" : "Save renewal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
