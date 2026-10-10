import { useState } from "react";
import { useParams, Link } from "react-router";
import { trpc } from "@/providers/trpc";
import type { RouterOutputs } from "@/lib/router-types";
import { PageHeader, Chip, Loading, ErrorState, fmtDate, fmtDateTime, fmtTime, AiError, AvatarDot } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  CheckCircle2, XCircle, FileCheck2, GraduationCap, Copy, Check, ArrowLeft, FileText,
  BadgeCheck, ThumbsUp, ThumbsDown, Ban, MessageSquarePlus, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  answerText, conditionMet, trippedKnockouts, DISPLAY_TYPES,
  type FormAnswers, type FormField, type FormSchemaDoc,
} from "@contracts/form-schema";

const CRITERIA = ["Values & motivation", "Person-centred care", "Safeguarding awareness", "Communication", "Reliability", "Scenario judgement"];

const CRITERIA_HINTS: Record<string, string> = {
  "Values & motivation": "Genuine reasons for wanting care work, focused on the people they'll support.",
  "Person-centred care": "Puts the person's choices, dignity and independence first.",
  "Safeguarding awareness": "Spots signs of harm or neglect and knows to report them straight away.",
  "Communication": "Clear and kind, listens well, and adapts to the person in front of them.",
  "Reliability": "Turns up, on time, and follows through. Look for examples from past work.",
  "Scenario judgement": "Makes safe, sensible choices in the scenario questions.",
};

const SCALE: Record<number, string> = { 1: "Poor", 2: "Below standard", 3: "Meets standard", 4: "Strong", 5: "Exceptional" };

const STAGE_LABELS: Record<string, string> = {
  applied: "Applied", review: "Human review", shortlisted: "Shortlisted",
  pre_interview_forms_sent: "Forms sent", pre_interview_forms_complete: "Forms complete",
  interview_booked: "Interview booked", interviewed: "Interviewed",
  approved: "Approved", rejected: "Rejected",
  compliance_docs_requested: "Docs requested", compliance_docs_complete: "Docs complete",
  offer_sent: "Offer sent", offer_accepted: "Offer accepted",
  training_booked: "Training booked", online_training_in_progress: "Online training",
  dbs_verified: "DBS verified", training_complete: "Training complete",
  hired: "Hired", screened_out: "Screened out", withdrawn: "Withdrawn",
};

