import { useParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { Loading, ErrorState } from "@/components/common";
import {
  Building2, Check, CheckCircle2, ClipboardCheck, Clock, IdCard, Lock, MapPin, ShieldAlert, ShieldCheck, UserRound, Users, Video, X,
} from "lucide-react";
import { toast } from "sonner";

type Mark = "present" | "absent" | "booked";

/** The trainer's attendance register, opened from the private link in their email. */
export default function TrainingRegister() {
  const { token } = useParams<{ token: string }>();
  const utils = trpc.useUtils();
  const q = trpc.trainingRegister.get.useQuery({ token: token! }, { enabled: !!token, refetchInterval: 60_000 });
  const mark = trpc.trainingRegister.mark.useMutation({
    onSuccess: () => utils.trainingRegister.get.invalidate({ token: token! }),
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <Shell><Loading rows={4} /></Shell>;
  if (q.error) return <Shell><ErrorState message={q.error.message} /></Shell>;
  const d = q.data!;
  const people = d.attendees;
  const present = people.filter((p) => p.status === "completed").length;
  const absent = people.filter((p) => p.status === "no_show").length;
  const left = people.length - present - absent;
  const online = d.session.delivery === "online";
  const set = (id: number, current: string, want: Exclude<Mark, "booked">) => {
    const same = (want === "present" && current === "completed") || (want === "absent" && current === "no_show");
    mark.mutate({ token: token!, enrolmentId: id, mark: same ? "booked" : want });
  };

  return (
    <Shell org={d.orgName}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[--brand-600]">Attendance register</p>
      <h1 className="mt-1 text-2xl font-bold text-[--brand-900]">{d.course.title}</h1>

      <dl className="mt-4 grid grid-cols-1 gap-2 rounded-2xl border bg-white p-4 text-sm sm:grid-cols-2" style={{ borderColor: "var(--card-line)" }}>
        <div className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 text-[--brand-600]" aria-hidden /><div><dt className="sr-only">When</dt><dd>{d.session.when}</dd></div></div>
        <div className="flex items-start gap-2">
          {online ? <Video className="mt-0.5 h-4 w-4 text-[--brand-600]" aria-hidden /> : <MapPin className="mt-0.5 h-4 w-4 text-[--brand-600]" aria-hidden />}
          <div><dt className="sr-only">Where</dt><dd>
            {online && d.session.meetingUrl
              ? <a href={d.session.meetingUrl} target="_blank" rel="noreferrer" className="font-medium text-[--brand-700] hover:underline">Join the online session</a>
              : d.session.where}
          </dd></div>
        </div>
        <div className="flex items-start gap-2"><UserRound className="mt-0.5 h-4 w-4 text-[--brand-600]" aria-hidden /><div><dt className="sr-only">Trainer</dt><dd>{d.session.trainerName ?? "Trainer"}</dd></div></div>
        <div className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 text-[--brand-600]" aria-hidden /><div><dt className="sr-only">Places</dt><dd>{people.length} of {d.session.capacity} places booked</dd></div></div>
        {d.session.notes && <p className="sm:col-span-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">{d.session.notes}</p>}
      </dl>

      {!online && (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <p className="flex items-center gap-2 font-semibold"><ClipboardCheck className="h-4 w-4 text-sky-600" aria-hidden /> As people arrive</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-sky-900/90">
            <li className="flex gap-2"><IdCard className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Check their photo ID matches the name on this list.</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> New starters marked "DBS not checked" must show their original DBS certificate. Tell the office the certificate number before they leave.</li>
            <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Mark people present once they have completed the session. That signs the course off on their record.</li>
          </ul>
        </div>
      )}

      <section className="mt-6" aria-label="Attendees">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold text-[--brand-900]">Attendees</h2>
          {people.length > 0 && (
            <span className="text-xs text-muted-foreground">{present} present · {absent} absent · {left} to mark</span>
          )}
        </div>
        {!d.markingOpen && people.length > 0 && (
          <p className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-muted-foreground">You can mark attendance on the day of the session. The list updates as people book.</p>
        )}
        {people.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-white p-6 text-center text-sm text-muted-foreground" style={{ borderColor: "var(--card-line)" }}>
            Nobody has booked yet. This page updates as people book.
          </p>
        ) : (
          <ul className="space-y-2">
            {people.map((p) => (
              <li key={p.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3 ${p.status === "completed" ? "border-emerald-200" : p.status === "no_show" ? "border-rose-200" : ""}`}
                style={p.status === "registered" ? { borderColor: "var(--card-line)" } : undefined}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${p.status === "completed" ? "bg-emerald-100 text-emerald-700" : p.status === "no_show" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                  {p.status === "completed" ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{p.name}</p>
                  {p.isNewStarter && (
                    <p className={`flex items-center gap-1 text-xs ${p.dbsChecked ? "text-emerald-700" : "text-amber-700"}`}>
                      {p.dbsChecked ? <ShieldCheck className="h-3 w-3" aria-hidden /> : <ShieldAlert className="h-3 w-3" aria-hidden />}
                      New starter · {p.dbsChecked ? "DBS checked" : "DBS not checked"}
                    </p>
                  )}
                </div>
                {d.markingOpen ? (
                  <div className="flex gap-2" role="group" aria-label={`Attendance for ${p.name}`}>
                    <button type="button" disabled={mark.isPending} onClick={() => set(p.id, p.status, "present")} aria-pressed={p.status === "completed"}
                      className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors disabled:opacity-60 ${p.status === "completed" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 text-slate-700 hover:border-emerald-400"}`}>
                      <Check className="h-4 w-4" aria-hidden /> Present
                    </button>
                    <button type="button" disabled={mark.isPending} onClick={() => set(p.id, p.status, "absent")} aria-pressed={p.status === "no_show"}
                      className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors disabled:opacity-60 ${p.status === "no_show" ? "border-rose-600 bg-rose-600 text-white" : "border-slate-200 text-slate-700 hover:border-rose-400"}`}>
                      <X className="h-4 w-4" aria-hidden /> Absent
                    </button>
                  </div>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Booked</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {d.markingOpen && people.length > 0 && left === 0 && (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Register complete. The office has been told. Thank you.
          </p>
        )}
      </section>

      <p className="mt-8 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" aria-hidden /> This register is private to you. Please don't forward the link.
      </p>
    </Shell>
  );
}

function Shell({ children, org }: { children: React.ReactNode; org?: string }) {
  return (
    <div className="min-h-screen bg-[--app-bg]">
      <header className="border-b bg-white" style={{ borderColor: "var(--line)" }}>
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <img src="/logo.png" alt={org ?? "Unique Care UK"} className="h-9 w-auto" />
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Building2 className="h-3.5 w-3.5" aria-hidden /> Trainer</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}
