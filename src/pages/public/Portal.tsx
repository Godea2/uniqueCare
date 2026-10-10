import { useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { Loading, ErrorState, Chip, fmtDate, fmtTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle2, Circle, Upload, PenLine, GraduationCap, CalendarDays,
  AlertTriangle, Camera, ChevronDown, Clock, FileText, Lightbulb, Loader2, Lock, PartyPopper, RefreshCw, ShieldCheck, UploadCloud,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { MAX_UPLOAD_BYTES, shrinkImage } from "@/lib/shrink-image";

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
  applied: 0, review: 0, shortlisted: 0, pre_interview_forms_sent: 1, pre_interview_forms_complete: 2,
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
      ) : slots.length > 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">Choose a time that suits you:</p>
      ) : null}
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
        {slots.length === 0 && !booking && (
          <p className="text-sm text-muted-foreground">
            Interview times aren't open yet. We'll email you as soon as they are, so there's nothing you need to do for now.
          </p>
        )}
      </div>
    </section>
  );
}

/* ── Compliance documents ── */
type PortalDoc = {
  id: number | bigint; requirementKey: string; status: string; fileName: string | null; rejectionReason: string | null;
  requirement?: { label: string; guidance?: string | null };
};

const DOC_STATES: Record<string, { label: string; icon: LucideIcon; pill: string; tile: string; bar: string }> = {
  requested: { label: "Needed", icon: FileText, pill: "bg-slate-100 text-slate-600", tile: "bg-slate-100 text-slate-500", bar: "bg-slate-200" },
  uploaded: { label: "We're checking it", icon: Clock, pill: "bg-sky-50 text-sky-700", tile: "bg-sky-50 text-sky-600", bar: "bg-sky-500" },
  verified: { label: "Verified", icon: ShieldCheck, pill: "bg-emerald-50 text-emerald-700", tile: "bg-emerald-50 text-emerald-600", bar: "bg-emerald-500" },
  rejected: { label: "Please upload again", icon: AlertTriangle, pill: "bg-rose-50 text-rose-700", tile: "bg-rose-50 text-rose-600", bar: "bg-rose-500" },
};
const docState = (status: string) => DOC_STATES[status] ?? DOC_STATES.requested;
const DOC_ORDER: Record<string, number> = { rejected: 0, requested: 1, uploaded: 2, verified: 3 };
const ACCEPT_DOCS = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx,application/pdf,image/*";

async function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function DocsSection({ token, docs }: { token: string; docs: PortalDoc[] }) {
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState<Record<string, string>>({});
  const upload = trpc.portal.uploadDoc.useMutation();

  const send = async (doc: PortalDoc, picked: File) => {
    const key = doc.requirementKey;
    setBusy((s) => ({ ...s, [key]: picked.name }));
    try {
      const file = await shrinkImage(picked);
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error("That file is too large to send. Please use a photo, or a PDF under 3 MB.");
        return;
      }
      const res = await upload.mutateAsync({ token, requirementKey: key, fileName: file.name, contentBase64: await toBase64(file) });
      await utils.portal.get.invalidate({ token });
      if (res.allSent) toast.success("That's everything. We've emailed you a confirmation and will start checking your documents.");
      else toast.success(`${doc.requirement?.label ?? "Document"} saved. ${res.outstanding} still to add.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setBusy((s) => { const next = { ...s }; delete next[key]; return next; });
    }
  };

  const count = (status: string) => docs.filter((d) => d.status === status).length;
  const verified = count("verified");
  const sent = verified + count("uploaded");
  const allDone = docs.length > 0 && verified === docs.length;
  const allSent = docs.length > 0 && sent === docs.length;
  const toRedo = count("rejected");
  const sorted = [...docs].sort((a, b) => (DOC_ORDER[a.status] ?? 1) - (DOC_ORDER[b.status] ?? 1));

  return (
    <section className="overflow-hidden rounded-3xl border bg-white shadow-sm" style={{ borderColor: "var(--card-line)" }} aria-label="Compliance documents">
      <header className="px-5 pb-4 pt-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[--brand-50] text-[--brand-600]">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-[--brand-900]">Your documents</h2>
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
              The law requires us to check these before we can offer you the job. A clear phone photo is fine.
              Each file is saved as soon as you add it, so you can do them in any order and come back later.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-800">
              {allDone ? "All documents verified" : `${sent} of ${docs.length} sent`}
            </span>
            {verified > 0 && !allDone && <span className="text-xs text-emerald-700">{verified} verified</span>}
          </div>
          <div className="mt-2 flex h-2 gap-1" aria-hidden>
            {[...docs].sort((a, b) => (DOC_ORDER[b.status] ?? 1) - (DOC_ORDER[a.status] ?? 1)).map((d) => (
              <span key={String(d.id)} className={`flex-1 rounded-full ${docState(d.status).bar}`} />
            ))}
          </div>
        </div>
      </header>

      {allDone ? (
        <div className="mx-5 mb-5 flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:mx-6">
          <PartyPopper className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          Thank you. Everything is checked, and your offer letter is on its way.
        </div>
      ) : allSent ? (
        <div className="mx-5 mb-5 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-950 sm:mx-6">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-sky-600" aria-hidden /> All documents sent. There's nothing else to do.
          </p>
          <ol className="mt-2 space-y-1 pl-6 text-xs leading-relaxed text-sky-900/80 list-decimal">
            <li>We check each document, usually within two working days.</li>
            <li>If one needs redoing, we'll email you and show it here.</li>
            <li>Once everything is checked, we'll email your offer letter to accept here.</li>
          </ol>
        </div>
      ) : toRedo > 0 ? (
        <div className="mx-5 mb-4 flex items-center gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-900 sm:mx-6" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden />
          {toRedo === 1 ? "One document needs" : `${toRedo} documents need`} uploading again. {toRedo === 1 ? "It's" : "They're"} at the top of the list.
        </div>
      ) : (
        <details className="group mx-5 mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm sm:mx-6">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-slate-700">
            <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden />
            Tips for a photo we can accept first time
            <ChevronDown className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="mt-2 space-y-1 pl-6 text-xs leading-relaxed text-muted-foreground list-disc">
            <li>Lay the document flat in good light, with all four corners in the picture.</li>
            <li>No glare, shadows or fingers over the text. Every word should be readable.</li>
            <li>For two-sided documents, upload a PDF or photo showing both sides.</li>
            <li>PDF, photo (JPG, PNG, HEIC) or Word. Large photos are made smaller for you.</li>
          </ul>
        </details>
      )}

      <ul className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
        {sorted.map((doc) => (
          <DocCard key={String(doc.id)} doc={doc} uploadingName={busy[doc.requirementKey]} onFile={(f) => void send(doc, f)} />
        ))}
      </ul>

      <p className="flex items-center gap-1.5 border-t bg-slate-50/70 px-5 py-3 text-[11px] text-muted-foreground sm:px-6" style={{ borderColor: "var(--card-line)" }}>
        <Lock className="h-3 w-3 shrink-0" aria-hidden />
        Your documents are stored securely and only seen by our recruitment team (CQC Regulation 19).
      </p>
    </section>
  );
}

function DocCard({ doc, uploadingName, onFile }: { doc: PortalDoc; uploadingName?: string; onFile: (file: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const state = docState(doc.status);
  const label = doc.requirement?.label ?? doc.requirementKey.replace(/_/g, " ");
  const needsFile = doc.status === "requested" || doc.status === "rejected";
  const canReplace = doc.status === "uploaded";
  const uploading = !!uploadingName;
  const pick = (files: FileList | null | undefined) => { const f = files?.[0]; if (f) onFile(f); };

  return (
    <li className={`rounded-2xl border p-4 transition-shadow ${doc.status === "rejected" ? "border-rose-200" : ""} ${needsFile ? "shadow-sm" : ""}`}
      style={doc.status === "rejected" ? undefined : { borderColor: "var(--card-line)" }}>
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${state.tile}`}>
          <state.icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-sm font-semibold text-slate-800">{label}</p>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${state.pill}`}>{state.label}</span>
          </div>
          {doc.requirement?.guidance && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{doc.requirement.guidance}</p>}
        </div>
      </div>

      {doc.status === "rejected" && (
        <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-800" role="alert">
          <span className="font-semibold">We couldn't accept the last file.</span>{" "}
          {doc.rejectionReason ? doc.rejectionReason : "Please upload a clearer copy."}
        </div>
      )}

      {doc.fileName && !needsFile && !uploading && (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2">
          <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{doc.fileName}</span>
          {canReplace && (
            <button type="button" onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-[--brand-700] hover:text-[--brand-900]">
              <RefreshCw className="h-3 w-3" aria-hidden /> Replace
            </button>
          )}
        </div>
      )}

      {uploading ? (
        <div className="mt-3 rounded-xl border border-dashed border-[--brand-500] bg-[--brand-50] px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-medium text-[--brand-900]">
            <Loader2 className="h-4 w-4 animate-spin text-[--brand-600]" aria-hidden />
            Uploading <span className="truncate font-normal text-slate-600">{uploadingName}</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
            <div className="h-full w-1/3 animate-[uc-indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-[--brand-600]" />
          </div>
        </div>
      ) : needsFile && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
          className={`mt-3 flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors sm:flex-row sm:text-left ${drag ? "border-[--brand-500] bg-[--brand-50]" : "border-slate-200 bg-slate-50/60"}`}
        >
          <UploadCloud className="hidden h-7 w-7 shrink-0 text-[--brand-600] sm:block" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800">{doc.status === "rejected" ? "Upload a new copy" : "Add this document"}</p>
            <p className="text-xs text-muted-foreground">Drop a file here, choose one, or take a photo</p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button type="button" size="sm" variant="outline" className="flex-1 sm:flex-none sm:hidden" onClick={() => cameraRef.current?.click()}>
              <Camera className="mr-1.5 h-4 w-4" /> Take a photo
            </Button>
            <Button type="button" size="sm" className="flex-1 sm:flex-none" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" /> Choose file
            </Button>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept={ACCEPT_DOCS} className="hidden" aria-label={`Upload ${label}`}
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label={`Take a photo of ${label}`}
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
    </li>
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
