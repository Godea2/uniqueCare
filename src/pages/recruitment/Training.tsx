import { useMemo, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import type { RouterOutputs } from "@/lib/router-types";
import { PageHeader, Chip, Loading, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, Building2, CalendarDays, Check, Clock, Copy, GraduationCap, Mail, MapPin, Minus, Plus, Send,
  ShieldCheck, UserRound, Users, Video, X, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

const day = (d: string | Date) => new Date(d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const time = (d: string | Date) => new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
/** Attendance can be marked from 12 hours before a session starts, matching the server. */
const markingOpen = (startsAt: string | Date) => Date.now() >= new Date(startsAt).getTime() - 12 * 3600_000;

export default function Training() {
  const coursesQ = trpc.hr2.courses.useQuery();
  const sessionsQ = trpc.hr2.sessions.useQuery();
  const pipelineQ = trpc.hr.pipeline.useQuery({});
  const [dbsOpen, setDbsOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);

  if (coursesQ.isLoading || sessionsQ.isLoading) return <Loading rows={5} />;
  if (coursesQ.error) return <ErrorState message={coursesQ.error.message} onRetry={() => coursesQ.refetch()} />;

  const inTraining = (pipelineQ.data ?? []).filter((a) =>
    ["offer_accepted", "training_booked", "online_training_in_progress", "dbs_verified"].includes(a.stage));
  const waiting = inTraining.filter((a) => a.stage === "offer_accepted").length;
  const now = Date.now();
  const sessions = sessionsQ.data ?? [];
  const upcoming = sessions.filter((s) => new Date(s.endsAt).getTime() >= now);
  const past = sessions.filter((s) => new Date(s.endsAt).getTime() < now).reverse();
  const shown = showPast ? past : upcoming;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training & DBS check-in"
        subtitle="Online courses, classroom induction, and DBS verification at the door"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setSessionOpen(true)}><GraduationCap className="h-4 w-4 mr-1.5" /> New session</Button>
            <Button onClick={() => setDbsOpen(true)}><ShieldCheck className="h-4 w-4 mr-1.5" /> DBS check-in</Button>
          </div>
        }
      />

      {waiting > 0 && upcoming.length === 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <span className="flex-1">
            {waiting === 1 ? "1 new starter has" : `${waiting} new starters have`} accepted an offer and can't book an induction, because no dates are open.
          </span>
          <Button size="sm" onClick={() => setSessionOpen(true)}>Schedule a session</Button>
        </div>
      )}

      <section aria-label="Candidates in training">
        <h2 className="uc-label mb-2">New starters in training</h2>
        {inTraining.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody currently in the training stage.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {inTraining.map((a) => (
              <Link key={a.id} to={`/recruitment/pipeline/${a.id}`} className="uc-card p-4 block hover:shadow-md transition-shadow uc-focus">
                <p className="font-medium text-[--brand-900]">{a.candidate?.firstName} {a.candidate?.lastName}</p>
                <p className="text-xs text-muted-foreground">{a.job?.title}</p>
                <div className="mt-2"><Chip value={a.stage} /></div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Training sessions">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="uc-label">Training sessions</h2>
          <div className="inline-flex rounded-lg border bg-white p-0.5 text-xs" style={{ borderColor: "var(--line)" }} role="tablist">
            {([["Upcoming", false, upcoming.length], ["Past", true, past.length]] as const).map(([label, isPast, n]) => (
              <button key={label} type="button" role="tab" aria-selected={showPast === isPast} onClick={() => setShowPast(isPast)}
                className={`rounded-md px-3 py-1 font-medium transition-colors ${showPast === isPast ? "bg-[--brand-600] text-white" : "text-slate-600 hover:text-slate-900"}`}>
                {label} <span className="opacity-70">{n}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {shown.map((s) => <SessionCard key={s.id} session={s} />)}
          {shown.length === 0 && (
            <div className="uc-card flex flex-col items-center gap-2 px-4 py-8 text-center">
              <CalendarDays className="h-6 w-6 text-slate-400" aria-hidden />
              <p className="text-sm text-muted-foreground">{showPast ? "No past sessions yet." : "No sessions scheduled."}</p>
              {!showPast && <Button size="sm" variant="outline" onClick={() => setSessionOpen(true)}>Schedule a session</Button>}
            </div>
          )}
        </div>
      </section>

      <section aria-label="Course catalogue">
        <h2 className="uc-label mb-2">Course catalogue</h2>
        <div className="uc-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
                <th className="px-4 py-2.5 font-medium">Course</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Mandatory</th>
                <th className="px-4 py-2.5 font-medium">Valid for</th>
              </tr>
            </thead>
            <tbody>
              {(coursesQ.data ?? []).map((c) => (
                <tr key={c.id} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-2.5 font-medium">{c.title}</td>
                  <td className="px-4 py-2.5"><Chip value={c.type === "online" ? "open" : "scheduled"} label={c.type} /></td>
                  <td className="px-4 py-2.5">{c.mandatory ? <span className="text-[--brand-700] font-medium">Yes</span> : "No"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.renewEveryMonths ? `${c.renewEveryMonths} months` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <SessionDialog open={sessionOpen} onClose={() => setSessionOpen(false)}
        courses={(coursesQ.data ?? []).map((c) => ({ id: Number(c.id), title: c.title, type: c.type }))} />
      <DbsDialog open={dbsOpen} onClose={() => setDbsOpen(false)} candidates={inTraining.map((a) => ({
        id: Number(a.id), name: `${a.candidate?.firstName} ${a.candidate?.lastName}`,
      }))} />
    </div>
  );
}

/* ── Session card ── */
type SessionRow = RouterOutputs["hr2"]["sessions"][number];

const ATTENDANCE: Record<string, { label: string; className: string }> = {
  registered: { label: "Booked", className: "bg-slate-100 text-slate-700" },
  completed: { label: "Attended", className: "bg-emerald-50 text-emerald-700" },
  no_show: { label: "Absent", className: "bg-rose-50 text-rose-700" },
};

function SessionCard({ session: s }: { session: SessionRow }) {
  const utils = trpc.useUtils();
  const mark = trpc.hr2.markAttendance.useMutation({
    onSuccess: () => { utils.hr2.sessions.invalidate(); utils.hr.pipeline.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const resend = trpc.hr2.resendTrainerEmail.useMutation({
    onSuccess: () => toast.success(`Sent the details to ${s.trainerEmail}`),
    onError: (e) => toast.error(e.message),
  });
  const booked = s.attendees.length;
  const capacity = s.capacity ?? 12;
  const online = s.delivery === "online";
  const open = markingOpen(s.startsAt);
  const attended = s.attendees.filter((a) => a.status === "completed").length;

  const copyLink = async () => {
    if (!s.registerUrl) return;
    await navigator.clipboard.writeText(s.registerUrl);
    toast.success("Register link copied. Share it only with the trainer.");
  };

  return (
    <article className="uc-card overflow-hidden">
      <div className="flex flex-wrap items-start gap-4 p-4">
        <div className="grid w-14 shrink-0 place-items-center rounded-xl bg-[--brand-50] py-2 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[--brand-700]">
            {new Date(s.startsAt).toLocaleDateString("en-GB", { month: "short" })}
          </span>
          <span className="text-xl font-semibold leading-none text-[--brand-900]">{new Date(s.startsAt).getDate()}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[--brand-900]">{s.course?.title ?? "Session"}</p>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${online ? "bg-violet-50 text-violet-700" : "bg-sky-50 text-sky-700"}`}>
              {online ? <Video className="h-3 w-3" aria-hidden /> : <Building2 className="h-3 w-3" aria-hidden />}
              {online ? "Live online" : "In person"}
            </span>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden />{day(s.startsAt)}, {time(s.startsAt)}–{time(s.endsAt)}</span>
            <span className="inline-flex min-w-0 items-center gap-1">
              {online ? <Video className="h-3 w-3" aria-hidden /> : <MapPin className="h-3 w-3" aria-hidden />}
              {online
                ? (s.meetingUrl ? <a href={s.meetingUrl} target="_blank" rel="noreferrer" className="truncate text-[--brand-700] hover:underline">Joining link</a> : "No joining link yet")
                : s.location ?? "Office"}
            </span>
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3 w-3" aria-hidden />{s.trainerName ?? "No trainer set"}
            </span>
          </p>
          <div className="flex items-center gap-2 pt-1">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              <div className="h-full rounded-full bg-[--brand-600]" style={{ width: `${Math.min(100, (booked / capacity) * 100)}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">{booked} of {capacity} places booked{open && booked > 0 ? ` · ${attended} attended` : ""}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {s.registerUrl && (
            <Button size="sm" variant="outline" onClick={() => void copyLink()}><Copy className="mr-1.5 h-3.5 w-3.5" /> Trainer link</Button>
          )}
          {s.trainerEmail && s.registerUrl && (
            <Button size="sm" variant="outline" disabled={resend.isPending} onClick={() => resend.mutate({ sessionId: Number(s.id) })}>
              <Send className="mr-1.5 h-3.5 w-3.5" /> Email trainer
            </Button>
          )}
        </div>
      </div>

      {s.attendees.length > 0 && (
        <ul className="divide-y border-t" style={{ borderColor: "var(--line)" }}>
          {s.attendees.map((at) => {
            const st = ATTENDANCE[at.status] ?? ATTENDANCE.registered;
            return (
              <li key={at.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
                <span className="min-w-0 flex-1 truncate">
                  {at.applicationId
                    ? <Link to={`/recruitment/pipeline/${at.applicationId}`} className="font-medium hover:underline">{at.name}</Link>
                    : <span className="font-medium">{at.name}</span>}
                </span>
                {at.personType === "candidate" && (
                  <Chip value={at.dbsVerified ? "verified" : "pending"} label={at.dbsVerified ? "DBS checked" : "DBS not checked"} />
                )}
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
                {open && (
                  <span className="inline-flex gap-1">
                    <Button size="sm" variant={at.status === "completed" ? "default" : "outline"} className="h-7 px-2"
                      aria-label={`Mark ${at.name} present`} disabled={mark.isPending}
                      onClick={() => mark.mutate({ enrolmentId: Number(at.id), mark: at.status === "completed" ? "booked" : "present" })}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant={at.status === "no_show" ? "destructive" : "outline"} className="h-7 px-2"
                      aria-label={`Mark ${at.name} absent`} disabled={mark.isPending}
                      onClick={() => mark.mutate({ enrolmentId: Number(at.id), mark: at.status === "no_show" ? "booked" : "absent" })}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

/* ── Schedule a session ── */
type CourseOption = { id: number; title: string; type: string };
type TrainerMode = "staff" | "external" | "none";

const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function nextWeekday(weekday: number, weeksAhead = 0) {
  const d = new Date();
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7 || 7) + weeksAhead * 7);
  return d;
}
const DATE_PICKS = [
  { label: "Tomorrow", date: () => { const d = new Date(); d.setDate(d.getDate() + 1); return d; } },
  { label: "Next Monday", date: () => nextWeekday(1) },
  { label: "Next Wednesday", date: () => nextWeekday(3) },
  { label: "In two weeks", date: () => nextWeekday(1, 1) },
];
const TIME_PICKS = [
  { label: "Morning", start: "09:00", end: "12:30" },
  { label: "Afternoon", start: "13:00", end: "16:30" },
  { label: "Full day", start: "09:00", end: "16:00" },
];

function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; label: string; options: { value: T; label: string; icon: LucideIcon }[];
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${value === o.value ? "border-[--brand-600] bg-[--brand-50] text-[--brand-900]" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
          <o.icon className="h-4 w-4" aria-hidden /> {o.label}
        </button>
      ))}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[--brand-900]">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-[--brand-600] text-[11px] text-white">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Chips({ items, onPick, active }: { items: { label: string }[]; onPick: (i: number) => void; active?: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <button key={it.label} type="button" onClick={() => onPick(i)}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${active === i ? "border-[--brand-600] bg-[--brand-50] text-[--brand-800]" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-800"}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

function SessionDialog({ open, onClose, courses }: { open: boolean; onClose: () => void; courses: CourseOption[] }) {
  const utils = trpc.useUtils();
  const optionsQ = trpc.hr2.trainerOptions.useQuery(undefined, { enabled: open });
  const classroom = courses.filter((c) => c.type !== "online");
  const online = courses.filter((c) => c.type === "online");

  const [courseId, setCourseId] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("16:00");
  const [delivery, setDelivery] = useState<"in_person" | "online">("in_person");
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [capacity, setCapacity] = useState(12);
  const [trainerMode, setTrainerMode] = useState<TrainerMode>("staff");
  const [trainerStaffId, setTrainerStaffId] = useState("");
  const [trainerName, setTrainerName] = useState("");
  const [trainerEmail, setTrainerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(true);

  const effectiveCourse = courseId || (classroom[0] ? String(classroom[0].id) : "");
  const course = courses.find((c) => String(c.id) === effectiveCourse);
  const staff = optionsQ.data?.staff ?? [];
  const waiting = optionsQ.data?.waitingForInduction ?? 0;

  const reset = () => {
    setCourseId(""); setDate(""); setStart("09:00"); setEnd("16:00"); setDelivery("in_person"); setLocation("");
    setMeetingUrl(""); setCapacity(12); setTrainerMode("staff"); setTrainerStaffId(""); setTrainerName("");
    setTrainerEmail(""); setNotes(""); setNotify(true);
  };
  const close = () => { reset(); onClose(); };

  const create = trpc.hr2.createSession.useMutation({
    onSuccess: (res) => {
      utils.hr2.sessions.invalidate();
      const parts = ["Session scheduled."];
      if (res.trainerEmailed) parts.push("The trainer has been emailed their register link.");
      if (res.emailingCandidates > 0) parts.push(`Emailing ${res.emailingCandidates} new starter${res.emailingCandidates === 1 ? "" : "s"} to book.`);
      toast.success(parts.join(" "));
      if (!res.extrasSaved) toast.warning("Run the 0005 SQL in Supabase so trainers get a register link and online details are saved.");
      close();
    },
    onError: (e) => toast.error(e.message),
  });

  const minutes = useMemo(() => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return eh * 60 + em - (sh * 60 + sm);
  }, [start, end]);
  const startsAt = date ? new Date(`${date}T${start}:00`) : null;
  const inPast = !!startsAt && startsAt.getTime() < Date.now();
  const urlOk = !meetingUrl || /^https?:\/\/\S+\.\S+/.test(meetingUrl);
  const emailOk = !trainerEmail || /^\S+@\S+\.\S+$/.test(trainerEmail);
  const problem =
    !effectiveCourse ? "Choose a course."
    : !date ? "Pick a date."
    : inPast ? "That time has already passed."
    : minutes <= 0 ? "The session must end after it starts."
    : delivery === "online" && !urlOk ? "The joining link should start with https://"
    : trainerMode === "staff" && !trainerStaffId ? "Choose who is running it, or pick another trainer option."
    : trainerMode === "external" && (!trainerName.trim() || !trainerEmail.trim()) ? "Add the trainer's name and email."
    : trainerMode === "external" && !emailOk ? "Check the trainer's email address."
    : null;
  const pickedDate = DATE_PICKS.findIndex((p) => toDateInput(p.date()) === date);
  const pickedTime = TIME_PICKS.findIndex((p) => p.start === start && p.end === end);
  const duration = minutes > 0 ? `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} h` : ""}${minutes % 60 ? ` ${minutes % 60} min` : ""}`.trim() : "";
  const trainerLabel = trainerMode === "staff" ? staff.find((s) => String(s.id) === trainerStaffId)?.name
    : trainerMode === "external" ? trainerName.trim() : null;

  const submit = () => {
    if (problem || !startsAt) return;
    create.mutate({
      courseId: Number(effectiveCourse),
      startsAt: startsAt.toISOString(),
      endsAt: new Date(`${date}T${end}:00`).toISOString(),
      delivery,
      location: delivery === "in_person" ? location.trim() || undefined : undefined,
      meetingUrl: delivery === "online" ? meetingUrl.trim() || undefined : undefined,
      capacity,
      trainerStaffId: trainerMode === "staff" ? Number(trainerStaffId) : undefined,
      trainerName: trainerMode === "external" ? trainerName.trim() : undefined,
      trainerEmail: trainerMode === "external" ? trainerEmail.trim() : undefined,
      notes: notes.trim() || undefined,
      notifyCandidates: notify,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Schedule a training session</DialogTitle>
          <DialogDescription>New starters book a place from their portal. The trainer gets the details and a private attendance register.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Step n={1} title="Course">
            <Select value={effectiveCourse} onValueChange={setCourseId}>
              <SelectTrigger aria-label="Course"><SelectValue placeholder="Choose a course" /></SelectTrigger>
              <SelectContent>
                {classroom.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Classroom courses</SelectLabel>
                    {classroom.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
                  </SelectGroup>
                )}
                {online.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Online courses (live, trainer-led)</SelectLabel>
                    {online.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            {course?.type === "online" && (
              <p className="text-xs text-muted-foreground">
                New starters normally do this course on their own in their learning account. Schedule it only for a live, trainer-led version.
              </p>
            )}
          </Step>

          <Step n={2} title="Date and time">
            <Chips items={DATE_PICKS} active={pickedDate} onPick={(i) => setDate(toDateInput(DATE_PICKS[i].date()))} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="sess-date">Date</Label>
                <Input id="sess-date" type="date" min={toDateInput(new Date())} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sess-start">Starts</Label>
                <Input id="sess-start" type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sess-end">Ends</Label>
                <Input id="sess-end" type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Chips items={TIME_PICKS} active={pickedTime} onPick={(i) => { setStart(TIME_PICKS[i].start); setEnd(TIME_PICKS[i].end); }} />
              {date && duration && !inPast && (
                <span className="text-xs text-muted-foreground">{day(`${date}T${start}:00`)} · {duration}</span>
              )}
            </div>
          </Step>

          <Step n={3} title="Where">
            <Segmented label="How it is delivered" value={delivery} onChange={setDelivery} options={[
              { value: "in_person", label: "In person", icon: Building2 },
              { value: "online", label: "Live online", icon: Video },
            ]} />
            {delivery === "in_person" ? (
              <div className="space-y-1">
                <Label htmlFor="sess-loc">Address or room</Label>
                <Input id="sess-loc" list="sess-loc-list" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Head office, training room 1" />
                <datalist id="sess-loc-list">{(optionsQ.data?.locations ?? []).map((l) => <option key={l} value={l} />)}</datalist>
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="sess-url">Joining link (Teams, Zoom or Meet)</Label>
                <Input id="sess-url" type="url" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://teams.microsoft.com/…" />
                <p className="text-xs text-muted-foreground">Only people with a place see the link. You can leave it blank and add it later.</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Label className="text-sm">Places</Label>
              <div className="inline-flex items-center rounded-xl border" style={{ borderColor: "var(--line)" }}>
                <button type="button" aria-label="Fewer places" className="grid h-8 w-8 place-items-center text-slate-600 hover:text-slate-900 disabled:opacity-40"
                  disabled={capacity <= 1} onClick={() => setCapacity((c) => Math.max(1, c - 1))}><Minus className="h-3.5 w-3.5" /></button>
                <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{capacity}</span>
                <button type="button" aria-label="More places" className="grid h-8 w-8 place-items-center text-slate-600 hover:text-slate-900 disabled:opacity-40"
                  disabled={capacity >= 100} onClick={() => setCapacity((c) => Math.min(100, c + 1))}><Plus className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </Step>

          <Step n={4} title="Trainer">
            <Segmented label="Who runs it" value={trainerMode} onChange={setTrainerMode} options={[
              { value: "staff", label: "Our team", icon: Users },
              { value: "external", label: "Outside trainer", icon: UserRound },
              { value: "none", label: "Decide later", icon: Clock },
            ]} />
            {trainerMode === "staff" && (
              <Select value={trainerStaffId} onValueChange={setTrainerStaffId}>
                <SelectTrigger aria-label="Trainer"><SelectValue placeholder={optionsQ.isLoading ? "Loading staff…" : "Choose a member of staff"} /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.jobTitle ? ` — ${s.jobTitle}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {trainerMode === "external" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="sess-tname">Name</Label>
                  <Input id="sess-tname" list="sess-trainers" value={trainerName} onChange={(e) => {
                    setTrainerName(e.target.value);
                    const known = optionsQ.data?.external.find((t) => t.name === e.target.value);
                    if (known) setTrainerEmail(known.email);
                  }} placeholder="Jane Smith" />
                  <datalist id="sess-trainers">{(optionsQ.data?.external ?? []).map((t) => <option key={t.email} value={t.name} />)}</datalist>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sess-temail">Email</Label>
                  <Input id="sess-temail" type="email" value={trainerEmail} onChange={(e) => setTrainerEmail(e.target.value)} placeholder="jane@trainingco.co.uk" />
                </div>
              </div>
            )}
            {trainerMode !== "none" && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Mail className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                We'll email the trainer the details and a private register link to mark attendance on the day. No login needed.
              </p>
            )}
          </Step>

          <Step n={5} title="Notes and invitations">
            <div className="space-y-1">
              <Label htmlFor="sess-notes">Notes for the trainer and attendees (optional)</Label>
              <Textarea id="sess-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Parking at the rear. Wear comfortable shoes for the practical part." />
            </div>
            <label className="flex items-start gap-2.5 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--line)" }}>
              <Checkbox className="mt-0.5" checked={notify} onCheckedChange={(v) => setNotify(v === true)} />
              <span>
                <span className="font-medium">Email new starters who are waiting for a date</span>
                <span className="block text-xs text-muted-foreground">
                  {optionsQ.isLoading ? "Checking who is waiting…"
                    : waiting === 0 ? "Nobody is waiting right now. New starters see open dates in their portal when they accept an offer."
                    : `${waiting} new starter${waiting === 1 ? " has" : "s have"} accepted an offer and ${waiting === 1 ? "is" : "are"} waiting to book.`}
                </span>
              </span>
            </label>
          </Step>
        </div>

        <DialogFooter className="items-center gap-3 border-t pt-4 sm:justify-between" style={{ borderColor: "var(--line)" }}>
          <p className={`text-xs ${problem ? "text-amber-700" : "text-muted-foreground"}`} role="status">
            {problem ?? `${course?.title} · ${date ? day(`${date}T${start}:00`) : ""} ${start}–${end}${trainerLabel ? ` · ${trainerLabel}` : ""}`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button disabled={!!problem || create.isPending} onClick={submit}>
              <GraduationCap className="mr-1.5 h-4 w-4" /> {create.isPending ? "Scheduling…" : "Schedule session"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DbsDialog({ open, onClose, candidates }: {
  open: boolean; onClose: () => void; candidates: { id: number; name: string }[];
}) {
  const utils = trpc.useUtils();
  const [appId, setAppId] = useState("");
  const [cert, setCert] = useState("");
  const [sighted, setSighted] = useState(false);
  const [barred, setBarred] = useState(false);
  const [update, setUpdate] = useState(false);
  const [notes, setNotes] = useState("");
  const checkin = trpc.hr2.dbsCheckIn.useMutation({
    onSuccess: () => {
      utils.hr.pipeline.invalidate();
      utils.hr2.sessions.invalidate();
      toast.success("DBS verification recorded — immutable");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>DBS check-in</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Recorded at classroom check-in. This record is immutable — it cannot be edited after saving.
        </p>
        <div className="mt-2 space-y-3">
          <div>
            <Label>Candidate</Label>
            <Select value={appId} onValueChange={setAppId}>
              <SelectTrigger><SelectValue placeholder="Select candidate…" /></SelectTrigger>
              <SelectContent>
                {candidates.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="dbs-cert">Certificate number</Label>
            <Input id="dbs-cert" value={cert} onChange={(e) => setCert(e.target.value)} placeholder="001234567890" />
          </div>
          <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={sighted} onCheckedChange={(v) => setSighted(v === true)} />
              I have sighted the ORIGINAL certificate (not a copy)
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={barred} onCheckedChange={(v) => setBarred(v === true)} />
              Barred list (adults) check completed
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={update} onCheckedChange={(v) => setUpdate(v === true)} />
              DBS Update Service checked
            </label>
          </div>
          <div>
            <Label htmlFor="dbs-notes">Notes (optional)</Label>
            <Input id="dbs-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!appId || cert.length < 4 || !sighted || !barred || checkin.isPending}
            onClick={() => checkin.mutate({
              applicationId: Number(appId), certificateNo: cert,
              sightedOriginal: true as const, barredListAdultsChecked: true as const,
              updateServiceChecked: update, notes: notes || undefined,
            })}>
            <GraduationCap className="h-4 w-4 mr-1.5" /> Record verification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