export default function CandidateDetail() {
  const { id } = useParams<{ id: string }>();
  const utils = trpc.useUtils();
  const q = trpc.hr.applicationDetail.useQuery({ id: Number(id) });
  const inv = () => utils.hr.applicationDetail.invalidate({ id: Number(id) });

  const screen = trpc.hr.runScreening.useMutation({
    onSuccess: (r) => {
      inv(); utils.hr.pipeline.invalidate();
      const next = r.outcome === "shortlisted" ? " Shortlisted and invited." : r.outcome === "review" ? " Moved to Review." : "";
      toast.success(`Screening complete — score ${r.score}.${next}`);
    },
  });
  const move = trpc.hr.moveStage.useMutation({
    onSuccess: () => { inv(); utils.hr.pipeline.invalidate(); toast.success("Stage updated"); },
    onError: (e) => toast.error(e.message),
  });
  const requestDocs = trpc.hr2.requestComplianceDocs.useMutation({
    onSuccess: () => { inv(); toast.success("Compliance documents requested"); },
    onError: (e) => toast.error(e.message),
  });
  const completeTraining = trpc.hr2.completeTraining.useMutation({
    onSuccess: () => { inv(); toast.success("Training complete — converted to care worker"); },
    onError: (e) => toast.error(e.message),
  });

  const [rejectOpen, setRejectOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const app = d.application;
  const cand = d.candidate;
  const stage = app.stage;
  const history = (app.stageHistory as { from: string | null; to: string; actor: string; at: string; reason?: string }[]) ?? [];
  const jobReqs = (Array.isArray(d.job?.requirements) ? d.job.requirements : []) as { key: string; label: string; required?: boolean }[];
  const breakdown = ((app.aiBreakdown as { key?: string; requirement_key?: string; label?: string; required?: boolean; met: string; evidence?: string; evidence_quote?: string; source?: "cv" | "form" | "none" }[] | null) ?? null)
    ?.map((b) => {
      const key = b.key ?? b.requirement_key ?? "—";
      const req = jobReqs.find((r) => r.key === key);
      return {
        key, label: b.label ?? req?.label ?? key.replace(/_/g, " "), required: b.required ?? req?.required ?? false,
        met: b.met, evidence: b.evidence ?? b.evidence_quote ?? "", source: b.source,
      };
    }) ?? null;
  const flags = (app.aiFlags as string[] | null) ?? [];
  const latestCv = (d.cvVersions ?? [])[0] ?? null;
  const cvKey = latestCv?.fileKey ?? app.cvFileKey ?? null;

  return (
    <div className="space-y-5">
      <Link to="/recruitment/pipeline" className="inline-flex items-center gap-1 text-sm text-[--brand-600] hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Pipeline
      </Link>
      <PageHeader
        title={`${cand?.firstName} ${cand?.lastName}`}
        subtitle={`${d.job?.title ?? ""} · applied ${fmtDate(app.createdAt)}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Chip value={stage} label={STAGE_LABELS[stage] ?? stage} />
            {(stage === "applied" || stage === "review") && (
              <>
                {app.aiScore === null && (
                  <Button size="sm" variant="outline" disabled={screen.isPending} onClick={() => screen.mutate({ applicationId: app.id })}>
                    {screen.isPending ? "Screening…" : "Run AI screening"}
                  </Button>
                )}
                <Button size="sm" onClick={() => move.mutate({ applicationId: app.id, to: "shortlisted", override: stage === "review" ? false : false })}>
                  Shortlist
                </Button>
              </>
            )}
            {stage === "interviewed" && (
              <Button size="sm" onClick={() => move.mutate({ applicationId: app.id, to: "approved" })}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
              </Button>
            )}
            {stage === "approved" && (
              <Button size="sm" disabled={requestDocs.isPending} onClick={() => requestDocs.mutate({ applicationId: app.id })}>
                <FileCheck2 className="h-3.5 w-3.5 mr-1" /> Request compliance docs
              </Button>
            )}
            {(stage === "dbs_verified" || stage === "training_complete") && (
              <Button size="sm" disabled={completeTraining.isPending} onClick={() => completeTraining.mutate({ applicationId: app.id })}>
                <GraduationCap className="h-3.5 w-3.5 mr-1" /> Complete training & hire
              </Button>
            )}
            {!["hired", "rejected", "withdrawn", "screened_out"].includes(stage) && (
              <>
                <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)}>Reject</Button>
                <Button size="sm" variant="outline" onClick={() => setOverrideOpen(true)}>Move stage…</Button>
              </>
            )}
          </div>
        }
      />

      {screen.error && <AiError error={screen.error} onRetry={() => screen.mutate({ applicationId: app.id })} />}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* LEFT — 2 cols */}
        <div className="xl:col-span-2 space-y-4">
          {/* Candidate card */}
          <section className="uc-card p-5" aria-label="Candidate details">
            <h2 className="uc-label mb-3">Candidate</h2>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
              <div className="min-w-0"><dt className="text-muted-foreground text-xs">Email</dt><dd className="break-all">{cand?.email}</dd></div>
              <div className="min-w-0"><dt className="text-muted-foreground text-xs">Phone</dt><dd>{cand?.phone ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground text-xs">Postcode</dt><dd>{cand?.postcode ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground text-xs">Driving licence</dt><dd>{cand?.hasDrivingLicence ? "Yes" : "No"}</dd></div>
              <div><dt className="text-muted-foreground text-xs">Vehicle</dt><dd>{cand?.hasVehicle ? "Yes" : "No"}</dd></div>
              <div><dt className="text-muted-foreground text-xs">Source</dt><dd>{cand?.sourceChannel ?? "website"}</dd></div>
            </dl>
            {app.portalToken && (
              <PortalLink token={app.portalToken} />
            )}
          </section>

          {/* AI screening */}
          <section className="uc-card p-5" aria-label="AI screening">
            <div className="flex items-center justify-between mb-3">
              <h2 className="uc-label">AI screening</h2>
              <div className="flex items-center gap-2">
                {app.aiScore !== null && (
                  <>
                    <Button size="sm" variant="outline" disabled={screen.isPending}
                      onClick={() => screen.mutate({ applicationId: app.id })}>
                      {screen.isPending ? "Re-scoring…" : "Re-score"}
                    </Button>
                    <span className={`text-lg font-bold ${(app.aiScore ?? 0) >= 85 ? "text-green-700" : (app.aiScore ?? 0) >= 60 ? "text-amber-700" : "text-red-700"}`}>
                      {app.aiScore}/100
                    </span>
                  </>
                )}
              </div>
            </div>
            {app.cvUnreadable && app.aiScore === null && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Little text could be copied out of this CV. Screen still sends the PDF to Gemini, which can read a scanned file.
              </div>
            )}
            {app.aiScore === null ? (
              <p className="text-sm text-muted-foreground">Not screened yet. The score is computed in code from weighted requirements — the AI only proposes evidence per criterion. It never rejects anyone.</p>
            ) : (
              <>
                {app.aiSummary && <p className="text-sm mb-3">{app.aiSummary}</p>}
                {breakdown && (
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b" style={{ borderColor: "var(--line)" }}>
                        <th className="py-1.5 pr-2 font-medium">Requirement</th>
                        <th className="py-1.5 pr-2 font-medium">Met</th>
                        <th className="py-1.5 pr-2 font-medium">Evidence</th>
                        <th className="py-1.5 font-medium">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.map((b) => (
                        <tr key={b.key} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                          <td className="py-1.5 pr-2">
                            {b.label}
                            {b.required && <span className="ml-1 text-[10px] font-semibold text-red-700">MUST</span>}
                          </td>
                          <td className="py-1.5 pr-2"><Chip value={b.met === "yes" ? "verified" : b.met === "partial" ? "pending" : b.met === "unknown" ? "requested" : "rejected"} label={b.met} /></td>
                          <td className="py-1.5 pr-2 text-xs">
                            {b.evidence ? <mark className="bg-yellow-100 rounded px-1">{b.evidence}</mark> : <span className="text-muted-foreground">No evidence found</span>}
                          </td>
                          <td className="py-1.5 text-xs text-muted-foreground">{b.source === "cv" ? "CV" : b.source === "form" ? "Form" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
                {flags.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="uc-label text-amber-800 mb-1">Flags for human review</p>
                    <ul className="list-disc pl-4 text-sm text-amber-900">{flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
                  </div>
                )}
              </>
            )}
          </section>

          <ApplicationAnswers
            schema={d.formSchema}
            answers={(app.answers ?? {}) as FormAnswers}
            requirements={jobReqs}
          />

          {/* CV viewer — side by side with the screening evidence above */}
          {cvKey && (
            <CvViewer applicationId={app.id} fileKey={cvKey} fileName={latestCv?.fileName ?? app.cvFileName ?? "CV"} versions={d.cvVersions ?? []} />
          )}

          {/* Interview */}
          <section className="uc-card p-5" aria-label="Interview">
            <h2 className="uc-label mb-3">Interview</h2>
            {d.slot && d.booking ? (
              <p className="text-sm mb-3">
                {fmtDate(d.slot.startsAt)} {fmtTime(d.slot.startsAt)}–{fmtTime(d.slot.endsAt)} · {d.slot.locationText ?? "Interview"}
                {" "}<Chip value={d.booking.status} />
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mb-3">
                {stage === "pre_interview_forms_complete"
                  ? "Forms complete — the candidate can now book a slot through their portal link."
                  : "No interview booked yet."}
              </p>
            )}
            <Scorecards d={d} />
            {["interview_booked", "interviewed"].includes(stage) && !d.myScorecard && ["super_admin", "admin", "interview_panel", "team_leader"].includes(d.myRole) && (
              <ScorecardForm applicationId={app.id} onDone={inv} />
            )}
          </section>

          {/* Compliance */}
          <section className="uc-card p-5" aria-label="Compliance documents">
            <h2 className="uc-label mb-3">Compliance documents</h2>
            {d.docs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not requested yet — approve the candidate first.</p>
            ) : (
              <DocChecklist docs={d.docs} onDone={inv} />
            )}
            {d.references.length > 0 && (
              <div className="mt-4">
                <p className="uc-label mb-2">References</p>
                <ul className="space-y-1.5 text-sm">
                  {d.references.map((r) => (
                    <li key={r.id} className="flex items-center justify-between">
                      <span>{r.refereeName} <span className="text-muted-foreground">({r.relationship}{r.isMostRecentEmployer ? ", most recent employer" : ""})</span></span>
                      <Chip value={r.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Offer + training */}
          {(d.offer || d.enrolments.length > 0) && (
            <section className="uc-card p-5" aria-label="Offer and training">
              {d.offer && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="uc-label">Offer letter</h2>
                    <Chip value={d.offer.acceptedAt ? "signed" : "offer_sent"} label={d.offer.acceptedAt ? `Accepted ${fmtDate(d.offer.acceptedAt)}` : "Awaiting signature"} />
                  </div>
                  <pre className="whitespace-pre-wrap rounded-lg bg-[--brand-50] p-3 text-xs leading-relaxed border" style={{ borderColor: "var(--line)" }}>
                    {d.offer.content}
                  </pre>
                  {d.offer.signatureName && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Signed by {d.offer.signatureName} · {fmtDateTime(d.offer.acceptedAt)} · IP recorded
                    </p>
                  )}
                </div>
              )}
              {d.enrolments.length > 0 && (
                <div>
                  <p className="uc-label mb-2">Training enrolments</p>
                  <ul className="space-y-1.5 text-sm">
                    {d.enrolments.map((e) => (
                      <li key={e.id} className="flex items-center justify-between">
                        <span>{e.course?.title ?? `Course #${e.courseId}`}</span>
                        <Chip value={e.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>

        {/* RIGHT — timeline */}
        <div className="space-y-4">
          <section className="uc-card p-5" aria-label="Stage history">
            <h2 className="uc-label mb-3">Stage history</h2>
            <ol className="relative border-l pl-4 space-y-3" style={{ borderColor: "var(--line)" }}>
              {[...history].reverse().map((h, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-[--brand-500]" aria-hidden />
                  <p className="text-sm font-medium">{STAGE_LABELS[h.to] ?? h.to.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">{h.actor} · {fmtDateTime(h.at)}</p>
                  {h.reason && <p className="text-xs text-muted-foreground italic">“{h.reason}”</p>}
                </li>
              ))}
            </ol>
            {app.rejectionReason && (
              <p className="mt-3 rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-800">
                Rejection reason: {app.rejectionReason}
              </p>
            )}
          </section>

          {d.form && (
            <section className="uc-card p-5" aria-label="Pre-interview form">
              <h2 className="uc-label mb-3">Pre-interview form (Reg 19)</h2>
              <FormSummary data={d.form.data as Record<string, unknown>} submitted={!!d.form.submittedAt} />
            </section>
          )}
        </div>
      </div>

      <RejectDialog open={rejectOpen} onClose={() => setRejectOpen(false)} applicationId={app.id}
        onConfirm={(reason) => move.mutate({ applicationId: app.id, to: stage === "applied" || stage === "review" ? "screened_out" : "rejected", reason })} />
      <OverrideDialog open={overrideOpen} onClose={() => setOverrideOpen(false)} current={stage}
        onConfirm={(to, reason) => move.mutate({ applicationId: app.id, to: to as never, reason, override: true })} />
    </div>
  );
}

/** Everything the applicant filled in, laid out in the same steps as the form they saw. */
function ApplicationAnswers({ schema, answers, requirements }: {
  schema: FormSchemaDoc | null;
  answers: FormAnswers;
  requirements: { key: string; label: string; required?: boolean }[];
}) {
  const knockoutIds = new Set(schema ? trippedKnockouts(schema, answers).map((k) => k.fieldId) : []);
  const display = (field: FormField, value: unknown) => {
    if (field.type === "consent") return value === true || value === "true" || value === "yes" ? "Agreed" : "Not agreed";
    return answerText(field, value);
  };

  return (
    <section className="uc-card p-5" aria-label="Application answers">
      <h2 className="uc-label mb-3">Application answers</h2>
      {schema ? (
        <div className="space-y-5">
          {schema.sections.map((section) => {
            const rows = section.fields.filter((f) => !DISPLAY_TYPES.includes(f.type) && conditionMet(f, answers));
            if (rows.length === 0) return null;
            return (
              <div key={section.id}>
                <h3 className="text-sm font-semibold text-[--brand-900] mb-2">{section.title}</h3>
                <dl className="divide-y rounded-xl border" style={{ borderColor: "var(--line)" }}>
                  {rows.map((f) => {
                    const text = display(f, answers[f.id]);
                    const req = f.requirementKey ? requirements.find((r) => r.key === f.requirementKey) : undefined;
                    const knockout = knockoutIds.has(f.id);
                    return (
                      <div key={f.id} className={`grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4 ${knockout ? "bg-red-50" : ""}`}
                        style={{ borderColor: "var(--line)" }}>
                        <dt className="text-xs text-muted-foreground">
                          {f.label}
                          {req && (
                            <span className="mt-1 block text-[10px] font-medium text-[--brand-700]">
                              Screening: {req.label}{req.required ? " (must have)" : ""}
                            </span>
                          )}
                        </dt>
                        <dd className={`text-sm whitespace-pre-wrap break-words ${knockout ? "font-medium text-red-800" : ""}`}>
                          {text || <span className="text-muted-foreground">Not answered</span>}
                          {knockout && <span className="mt-1 block text-xs font-normal">{f.knockoutRule?.message ?? "Knockout answer — needs human review"}</span>}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            );
          })}
        </div>
      ) : Object.keys(answers).length > 0 ? (
        <dl className="divide-y rounded-xl border" style={{ borderColor: "var(--line)" }}>
          {Object.entries(answers).map(([k, v]) => (
            <div key={k} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4" style={{ borderColor: "var(--line)" }}>
              <dt className="text-xs text-muted-foreground">{k.replace(/_/g, " ")}</dt>
              <dd className="text-sm whitespace-pre-wrap break-words">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">No form answers were saved with this application.</p>
      )}
    </section>
  );
}

function PortalLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/portal/${token}`;
  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg border p-2 text-xs" style={{ borderColor: "var(--line)" }}>
      <span className="truncate text-muted-foreground flex-1">{url}</span>
      <Button size="sm" variant="ghost" className="h-6 px-2"
        onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}

function FormSummary({ data, submitted }: { data: Record<string, unknown>; submitted: boolean }) {
  if (!submitted) return <p className="text-sm text-muted-foreground">Not yet submitted by the candidate.</p>;
  const entries = Object.entries(data ?? {}).filter(([, v]) => v !== undefined && v !== "" && v !== null);
  return (
    <dl className="space-y-1.5 text-sm max-h-64 overflow-y-auto pr-1">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted-foreground">{k.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}</dt>
          <dd className="text-[13px]">{typeof v === "boolean" ? (v ? "Yes" : "No") : Array.isArray(v) ? `${v.length} item(s)` : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

type Detail = RouterOutputs["hr"]["applicationDetail"];

function Scorecards({ d }: { d: NonNullable<Detail> }) {
  const hidden = d.myRole === "interview_panel" && !d.myScorecard;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="uc-label">Panel scorecards</p>
        <span className="text-xs text-muted-foreground">{d.allScorecardsCount} submitted</span>
      </div>
      {hidden ? (
        <p className="text-sm text-muted-foreground rounded-lg bg-[--brand-50] border p-3" style={{ borderColor: "var(--line)" }}>
          Other panel members' scorecards are hidden until you submit your own — independent scoring.
        </p>
      ) : d.scorecards.length === 0 ? (
        <p className="text-sm text-muted-foreground">No scorecards yet.</p>
      ) : (
        d.scorecards.map((sc) => {
          const member = d.panel.find((p) => Number(p.id) === sc.panelMemberId);
          const scores = (sc.scores as { criterion: string; score: number; comment?: string }[]) ?? [];
          const recInfo = RECOMMENDATIONS.find((r) => r.value === sc.recommendation);
          const recStyle = recInfo ? REC_STYLES[recInfo.tone] : null;
          const max = Math.max(scores.length * 5, 1);
          return (
            <div key={sc.id} className="rounded-2xl border bg-white p-4" style={{ borderColor: "var(--card-line)" }}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800">
                  <AvatarDot name={member?.fullName ?? "?"} color={member?.avatarColor} />
                  <span className="truncate">{member?.fullName ?? "Panel member"}</span>
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  {recInfo && (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${recStyle?.on ?? ""}`}>
                      <recInfo.icon className={`h-3.5 w-3.5 ${recStyle?.icon ?? ""}`} aria-hidden /> {recInfo.label}
                    </span>
                  )}
                  <span className="text-lg font-bold tabular-nums text-[--brand-900]">
                    {sc.total}<span className="text-xs font-medium text-muted-foreground">/{max}</span>
                  </span>
                </div>
              </div>
              <ul className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {scores.map((s) => (
                  <li key={s.criterion}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">{s.criterion}</span>
                      <span className="font-semibold tabular-nums text-slate-800">{s.score}/5</span>
                    </div>
                    <div className="mt-1 flex gap-0.5" aria-hidden>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= s.score ? scoreTone(s.score).split(" ").find((c) => c.startsWith("bg-")) : "bg-slate-100"}`} />
                      ))}
                    </div>
                    {s.comment && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">“{s.comment}”</p>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
}

type Recommendation = "strong_yes" | "yes" | "no" | "strong_no";

const RECOMMENDATIONS: { value: Recommendation; label: string; hint: string; icon: LucideIcon; tone: string }[] = [
  { value: "strong_yes", label: "Strong yes", hint: "Hire. Stood out.", icon: BadgeCheck, tone: "emerald" },
  { value: "yes", label: "Yes", hint: "Hire. Meets the bar.", icon: ThumbsUp, tone: "green" },
  { value: "no", label: "No", hint: "Not this time.", icon: ThumbsDown, tone: "amber" },
  { value: "strong_no", label: "Strong no", hint: "Concerns to note.", icon: Ban, tone: "rose" },
];

const REC_STYLES: Record<string, { on: string; icon: string }> = {
  emerald: { on: "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500", icon: "text-emerald-600" },
  green: { on: "border-green-500 bg-green-50 ring-1 ring-green-500", icon: "text-green-600" },
  amber: { on: "border-amber-500 bg-amber-50 ring-1 ring-amber-500", icon: "text-amber-600" },
  rose: { on: "border-rose-500 bg-rose-50 ring-1 ring-rose-500", icon: "text-rose-600" },
};

/** Selected-score colour: weak answers read red, middling amber, strong green. */
function scoreTone(n: number) {
  if (n <= 2) return "border-rose-500 bg-rose-500 text-white";
  if (n === 3) return "border-amber-500 bg-amber-500 text-white";
  return "border-emerald-600 bg-emerald-600 text-white";
}

function ScorecardForm({ applicationId, onDone }: { applicationId: number; onDone: () => void }) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [notesOpen, setNotesOpen] = useState<Record<string, boolean>>({});
  const [rec, setRec] = useState<Recommendation | null>(null);
  const submit = trpc.hr2.submitScorecard.useMutation({
    onSuccess: () => { toast.success("Scorecard submitted"); onDone(); },
    onError: (e) => toast.error(e.message),
  });
  const scored = CRITERIA.filter((c) => scores[c]).length;
  const total = CRITERIA.reduce((a, c) => a + (scores[c] ?? 0), 0);
  const max = CRITERIA.length * 5;
  const ready = scored === CRITERIA.length && rec !== null;

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border bg-white" style={{ borderColor: "var(--card-line)" }} aria-label="Your scorecard">
      <header className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "var(--card-line)" }}>
        <div>
          <h3 className="text-base font-semibold text-[--brand-900]">Your scorecard</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Score each area from 1 to 5 based on what you heard. Other panel members can't see your scores until they submit their own.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tabular-nums text-[--brand-900]">{total}<span className="text-sm font-medium text-muted-foreground">/{max}</span></p>
          <p className="text-[11px] text-muted-foreground">{scored} of {CRITERIA.length} scored</p>
        </div>
      </header>
      <div className="h-1 bg-slate-100" aria-hidden>
        <div className="h-full bg-[--brand-600] transition-all" style={{ width: `${(scored / CRITERIA.length) * 100}%` }} />
      </div>

      <ol className="divide-y" style={{ borderColor: "var(--card-line)" }}>
        {CRITERIA.map((c, i) => {
          const value = scores[c];
          const noteShown = notesOpen[c] || !!comments[c];
          return (
            <li key={c} className="px-5 py-4" style={{ borderColor: "var(--card-line)" }}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 gap-3">
                  <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${value ? "bg-[--brand-600] text-white" : "bg-slate-100 text-slate-500"}`}>
                    {value ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{c}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{CRITERIA_HINTS[c]}</p>
                  </div>
                </div>
                <div className="shrink-0 md:w-[232px]">
                  <div className="flex gap-1.5" role="radiogroup" aria-label={`${c} score`}>
                    {[1, 2, 3, 4, 5].map((n) => {
                      const on = value === n;
                      return (
                        <button
                          key={n} type="button" role="radio" aria-checked={on}
                          aria-label={`${n} — ${SCALE[n]}`} title={SCALE[n]}
                          onClick={() => setScores((s) => ({ ...s, [c]: n }))}
                          className={`uc-focus h-10 flex-1 rounded-xl border text-sm font-semibold tabular-nums transition-all ${on ? `${scoreTone(n)} shadow-sm` : "bg-white text-slate-600 hover:-translate-y-px hover:border-[--brand-600] hover:bg-[--brand-50]"}`}
                          style={on ? undefined : { borderColor: "var(--card-line)" }}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  <p className={`mt-1.5 h-4 text-right text-[11px] font-medium ${value ? "text-slate-600" : "text-muted-foreground"}`}>
                    {value ? SCALE[value] : "1 poor · 5 exceptional"}
                  </p>
                </div>
              </div>
              <div className="mt-2 pl-9">
                {noteShown ? (
                  <Textarea
                    rows={2} autoFocus={notesOpen[c] && !comments[c]} maxLength={1000}
                    placeholder={`What did they say or do that shows this? (optional)`}
                    className="min-h-[60px] resize-y rounded-xl bg-slate-50/60 text-sm"
                    value={comments[c] ?? ""}
                    onChange={(e) => setComments((s) => ({ ...s, [c]: e.target.value }))}
                    aria-label={`Note for ${c}`}
                  />
                ) : (
                  <button type="button" onClick={() => setNotesOpen((s) => ({ ...s, [c]: true }))}
                    className="uc-focus inline-flex items-center gap-1 rounded-md text-xs font-medium text-[--brand-700] hover:text-[--brand-900]">
                    <MessageSquarePlus className="h-3.5 w-3.5" /> Add a note
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="border-t bg-slate-50/60 px-5 py-4" style={{ borderColor: "var(--card-line)" }}>
        <p className="text-sm font-semibold text-slate-800">Your recommendation</p>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Recommendation">
          {RECOMMENDATIONS.map((r) => {
            const on = rec === r.value;
            const style = REC_STYLES[r.tone];
            return (
              <button key={r.value} type="button" role="radio" aria-checked={on} onClick={() => setRec(r.value)}
                className={`uc-focus flex flex-col items-start gap-1 rounded-xl border bg-white px-3 py-2.5 text-left transition-all hover:-translate-y-px ${on ? style.on : "hover:border-[--brand-600]"}`}
                style={on ? undefined : { borderColor: "var(--card-line)" }}>
                <r.icon className={`h-4 w-4 ${on ? style.icon : "text-slate-400"}`} aria-hidden />
                <span className="text-sm font-semibold text-slate-800">{r.label}</span>
                <span className="text-[11px] leading-snug text-muted-foreground">{r.hint}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {ready ? "Ready to submit. You can't change it afterwards."
              : scored < CRITERIA.length ? `Score ${CRITERIA.length - scored} more ${CRITERIA.length - scored === 1 ? "area" : "areas"} to continue.`
              : "Choose your recommendation to continue."}
          </p>
          <Button
            className="sm:min-w-44"
            disabled={!ready || submit.isPending}
            onClick={() => rec && submit.mutate({
              applicationId,
              scores: CRITERIA.map((c) => ({ criterion: c, score: scores[c], comment: comments[c]?.trim() || undefined })),
              recommendation: rec,
            })}
          >
            {submit.isPending ? "Submitting…" : "Submit scorecard"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function DocChecklist({ docs, onDone }: { docs: NonNullable<Detail>["docs"]; onDone: () => void }) {
  const utils = trpc.useUtils();
  const verify = trpc.hr2.verifyDocument.useMutation({
    onSuccess: () => { toast.success("Document verified"); onDone(); utils.hr2.complianceQueue?.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const reject = trpc.hr2.rejectDocument.useMutation({
    onSuccess: () => { toast.success("Document rejected — candidate will be asked to re-upload"); onDone(); },
    onError: (e) => toast.error(e.message),
  });
  const openDoc = trpc.hr2.documentUrl.useMutation({
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (e) => toast.error(e.message),
  });
  const [expiry, setExpiry] = useState<Record<number, string>>({});
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  return (
    <>
      <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
        {docs.map((doc) => (
          <li key={doc.id} className="py-2.5 flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-40">
              <p className="text-sm font-medium">{doc.requirementKey.replace(/_/g, " ")}</p>
              <p className="text-xs text-muted-foreground">
                {doc.fileKey ? (
                  <button className="underline text-[--brand-700] hover:text-[--brand-900]" disabled={openDoc.isPending}
                    onClick={() => openDoc.mutate({ id: Number(doc.id) })}>
                    {doc.fileName ?? "Open file"}
                  </button>
                ) : (doc.fileName ?? "No file yet")}
                {doc.expiresAt ? ` · expires ${fmtDate(doc.expiresAt)}` : ""}
              </p>
            </div>
            <Chip value={doc.status} />
            {doc.status === "uploaded" && (
              <span className="flex items-center gap-1.5">
                <Input type="date" className="h-7 w-36 text-xs" value={expiry[Number(doc.id)] ?? ""}
                  onChange={(e) => setExpiry((s) => ({ ...s, [Number(doc.id)]: e.target.value }))} aria-label="Expiry date (if applicable)" />
                <Button size="sm" className="h-7" disabled={verify.isPending}
                  onClick={() => verify.mutate({ id: Number(doc.id), expiresAt: expiry[Number(doc.id)] || undefined })}>
                  Verify
                </Button>
                <Button size="sm" variant="outline" className="h-7" onClick={() => setRejectId(Number(doc.id))}>Reject</Button>
              </span>
            )}
            {doc.status === "rejected" && doc.rejectionReason && (
              <span className="text-xs text-red-700">{doc.rejectionReason}</span>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={rejectId !== null} onOpenChange={(o) => !o && setRejectId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject document</DialogTitle></DialogHeader>
          <Label htmlFor="rej-reason">Reason (sent to the candidate)</Label>
          <Input id="rej-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Document expired, please upload a current one" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={reason.length < 3 || reject.isPending}
              onClick={() => { reject.mutate({ id: rejectId!, reason }); setRejectId(null); setReason(""); }}>
              Reject document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RejectDialog({ open, onClose, applicationId, onConfirm }: {
  open: boolean; onClose: () => void; applicationId: number; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  void applicationId;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reject application</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <XCircle className="h-4 w-4 text-red-600" /> This is a human decision — the system never rejects automatically.
        </p>
        <Label htmlFor="rej-app">Reason (required)</Label>
        <Textarea id="rej-app" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={reason.length < 3} onClick={() => { onConfirm(reason); onClose(); setReason(""); }}>
            Confirm rejection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ALL_STAGES = Object.keys(STAGE_LABELS);

function OverrideDialog({ open, onClose, current, onConfirm }: {
  open: boolean; onClose: () => void; current: string; onConfirm: (to: string, reason: string) => void;
}) {
  const [to, setTo] = useState(current);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Move stage (admin override)</DialogTitle></DialogHeader>
        <Label>Target stage</Label>
        <Select value={to} onValueChange={setTo}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-64">
            {ALL_STAGES.filter((s) => s !== current).map((s) => <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Label htmlFor="ov-reason" className="mt-2">Reason (required — recorded in audit log)</Label>
        <Textarea id="ov-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={reason.length < 3} onClick={() => { onConfirm(to, reason); onClose(); setReason(""); }}>
            Move stage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Inline CV viewer — fetches a short-lived URL from the server and embeds the PDF. */
function CvViewer({ applicationId, fileKey, fileName, versions }: {
  applicationId: number; fileKey: string; fileName: string;
  versions: { id: number | bigint; fileName: string | null; createdAt: string | Date; extractStatus: string }[];
}) {
  const [open, setOpen] = useState(false);
  const q = trpc.hr.cvUrl.useQuery({ applicationId, key: fileKey }, { enabled: open, staleTime: 5 * 60_000 });
  const isPdf = fileName.toLowerCase().endsWith(".pdf");
  return (
    <section className="uc-card p-5" aria-label="CV">
      <div className="flex items-center justify-between mb-3">
        <h2 className="uc-label flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> CV — {fileName}</h2>
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide CV" : "View CV"}
        </Button>
      </div>
      {open && (
        q.isLoading ? <p className="text-sm text-muted-foreground">Loading CV…</p>
        : q.error ? <p className="text-sm text-red-600">{q.error.message}</p>
        : q.data ? (
          isPdf ? (
            <iframe src={q.data.url} title="Candidate CV" className="w-full h-[70vh] rounded-xl border" style={{ borderColor: "var(--line)" }} />
          ) : (
            <p className="text-sm">
              This CV is a Word document —{" "}
              <a href={q.data.url} target="_blank" rel="noreferrer" className="text-[--brand-600] underline">download it to view</a>.
            </p>
          )
        ) : null
      )}
      {versions.length > 1 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {versions.length} CV versions on file (latest shown). A duplicate application keeps the newer CV as a new version.
        </p>
      )}
    </section>
  );
}
