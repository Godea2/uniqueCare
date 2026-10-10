import { useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { Loading, ErrorState, Chip, fmtDate, fmtTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Circle, Upload, PenLine, GraduationCap, CalendarDays } from "lucide-react";
import { toast } from "sonner";

const JOURNEY = [
  { key: "applied", label: "Application received" },
  { key: "pre_interview_forms_sent", label: "Pre-interview form" },
  { key: "interview_booked", label: "Interview" },
  { key: "approved", label: "Decision" },
  { key: "compliance_docs_requested", label: "Compliance documents" },
  { key: "offer_sent", label: "Offer" },
  { key: "training_booked", label: "Training" },
  { key: "hired", label: "Welcome aboard" },
];
const JOURNEY_INDEX: Record<string, number> = {
  applied: 0, review: 0, shortlisted: 0, pre_interview_forms_sent: 1, pre_interview_forms_complete: 1,
  interview_booked: 2, interviewed: 2, approved: 3, compliance_docs_requested: 4,
  compliance_docs_complete: 4, offer_sent: 5, offer_accepted: 5, training_booked: 6,
  online_training_in_progress: 6, dbs_verified: 6, training_complete: 6, hired: 7,
};

export default function Portal() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const q = trpc.portal.get.useQuery({ token: token! }, { enabled: !!token, refetchInterval: 30000 });

  if (q.isLoading) return <Shell><Loading rows={5} /></Shell>;
  if (q.error) return <Shell><ErrorState message={q.error.message} /></Shell>;
  const d = q.data!;
  const stage = d.application.stage;
  const idx = JOURNEY_INDEX[stage] ?? 0;

  if (["rejected", "screened_out", "withdrawn"].includes(stage)) {
    return (
      <Shell>
        <div className="uc-card p-8 text-center">
          <h1 className="text-xl font-semibold text-[--brand-900]">Thank you, {d.candidate.firstName}</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            {stage === "withdrawn"
              ? "Your application has been withdrawn. If this wasn't you, please contact the office."
              : "Unfortunately your application for " + d.job.title + " has not been successful this time. We keep your details for 12 months and would encourage you to apply again."}
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {params.get("welcome") === "1" && (
        <div className="mb-5 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          <strong>Application received.</strong> This is your personal portal — bookmark it or keep the link from your email.
          You'll complete each step here as your application progresses.
        </div>
      )}

      <h1 className="text-2xl font-bold text-[--brand-900]">Hello, {d.candidate.firstName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your application for <strong>{d.job.title}</strong></p>

      {/* Journey tracker */}
      <ol className="mt-6 flex items-start gap-0 overflow-x-auto pb-2" aria-label="Application progress">
        {JOURNEY.map((s, i) => (
          <li key={s.key} className="flex shrink-0 items-center">
            <div className="flex flex-col items-center w-20">
              {i < idx || (i === idx && stage === "hired") ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden />
              ) : i === idx ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[--brand-600] text-[10px] font-bold text-white">{i + 1}</span>
              ) : (
                <Circle className="h-5 w-5 text-slate-300" aria-hidden />
              )}
              <span className={`mt-1 text-center text-[10px] leading-tight ${i <= idx ? "font-medium text-[--brand-900]" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
            {i < JOURNEY.length - 1 && <span className={`h-px w-6 shrink-0 ${i < idx ? "bg-green-500" : "bg-slate-200"}`} aria-hidden />}
          </li>
        ))}
      </ol>

      <div className="mt-6 space-y-5">
        {(stage === "pre_interview_forms_sent" || stage === "shortlisted") && (
          <PreInterviewForm token={token!} existing={(d.form?.data as Record<string, unknown>) ?? {}} submitted={!!d.form?.submittedAt} />
        )}

        {["pre_interview_forms_complete", "interview_booked"].includes(stage) && (
          <BookingSection token={token!} slots={d.availableSlots} booking={d.booking} slot={d.slot ?? null} />
        )}

        {["compliance_docs_requested", "compliance_docs_complete"].includes(stage) && (
          <DocsSection token={token!} docs={d.docs} />
        )}

        {d.offer && stage === "offer_sent" && (
          <OfferSection token={token!} content={d.offer.content ?? ""} />
        )}
        {d.offer?.acceptedAt && (
          <div className="uc-card border-l-4 border-l-green-500 p-4 text-sm">
            <p className="font-medium text-green-800">Offer accepted — signed as {d.offer.signatureName} on {fmtDate(d.offer.acceptedAt)}.</p>
          </div>
        )}

        {d.offerAccepted && (
          <TrainingSection token={token!} enrolments={d.enrolments} sessions={d.sessions} />
        )}

        {stage === "applied" || stage === "review" ? (
          <div className="uc-card p-5 text-sm text-muted-foreground">
            Your application is being reviewed by our team. There's nothing for you to do right now —
            we'll email you as soon as there's an update.
          </div>
        ) : null}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[--app-bg]">
      <header className="bg-white border-b" style={{ borderColor: "var(--line)" }}>
        <div className="mx-auto max-w-2xl px-4 py-4">
          <img src="/logo.png" alt="Unique Care UK" className="h-9 w-auto" />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}

/* ── Pre-interview form (Regulation 19 / Schedule 3) ── */
function PreInterviewForm({ token, existing, submitted }: {
  token: string; existing: Record<string, unknown>; submitted: boolean;
}) {
  const utils = trpc.useUtils();
  const [f, setF] = useState<Record<string, unknown>>({
    fullAddress: "", employmentHistory: "", gapsExplanation: "",
    qualifications: "", healthDeclaration: false, dbsConsent: false,
    referee1Name: "", referee1Email: "", referee1Relationship: "", referee1Recent: true,
    referee2Name: "", referee2Email: "", referee2Relationship: "", referee2Recent: false,
    criminalConvictions: "", fitnessDeclaration: false,
    ...existing,
  });
  const save = trpc.portal.saveForm.useMutation({
    onSuccess: () => { utils.portal.get.invalidate({ token }); },
    onError: (e) => toast.error(e.message),
  });
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  if (submitted) {
    return (
      <section className="uc-card p-5">
        <h2 className="flex items-center gap-2 font-semibold text-[--brand-900]"><CheckCircle2 className="h-4 w-4 text-green-600" /> Pre-interview form submitted</h2>
        <p className="mt-1 text-sm text-muted-foreground">Thank you — you can now book your interview below.</p>
      </section>
    );
  }

  const requiredOk = f.fullAddress && f.employmentHistory && f.referee1Name && f.referee1Email &&
    f.referee2Name && f.referee2Email && f.healthDeclaration && f.dbsConsent && f.fitnessDeclaration;

  return (
    <section className="uc-card p-5">
      <h2 className="font-semibold text-[--brand-900]">Pre-interview form</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Required under CQC Regulation 19 and Schedule 3 before interview. You can save and come back — nothing is final until you submit.
      </p>
      <div className="mt-4 space-y-4">
        <div>
          <Label htmlFor="pf-addr">Full home address *</Label>
          <Textarea id="pf-addr" rows={2} value={String(f.fullAddress ?? "")} onChange={(e) => set("fullAddress", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pf-emp">Employment history (most recent first, with dates) *</Label>
          <Textarea id="pf-emp" rows={4} value={String(f.employmentHistory ?? "")} onChange={(e) => set("employmentHistory", e.target.value)}
            placeholder="e.g. Jan 2022 – present: Care Assistant, ABC Care, Birmingham…" />
        </div>
        <div>
          <Label htmlFor="pf-gaps">Explanation of any gaps in employment</Label>
          <Textarea id="pf-gaps" rows={2} value={String(f.gapsExplanation ?? "")} onChange={(e) => set("gapsExplanation", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pf-qual">Qualifications and training</Label>
          <Textarea id="pf-qual" rows={2} value={String(f.qualifications ?? "")} onChange={(e) => set("qualifications", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pf-conv">Criminal convictions (spent convictions need not be declared for this role — care roles are exempt under the Rehabilitation of Offenders Act)</Label>
          <Textarea id="pf-conv" rows={2} value={String(f.criminalConvictions ?? "")} onChange={(e) => set("criminalConvictions", e.target.value)} placeholder="None" />
        </div>

        <fieldset className="rounded-lg border p-3 space-y-3" style={{ borderColor: "var(--line)" }}>
          <legend className="px-1 text-xs font-semibold text-[--brand-900]">Referee 1 — most recent employer *</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><Label htmlFor="r1-n">Name *</Label><Input id="r1-n" value={String(f.referee1Name ?? "")} onChange={(e) => set("referee1Name", e.target.value)} /></div>
            <div><Label htmlFor="r1-e">Email *</Label><Input id="r1-e" type="email" value={String(f.referee1Email ?? "")} onChange={(e) => set("referee1Email", e.target.value)} /></div>
            <div><Label htmlFor="r1-r">Relationship</Label><Input id="r1-r" value={String(f.referee1Relationship ?? "")} onChange={(e) => set("referee1Relationship", e.target.value)} placeholder="Line manager" /></div>
          </div>
        </fieldset>
        <fieldset className="rounded-lg border p-3 space-y-3" style={{ borderColor: "var(--line)" }}>
          <legend className="px-1 text-xs font-semibold text-[--brand-900]">Referee 2 *</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><Label htmlFor="r2-n">Name *</Label><Input id="r2-n" value={String(f.referee2Name ?? "")} onChange={(e) => set("referee2Name", e.target.value)} /></div>
            <div><Label htmlFor="r2-e">Email *</Label><Input id="r2-e" type="email" value={String(f.referee2Email ?? "")} onChange={(e) => set("referee2Email", e.target.value)} /></div>
            <div><Label htmlFor="r2-r">Relationship</Label><Input id="r2-r" value={String(f.referee2Relationship ?? "")} onChange={(e) => set("referee2Relationship", e.target.value)} /></div>
          </div>
        </fieldset>

        <div className="space-y-2.5 rounded-lg bg-[--brand-50] border p-3" style={{ borderColor: "var(--line)" }}>
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={f.healthDeclaration === true} onCheckedChange={(v) => set("healthDeclaration", v === true)} /> I declare I am fit to undertake the duties of this role (with reasonable adjustments where needed). *</label>
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={f.dbsConsent === true} onCheckedChange={(v) => set("dbsConsent", v === true)} /> I consent to an enhanced DBS check including the adults' barred list. *</label>
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={f.fitnessDeclaration === true} onCheckedChange={(v) => set("fitnessDeclaration", v === true)} /> The information I have provided is true and complete. I understand false information may lead to withdrawal of any offer. *</label>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" disabled={save.isPending}
            onClick={() => save.mutate({ token, data: f, submit: false })}>
            Save progress
          </Button>
          <Button disabled={!requiredOk || save.isPending}
            onClick={() => save.mutate({ token, data: { ...f, referees: [
              { name: f.referee1Name, email: f.referee1Email, relationship: f.referee1Relationship, mostRecent: true },
              { name: f.referee2Name, email: f.referee2Email, relationship: f.referee2Relationship, mostRecent: false },
            ] }, submit: true })}>
            Submit form
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ── Interview booking ── */
function BookingSection({ token, slots, booking, slot }: {
  token: string;
  slots: { id: number | bigint; startsAt: string | Date; endsAt: string | Date; locationText: string | null; capacity: number | null; bookedCount: number }[];
  booking: { slotId: number | bigint } | null;
  slot: { id: number | bigint; startsAt: string | Date; endsAt: string | Date; locationText: string | null; teamsMeetingUrl: string | null } | null;
}) {
  const utils = trpc.useUtils();
  const book = trpc.portal.bookSlot.useMutation({
    onSuccess: () => { utils.portal.get.invalidate({ token }); toast.success("Interview booked — see you then!"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <section className="uc-card p-5">
      <h2 className="flex items-center gap-2 font-semibold text-[--brand-900]"><CalendarDays className="h-4 w-4 text-[--brand-600]" /> Interview</h2>
      {booking && slot ? (
        <div className="mt-2">
          <p className="text-sm">
            You're booked for <strong>{fmtDate(slot.startsAt)} at {fmtTime(slot.startsAt)}</strong> — {slot.locationText ?? "video interview"}.
          </p>
          {slot.teamsMeetingUrl && (
            <p className="mt-1 text-xs text-muted-foreground break-all">
              Join link: <a className="text-[--brand-600] underline" href={slot.teamsMeetingUrl}>{slot.teamsMeetingUrl}</a>
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Need to change? Pick a different slot below — your old booking is released automatically.</p>
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Choose a time that suits you:</p>
      )}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {slots.map((s) => {
          const full = s.bookedCount >= (s.capacity ?? 1);
          const mine = booking && Number(booking.slotId) === Number(s.id);
          return (
            <button key={s.id} type="button" disabled={full || book.isPending}
              onClick={() => book.mutate({ token, slotId: Number(s.id) })}
              className={`uc-focus rounded-lg border p-3 text-left text-sm transition-colors ${mine ? "border-green-500 bg-green-50" : full ? "opacity-50 cursor-not-allowed bg-slate-50" : "bg-white hover:border-[--brand-500] hover:bg-[--brand-50]"}`}
              style={{ borderColor: mine ? undefined : "var(--line)" }}>
              <span className="block font-semibold">{fmtDate(s.startsAt)}</span>
              <span className="block">{fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}</span>
              <span className="block text-xs text-muted-foreground">{s.locationText ?? "Video interview"}</span>
              <span className="mt-1 inline-block">
                {mine ? <Chip value="booked" label="Your booking" /> : full ? <Chip value="closed" label="Full" /> : <Chip value="open" label="Available" />}
              </span>
            </button>
          );
        })}
        {slots.length === 0 && <p className="text-sm text-muted-foreground">New slots are added regularly — check back soon.</p>}
      </div>
    </section>
  );
}

/* ── Compliance documents ── */
function DocsSection({ token, docs }: {
  token: string;
  docs: { id: number | bigint; requirementKey: string; status: string; fileName: string | null; rejectionReason: string | null; requirement?: { label: string; guidance?: string | null } }[];
}) {
  const utils = trpc.useUtils();
  const [files, setFiles] = useState<Record<string, File>>({});
  const upload = trpc.portal.uploadDoc.useMutation({
    onSuccess: (_d, v) => {
      setFiles((s) => { const next = { ...s }; delete next[v.requirementKey]; return next; });
      utils.portal.get.invalidate({ token });
      toast.success("Document received");
    },
    onError: (e) => toast.error(e.message),
  });
  const send = async (requirementKey: string) => {
    const file = files[requirementKey];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Files must be 10 MB or smaller."); return; }
    const contentBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    upload.mutate({ token, requirementKey, fileName: file.name, contentBase64 });
  };

  return (
    <section className="uc-card p-5">
      <h2 className="flex items-center gap-2 font-semibold text-[--brand-900]"><Upload className="h-4 w-4 text-[--brand-600]" /> Compliance documents</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        We need these before we can make an offer (CQC Regulation 19). Photograph or scan each document and attach it below.
      </p>
      <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
        {docs.map((doc) => (
          <li key={doc.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{doc.requirement?.label ?? doc.requirementKey.replace(/_/g, " ")}</p>
                {doc.requirement?.guidance && <p className="text-xs text-muted-foreground">{doc.requirement.guidance}</p>}
                {doc.status === "rejected" && doc.rejectionReason && (
                  <p className="mt-0.5 text-xs text-red-700">Rejected: {doc.rejectionReason} — please upload again.</p>
                )}
              </div>
              <Chip value={doc.status} />
            </div>
            {(doc.status === "requested" || doc.status === "rejected") && (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="file" className="h-8 text-xs"
                  accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx,application/pdf,image/*"
                  aria-label={`Upload ${doc.requirement?.label ?? doc.requirementKey}`}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setFiles((s) => ({ ...s, [doc.requirementKey]: file }));
                  }}
                />
                <Button size="sm" className="h-8 shrink-0" disabled={!files[doc.requirementKey] || upload.isPending}
                  onClick={() => void send(doc.requirementKey)}>
                  {upload.isPending && upload.variables?.requirementKey === doc.requirementKey ? "Uploading…" : "Upload"}
                </Button>
              </div>
            )}
            {doc.fileName && doc.status !== "requested" && (
              <p className="mt-1 text-xs text-muted-foreground">File: {doc.fileName}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Offer acceptance ── */
function OfferSection({ token, content }: { token: string; content: string }) {
  const utils = trpc.useUtils();
  const [sig, setSig] = useState("");
  const [agree, setAgree] = useState(false);
  const accept = trpc.portal.acceptOffer.useMutation({
    onSuccess: () => { utils.portal.get.invalidate({ token }); toast.success("Congratulations — offer accepted!"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <section className="uc-card border-l-4 border-l-[--brand-600] p-5">
      <h2 className="flex items-center gap-2 font-semibold text-[--brand-900]"><PenLine className="h-4 w-4 text-[--brand-600]" /> Your offer of employment</h2>
      <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-[--brand-50] border p-4 text-sm leading-relaxed" style={{ borderColor: "var(--line)" }}>
        {content}
      </pre>
      <div className="mt-4 space-y-3">
        <div>
          <Label htmlFor="of-sig">Type your full name to sign</Label>
          <Input id="of-sig" value={sig} onChange={(e) => setSig(e.target.value)} placeholder="Your full legal name" className="font-serif text-lg italic" />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} />
          I accept this offer of employment and the terms set out above.
        </label>
        <Button disabled={sig.length < 2 || !agree || accept.isPending}
          onClick={() => accept.mutate({ token, signatureName: sig })}>
          Sign and accept offer
        </Button>
        <p className="text-[11px] text-muted-foreground">Your signature, the date/time and your IP address are recorded as proof of acceptance.</p>
      </div>
    </section>
  );
}

/* ── Training ── */
function TrainingSection({ token, enrolments, sessions }: {
  token: string;
  enrolments: { id: number | bigint; courseId: number | bigint; sessionId: number | bigint | null; status: string; course?: { id: number | bigint; title: string; delivery?: string; type?: string } }[];
  sessions: { id: number | bigint; courseId: number | bigint; startsAt: string | Date; endsAt: string | Date; location: string | null; capacity: number | null }[];
}) {
  const utils = trpc.useUtils();
  const register = trpc.portal.registerTraining.useMutation({
    onSuccess: () => { utils.portal.get.invalidate({ token }); toast.success("Registered for induction"); },
    onError: (e) => toast.error(e.message),
  });
  const complete = trpc.portal.markCourseComplete.useMutation({
    onSuccess: () => { utils.portal.get.invalidate({ token }); toast.success("Course marked complete"); },
    onError: (e) => toast.error(e.message),
  });

  const onlineEnrolments = enrolments.filter((e) => !e.sessionId);
  const sessionEnrolments = enrolments.filter((e) => e.sessionId);

  return (
    <section className="uc-card p-5">
      <h2 className="flex items-center gap-2 font-semibold text-[--brand-900]"><GraduationCap className="h-4 w-4 text-[--brand-600]" /> Your training</h2>

      {onlineEnrolments.length > 0 && (
        <div className="mt-3">
          <p className="uc-label mb-2">Online courses</p>
          <ul className="space-y-2">
            {onlineEnrolments.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
                <span className="text-sm font-medium">{e.course?.title ?? `Course ${e.courseId}`}</span>
                {e.status === "completed" ? (
                  <Chip value="completed" />
                ) : (
                  <Button size="sm" variant="outline" className="h-7" disabled={complete.isPending}
                    onClick={() => complete.mutate({ token, courseId: Number(e.courseId) })}>
                    Mark complete
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Complete each course in your learning account, then mark it complete here. Your DBS will be verified in person at your classroom induction.</p>
        </div>
      )}

      <div className="mt-4">
        <p className="uc-label mb-2">Classroom induction</p>
        {sessionEnrolments.length > 0 && (
          <p className="mb-2 text-sm text-green-800">
            You're registered — bring your original DBS certificate and photo ID for check-in.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sessions.map((s) => {
            const booked = sessionEnrolments.some((e) => Number(e.sessionId) === Number(s.id));
            return (
              <div key={s.id} className={`rounded-lg border p-3 text-sm ${booked ? "border-green-500 bg-green-50" : "bg-white"}`} style={{ borderColor: booked ? undefined : "var(--line)" }}>
                <p className="font-semibold">{fmtDate(s.startsAt)}</p>
                <p>{fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}</p>
                <p className="text-xs text-muted-foreground">{s.location ?? "Unique Care UK office"}</p>
                {booked ? (
                  <Chip value="registered" label="Registered" />
                ) : (
                  <Button size="sm" variant="outline" className="mt-2 h-7" disabled={register.isPending}
                    onClick={() => register.mutate({ token, sessionId: Number(s.id) })}>
                    Register
                  </Button>
                )}
              </div>
            );
          })}
          {sessions.length === 0 && <p className="text-sm text-muted-foreground">New induction dates are added regularly.</p>}
        </div>
      </div>
    </section>
  );
}
