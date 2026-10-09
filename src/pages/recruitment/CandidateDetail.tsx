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
import { CheckCircle2, XCircle, FileCheck2, GraduationCap, Copy, Check, ArrowLeft, FileText } from "lucide-react";
import { toast } from "sonner";

const CRITERIA = ["Values & motivation", "Person-centred care", "Safeguarding awareness", "Communication", "Reliability", "Scenario judgement"];

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
    onSuccess: (r) => { inv(); utils.hr.pipeline.invalidate(); toast.success(`AI screening complete — score ${r.score}`); },
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
  const breakdown = ((app.aiBreakdown as { key?: string; requirement_key?: string; met: string; evidence?: string; evidence_quote?: string; points?: number; source?: "cv" | "form" }[] | null) ?? null)
    ?.map((b) => ({ key: b.key ?? b.requirement_key ?? "—", met: b.met, evidence: b.evidence ?? b.evidence_quote ?? "", points: b.points, source: b.source })) ?? null;
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
            {app.cvUnreadable && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                CV unreadable — manual review required. The file could not be text-extracted (it may be a scan).
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
                          <td className="py-1.5 pr-2">{b.key.replace(/_/g, " ")}</td>
                          <td className="py-1.5 pr-2"><Chip value={b.met === "yes" ? "verified" : b.met === "partial" ? "pending" : b.met === "unknown" ? "requested" : "rejected"} label={b.met} /></td>
                          <td className="py-1.5 pr-2 text-xs">
                            <mark className="bg-yellow-100 rounded px-1">{b.evidence}</mark>
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

          {/* CV viewer — side by side with the screening evidence above */}
          {cvKey && (
            <CvViewer applicationId={app.id} fileKey={cvKey} fileName={latestCv?.fileName ?? app.cvFileName ?? "CV"} versions={d.cvVersions ?? []} />
          )}

          {/* Interview */}
          <section className="uc-card p-5" aria-label="Interview">
            <h2 className="uc-label mb-3">Interview</h2>
            {d.slot && d.booking ? (
              <p className="text-sm mb-3">
                {fmtDate(d.slot.startsAt)} {fmtTime(d.slot.startsAt)}–{fmtTime(d.slot.endsAt)} · {d.slot.locationText ?? "Microsoft Teams"}
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
          return (
            <div key={sc.id} className="rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <AvatarDot name={member?.fullName ?? "?"} color={member?.avatarColor} />
                  {member?.fullName ?? "Panel member"}
                </span>
                <span className="text-sm">
                  <strong>{sc.total}</strong>/30 · <Chip value={sc.recommendation === "strong_yes" || sc.recommendation === "yes" ? "verified" : "rejected"} label={(sc.recommendation ?? "").replace(/_/g, " ")} />
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                {scores.map((s) => (
                  <div key={s.criterion} className="flex items-center justify-between rounded bg-[--brand-50] px-2 py-1 text-xs">
                    <span>{s.criterion}</span>
                    <span className="font-semibold">{s.score}/5</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function ScorecardForm({ applicationId, onDone }: { applicationId: number; onDone: () => void }) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [rec, setRec] = useState<"strong_yes" | "yes" | "no" | "strong_no">("yes");
  const submit = trpc.hr2.submitScorecard.useMutation({
    onSuccess: () => { toast.success("Scorecard submitted"); onDone(); },
    onError: (e) => toast.error(e.message),
  });
  const complete = CRITERIA.every((c) => scores[c]);

  return (
    <div className="mt-4 rounded-lg border p-4 bg-[--brand-50]/50" style={{ borderColor: "var(--line)" }}>
      <p className="uc-label mb-3">Your scorecard</p>
      <div className="space-y-2.5">
        {CRITERIA.map((c) => (
          <div key={c} className="grid grid-cols-[1fr_auto] items-center gap-2">
            <div>
              <p className="text-sm font-medium">{c}</p>
              <Input
                placeholder="Comment (optional)" className="mt-1 h-7 text-xs"
                value={comments[c] ?? ""} onChange={(e) => setComments((s) => ({ ...s, [c]: e.target.value }))}
              />
            </div>
            <div className="flex gap-1" role="radiogroup" aria-label={`${c} score`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n} type="button"
                  onClick={() => setScores((s) => ({ ...s, [c]: n }))}
                  aria-pressed={scores[c] === n}
                  className={`h-8 w-8 rounded-md border text-sm font-semibold transition-colors uc-focus ${scores[c] === n ? "bg-[--brand-600] text-white border-[--brand-600]" : "bg-white hover:bg-[--brand-100]"}`}
                  style={{ borderColor: scores[c] === n ? undefined : "var(--line)" }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Select value={rec} onValueChange={(v) => setRec(v as typeof rec)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="strong_yes">Strong yes</SelectItem>
            <SelectItem value="yes">Yes</SelectItem>
            <SelectItem value="no">No</SelectItem>
            <SelectItem value="strong_no">Strong no</SelectItem>
          </SelectContent>
        </Select>
        <Button
          disabled={!complete || submit.isPending}
          onClick={() => submit.mutate({
            applicationId,
            scores: CRITERIA.map((c) => ({ criterion: c, score: scores[c], comment: comments[c] || undefined })),
            recommendation: rec,
          })}
        >
          Submit scorecard
        </Button>
      </div>
    </div>
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
                {doc.fileName ?? "No file yet"}{doc.expiresAt ? ` · expires ${fmtDate(doc.expiresAt)}` : ""}
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
