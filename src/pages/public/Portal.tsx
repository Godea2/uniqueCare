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
  CheckCircle2, Circle, Upload, PenLine, GraduationCap, CalendarDays, CalendarClock,
  AlertTriangle, Camera, ChevronDown, Clock, FileText, Lightbulb, Loader2, Lock, MapPin, PartyPopper, RefreshCw, ShieldCheck, UploadCloud, Video,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { shrinkImage } from "@/lib/shrink-image";
import { MAX_DOCUMENT_BYTES, putFile } from "@/lib/upload-file";

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

        {["pre_interview_forms_complete", "interview_booked"].includes(stage) && (d.proposedSlots?.length ?? 0) > 0 && (
          <ProposedTimesSection token={token!} slots={d.proposedSlots} booking={d.booking} />
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

/* ── Interview times proposed for this candidate ── */
function ProposedTimesSection({ token, slots, booking }: {
  token: string;
  slots: {
    id: number | bigint; startsAt: string | Date; endsAt: string | Date;
    locationText: string | null; teamsMeetingUrl: string | null;
    booking: { slotId: number | bigint; status: string } | null;
  }[];
  booking: { slotId: number | bigint } | null;
}) {
  const utils = trpc.useUtils();
  const book = trpc.portal.bookSlot.useMutation({
    onSuccess: () => { utils.portal.get.invalidate({ token }); toast.success("Interview time confirmed"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <section className="uc-card border-l-4 border-l-[--brand-600] p-5">
      <h2 className="flex items-center gap-2 font-semibold text-[--brand-900]">
        <CalendarClock className="h-4 w-4 text-[--brand-600]" /> Your interview times
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        We&apos;ve offered you the times below — choose the one that suits you best.
        {booking && " Need to change? Pick a different time and your current booking is released automatically."}
      </p>
      <ul className="mt-3 space-y-2">
        {slots.map((s) => {
          const selected = s.booking?.status === "booked";
          return (
            <li key={s.id} className={`rounded-lg border p-3 text-sm ${selected ? "border-green-500 bg-green-50" : "bg-white"}`}
              style={selected ? undefined : { borderColor: "var(--line)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{fmtDate(s.startsAt)}</p>
                  <p>{fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}</p>
                  <p className="text-xs text-muted-foreground">{s.locationText ?? "Video interview"}</p>
                </div>
                {selected ? (
                  <Chip value="interview_booked" label="Selected" />
                ) : (
                  <Button size="sm" disabled={book.isPending}
                    onClick={() => book.mutate({ token, slotId: Number(s.id) })}>
                    Choose this time
                  </Button>
                )}
              </div>
              {selected && (
                <div className="mt-2 text-xs text-green-900">
                  <p>This is your chosen interview time — you&apos;re all set.</p>
                  {s.teamsMeetingUrl && (
                    <p className="mt-1 break-all">
                      Join link: <a className="text-[--brand-700] underline" href={s.teamsMeetingUrl} target="_blank" rel="noreferrer">{s.teamsMeetingUrl}</a>
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── Interview booking ── */
function BookingSection({ token, slots, booking, slot }: {
  token: string;
  slots: {
    id: number | bigint; startsAt: string | Date; endsAt: string | Date; locationText: string | null;
    capacity: number | null; bookedCount: number; state?: "available" | "selected" | "booked"; stateLabel?: string;
  }[];
  booking: { slotId: number | bigint } | null;
  slot: { id: number | bigint; startsAt: string | Date; endsAt: string | Date; locationText: string | null; teamsMeetingUrl: string | null } | null;
}) {
  const utils = trpc.useUtils();
  const confirmedId = booking ? Number(booking.slotId) : null;
  const [pickedId, setPickedId] = useState<number | null>(null);
  const book = trpc.portal.bookSlot.useMutation({
    onSuccess: () => {
      setPickedId(null);
      utils.portal.get.invalidate({ token });
      toast.success("Interview confirmed — see you then!");
    },
    onError: (e) => toast.error(e.message),
  });

  const picked = pickedId != null ? slots.find((s) => Number(s.id) === pickedId) : undefined;
  const rescheduling = confirmedId != null && pickedId != null && pickedId !== confirmedId;

  return (
    <section className="uc-card p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-[--brand-900]">
        <CalendarDays className="h-4 w-4 text-[--brand-600]" /> Interview
      </h2>
      {booking && slot ? (
        <div className="mt-3 rounded-xl border border-[--brand-400] bg-[--brand-50] px-3.5 py-3">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-[--brand-900]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[--brand-700]" aria-hidden />
            <span>
              You're booked for <strong>{fmtDate(slot.startsAt)} at {fmtTime(slot.startsAt)}</strong>
              {" — "}{slot.locationText ?? "video interview"}.
            </span>
          </p>
          {slot.teamsMeetingUrl && (
            <p className="mt-1.5 pl-6 text-xs text-muted-foreground break-all">
              Join link: <a className="text-[--brand-600] underline" href={slot.teamsMeetingUrl}>{slot.teamsMeetingUrl}</a>
            </p>
          )}
          <p className="mt-1.5 pl-6 text-xs text-muted-foreground">Need to change? Tap a different available slot, then confirm.</p>
        </div>
      ) : slots.length > 0 ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Tap a time to choose it, then confirm. Full slots show as booked.
        </p>
      ) : null}

      <div
        className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2"
        role="listbox"
        aria-label="Interview times"
      >
        {slots.map((s) => {
          const id = Number(s.id);
          const state = s.state ?? (confirmedId === id
            ? "selected"
            : s.bookedCount >= (s.capacity ?? 1) ? "booked" : "available");
          const isConfirmed = state === "selected" || confirmedId === id;
          const isPicked = !isConfirmed && pickedId === id;
          const isBookedOut = state === "booked" && !isConfirmed;
          const highlight = isConfirmed || isPicked;
          return (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={highlight}
              disabled={isBookedOut || book.isPending || isConfirmed}
              onClick={() => {
                if (isConfirmed || isBookedOut) return;
                setPickedId(id === pickedId ? null : id);
              }}
              className={`uc-focus relative rounded-xl border-2 p-3.5 text-left text-sm transition-colors ${
                isConfirmed
                  ? "border-[--brand-600] bg-[--brand-50] shadow-sm"
                  : isPicked
                    ? "border-[--brand-500] bg-[--brand-50] ring-2 ring-[--brand-100]"
                    : isBookedOut
                      ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-55"
                      : "border-slate-200 bg-white hover:border-[--brand-400] hover:bg-[--brand-50]/50"
              }`}
            >
              {highlight && (
                <CheckCircle2
                  className={`absolute right-2.5 top-2.5 h-5 w-5 ${isConfirmed ? "text-[--brand-700]" : "text-[--brand-600]"}`}
                  aria-hidden
                />
              )}
              <span className="block pr-7 font-semibold text-[--brand-900]">{fmtDate(s.startsAt)}</span>
              <span className="mt-0.5 block text-[--ink-600]">{fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{s.locationText ?? "Video interview"}</span>
              <span className="mt-2 inline-block">
                <Chip
                  value={isConfirmed ? "selected" : isPicked ? "your_pick" : isBookedOut ? "booked" : "available"}
                  label={isConfirmed ? "Your booking" : isPicked ? "Your pick" : isBookedOut ? "Booked" : "Available"}
                />
              </span>
            </button>
          );
        })}
      </div>

      {slots.length === 0 && !booking && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Interview times aren't open yet. We'll email you as soon as they are, so there's nothing you need to do for now.
        </p>
      )}

      {picked && (
        <div className="mt-4 space-y-3 rounded-xl border border-[--brand-400] bg-[--brand-50] p-4">
          <p className="text-sm leading-relaxed text-[--brand-900]">
            {rescheduling ? "Change to" : "You've chosen"}{" "}
            <strong>{fmtDate(picked.startsAt)} at {fmtTime(picked.startsAt)}</strong>
            {picked.locationText ? ` — ${picked.locationText}` : ""}.
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={book.isPending}
              onClick={() => setPickedId(null)}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={book.isPending}
              onClick={() => book.mutate({ token, slotId: Number(picked.id) })}
            >
              {book.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
              {rescheduling ? "Confirm new time" : "Confirm this time"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Compliance documents ── */
type PortalDoc = {
  id: number | bigint; requirementKey: string; status: string; fileName: string | null; rejectionReason: string | null;
  textValue?: string | null;
  requirement?: { label: string; guidance?: string | null; inputKind?: "file" | "text" };
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

type Uploading = { name: string; progress: number; phase: "sending" | "checking" };

function DocsSection({ token, docs }: { token: string; docs: PortalDoc[] }) {
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState<Record<string, Uploading>>({});
  const prepare = trpc.portal.docUploadUrl.useMutation();
  const confirm = trpc.portal.confirmDoc.useMutation();
  const submitText = trpc.portal.submitDocText.useMutation({
    onSuccess: async (res, vars) => {
      await utils.portal.get.invalidate({ token });
      const label = docs.find((d) => d.requirementKey === vars.requirementKey)?.requirement?.label ?? "Details";
      if (res.allSent) toast.success("That's everything. We've emailed you a confirmation and will start checking your documents.");
      else toast.success(`${label} saved. ${res.outstanding} still to add.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const send = async (doc: PortalDoc, picked: File) => {
    const key = doc.requirementKey;
    const track = (patch: Partial<Uploading>) =>
      setBusy((s) => ({ ...s, [key]: { ...(s[key] ?? { name: picked.name, progress: 0, phase: "sending" }), ...patch } }));
    track({ name: picked.name, progress: 0, phase: "sending" });
    try {
      const file = await shrinkImage(picked);
      if (file.size > MAX_DOCUMENT_BYTES) {
        toast.error("That file is over 10 MB. Please send a smaller PDF, or a photo of the document.");
        return;
      }
      const target = await prepare.mutateAsync({ token, requirementKey: key, fileName: file.name, size: file.size });
      await putFile(target.uploadUrl, file, (progress) => track({ progress }));
      track({ phase: "checking", progress: 1 });
      const res = await confirm.mutateAsync({ token, requirementKey: key, fileName: file.name, key: target.key });
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
            <li>PDF, photo (JPG, PNG, HEIC) or Word, up to 10 MB. Large photos are made smaller for you.</li>
          </ul>
        </details>
      )}

      <ul className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
        {sorted.map((doc) => (
          <DocCard
            key={String(doc.id)}
            doc={doc}
            uploading={busy[doc.requirementKey]}
            onFile={(f) => void send(doc, f)}
            onText={(text) => submitText.mutate({ token, requirementKey: doc.requirementKey, text })}
            textPending={submitText.isPending && submitText.variables?.requirementKey === doc.requirementKey}
          />
        ))}
      </ul>

      <p className="flex items-center gap-1.5 border-t bg-slate-50/70 px-5 py-3 text-[11px] text-muted-foreground sm:px-6" style={{ borderColor: "var(--card-line)" }}>
        <Lock className="h-3 w-3 shrink-0" aria-hidden />
        Your documents are stored securely and only seen by our recruitment team (CQC Regulation 19).
      </p>
    </section>
  );
}

function DocCard({ doc, uploading, onFile, onText, textPending }: {
  doc: PortalDoc; uploading?: Uploading; onFile: (file: File) => void;
  onText: (text: string) => void; textPending?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [text, setText] = useState(doc.textValue ?? "");
  const [editingText, setEditingText] = useState(false);
  const state = docState(doc.status);
  const label = doc.requirement?.label ?? doc.requirementKey.replace(/_/g, " ");
  const isText = doc.requirement?.inputKind === "text";
  const needsInput = doc.status === "requested" || doc.status === "rejected";
  const canReplace = doc.status === "uploaded";
  const showTextForm = isText && (needsInput || editingText);
  const pick = (files: FileList | null | undefined) => { const f = files?.[0]; if (f) onFile(f); };
  const rejectedHint = isText
    ? (doc.rejectionReason ? doc.rejectionReason : "Please check the details and submit again.")
    : (doc.rejectionReason ? doc.rejectionReason : "Please upload a clearer copy.");

  return (
    <li className={`rounded-2xl border p-4 transition-shadow ${doc.status === "rejected" ? "border-rose-200" : ""} ${needsInput ? "shadow-sm" : ""}`}
      style={doc.status === "rejected" ? undefined : { borderColor: "var(--card-line)" }}>
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${state.tile}`}>
          <state.icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-sm font-semibold text-slate-800">{label}</p>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${state.pill}`}>
              {isText && doc.status === "requested" ? "Needed" : isText && doc.status === "rejected" ? "Please update" : state.label}
            </span>
          </div>
          {doc.requirement?.guidance && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{doc.requirement.guidance}</p>}
        </div>
      </div>

      {doc.status === "rejected" && (
        <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-800" role="alert">
          <span className="font-semibold">We couldn't accept that.</span>{" "}{rejectedHint}
        </div>
      )}

      {isText ? (
        <>
          {(doc.textValue || doc.fileName) && !showTextForm && (
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
              <p className="whitespace-pre-wrap text-xs text-slate-700">{doc.textValue ?? doc.fileName}</p>
              {canReplace && (
                <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[--brand-700]"
                  onClick={() => { setText(doc.textValue ?? ""); setEditingText(true); }}>
                  <RefreshCw className="h-3 w-3" aria-hidden /> Edit
                </button>
              )}
            </div>
          )}
          {showTextForm && (
            <div className="mt-3 space-y-2">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={doc.requirementKey.startsWith("reference") || doc.requirementKey === "bank_details" ? 3 : 2}
                placeholder={doc.requirement?.guidance ?? "Enter details"}
                aria-label={label}
              />
              <div className="flex gap-2">
                <Button
                  type="button" size="sm" disabled={textPending || text.trim().length < 1}
                  onClick={() => onText(text.trim())}
                >
                  {textPending ? "Saving…" : doc.status === "uploaded" ? "Update" : "Submit"}
                </Button>
                {editingText && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditingText(false)}>Cancel</Button>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {doc.fileName && !needsInput && !uploading && (
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
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[--brand-600]" aria-hidden />
                {uploading.phase === "checking" ? "Saving" : "Uploading"}
                <span className="min-w-0 flex-1 truncate font-normal text-slate-600">{uploading.name}</span>
                {uploading.phase === "sending" && uploading.progress > 0 && (
                  <span className="tabular-nums text-xs text-[--brand-700]">{Math.round(uploading.progress * 100)}%</span>
                )}
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-label={`Uploading ${label}`}
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploading.phase === "sending" ? Math.round(uploading.progress * 100) : undefined}>
                {uploading.phase === "sending" && uploading.progress > 0 ? (
                  <div className="h-full rounded-full bg-[--brand-600] transition-[width] duration-200" style={{ width: `${Math.max(4, uploading.progress * 100)}%` }} />
                ) : (
                  <div className="h-full w-1/3 animate-[uc-indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-[--brand-600]" />
                )}
              </div>
            </div>
          ) : needsInput && (
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
        </>
      )}
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
  enrolments: {
    id: number | bigint; courseId: number | bigint; sessionId: number | bigint | null; status: string;
    course?: { id: number | bigint; title: string; delivery?: string; type?: string; courseUrl?: string | null; durationHours?: string | null } | null;
  }[];
  sessions: {
    id: number | bigint; courseId: number | bigint; startsAt: string | Date; endsAt: string | Date; location: string | null;
    capacity: number | null; courseTitle: string; delivery: string; meetingUrl: string | null; notes: string | null; placesLeft: number;
  }[];
}) {
  const utils = trpc.useUtils();
  const [pendingSessionId, setPendingSessionId] = useState<number | null>(null);
  const register = trpc.portal.registerTraining.useMutation({
    onSuccess: () => {
      setPendingSessionId(null);
      utils.portal.get.invalidate({ token });
      toast.success("Registered for induction");
    },
    onError: (e) => {
      setPendingSessionId(null);
      toast.error(e.message);
    },
  });
  const complete = trpc.portal.markCourseComplete.useMutation({
    onSuccess: () => { utils.portal.get.invalidate({ token }); toast.success("Course marked complete"); },
    onError: (e) => toast.error(e.message),
  });

  const onlineEnrolments = enrolments.filter((e) => !e.sessionId);
  const sessionEnrolments = enrolments.filter((e) => e.sessionId);
  const attended = sessionEnrolments.some((e) => e.status === "completed");
  const upcomingBooking = sessionEnrolments.find((e) => e.status === "registered" && sessions.some((s) => Number(s.id) === Number(e.sessionId)));
  const missed = !upcomingBooking && sessionEnrolments.some((e) => e.status === "no_show");
  const bookedSession = upcomingBooking
    ? sessions.find((s) => Number(s.id) === Number(upcomingBooking.sessionId))
    : undefined;

  return (
    <section className="uc-card p-5">
      <h2 className="flex items-center gap-2 font-semibold text-[--brand-900]"><GraduationCap className="h-4 w-4 text-[--brand-600]" /> Your training</h2>

      {onlineEnrolments.length > 0 && (
        <div className="mt-3">
          <p className="uc-label mb-2">Online courses</p>
          <ul className="space-y-2">
            {onlineEnrolments.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{e.course?.title ?? `Course ${e.courseId}`}</span>
                  {e.course?.durationHours && (
                    <span className="ml-1.5 text-xs text-muted-foreground">· {e.course.durationHours}h</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {e.course?.courseUrl && e.status !== "completed" && (
                    <Button size="sm" className="h-7" asChild>
                      <a href={e.course.courseUrl} target="_blank" rel="noreferrer">Open course</a>
                    </Button>
                  )}
                  {e.status === "completed" ? (
                    <Chip value="completed" />
                  ) : (
                    <Button size="sm" variant="outline" className="h-7" disabled={complete.isPending}
                      onClick={() => complete.mutate({ token, courseId: Number(e.courseId) })}>
                      Mark complete
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Open the course link to complete the training, then mark it complete here. Your DBS is verified in person at classroom induction.</p>
        </div>
      )}

      <div className="mt-4">
        <p className="uc-label mb-2">Classroom induction</p>
        {attended ? (
          <p className="mb-2 flex items-center gap-2 text-sm text-green-800"><CheckCircle2 className="h-4 w-4" aria-hidden /> Induction attended. Thank you.</p>
        ) : bookedSession ? (
          <div className="mb-3 rounded-lg border border-[--brand-400] bg-[--brand-50] px-3 py-2.5 text-sm text-[--brand-900]">
            <p className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[--brand-700]" aria-hidden />
              <span>
                You're booked for <strong>{new Date(bookedSession.startsAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</strong>
                {" at "}{fmtTime(bookedSession.startsAt)}. Bring your original DBS certificate and photo ID.
              </span>
            </p>
          </div>
        ) : missed ? (
          <p className="mb-2 text-sm text-amber-800">We missed you at your last induction. Please book another date below.</p>
        ) : (
          <p className="mb-2 text-sm text-muted-foreground">Choose a date below. Your place is held as soon as you book.</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sessions.map((s) => {
            const id = Number(s.id);
            const booked = sessionEnrolments.some((e) => Number(e.sessionId) === id);
            const full = !booked && s.placesLeft <= 0;
            const online = s.delivery === "online";
            const pending = pendingSessionId === id && register.isPending;
            return (
              <div
                key={s.id}
                className={`relative rounded-xl border-2 p-3 text-sm transition-colors ${
                  booked
                    ? "border-[--brand-600] bg-[--brand-50] shadow-sm"
                    : pending
                      ? "border-[--brand-400] bg-[--brand-100] ring-2 ring-[--brand-100]"
                      : "border-slate-200 bg-white"
                }`}
              >
                {booked && (
                  <CheckCircle2 className="absolute right-2.5 top-2.5 h-5 w-5 text-[--brand-700]" aria-hidden />
                )}
                <p className="pr-7 text-xs font-medium text-[--brand-700]">{s.courseTitle}</p>
                <p className="mt-0.5 font-semibold">{new Date(s.startsAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
                <p className="flex items-center gap-1 text-slate-700"><Clock className="h-3.5 w-3.5" aria-hidden /> {fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  {online ? <Video className="h-3 w-3" aria-hidden /> : <MapPin className="h-3 w-3" aria-hidden />}
                  {online ? "Live online" : s.location ?? "Unique Care UK office"}
                </p>
                {booked && s.meetingUrl && (
                  <a href={s.meetingUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[--brand-700] hover:underline">
                    <Video className="h-3 w-3" aria-hidden /> Join the session
                  </a>
                )}
                {s.notes && <p className="mt-1.5 text-xs text-slate-600">{s.notes}</p>}
                <div className="mt-2 flex items-center justify-between gap-2">
                  {booked ? (
                    <Chip value="selected" label="Your booking" />
                  ) : (
                    <Button
                      size="sm"
                      variant={full ? "ghost" : "default"}
                      className="h-8"
                      disabled={full || register.isPending || !!upcomingBooking}
                      onClick={() => {
                        setPendingSessionId(id);
                        register.mutate({ token, sessionId: id });
                      }}
                    >
                      {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                      {full ? "Full" : pending ? "Booking…" : "Book this date"}
                    </Button>
                  )}
                  {!booked && !full && <span className="text-[11px] text-muted-foreground">{s.placesLeft} place{s.placesLeft === 1 ? "" : "s"} left</span>}
                </div>
              </div>
            );
          })}
          {sessions.length === 0 && !attended && (
            <p className="text-sm text-muted-foreground">There are no dates open yet. We'll email you as soon as one is added.</p>
          )}
        </div>
      </div>
    </section>
  );
}
