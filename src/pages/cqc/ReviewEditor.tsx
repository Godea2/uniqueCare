import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, fmtDate, fmtDateTime, AiBadge, AiError } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, AlertTriangle, CheckCircle2, Sparkles, Lock } from "lucide-react";
import { toast } from "sonner";
import ReviewReportForm, { ReviewSectionNav } from "@/components/care-plan/ReviewReportForm";
import {
  emptyCarePlanReviewContent,
  reviewHasInfoNeeded,
  type CarePlanReviewContent,
} from "@contracts/care-plan-review";
import type { AiProvenance } from "@contracts/ai-provenance";
import { roleAllowed, CQC_PLAN_WRITE_ROLES } from "@/lib/roles";

export default function ReviewEditor() {
  const { id } = useParams<{ id: string }>();
  const reviewId = Number(id);
  const utils = trpc.useUtils();
  const meQ = trpc.core.me.useQuery();
  const canWrite = roleAllowed(meQ.data?.role, CQC_PLAN_WRITE_ROLES);
  const q = trpc.cqc.reviewDetail.useQuery({ id: reviewId });
  const inv = () => utils.cqc.reviewDetail.invalidate({ id: reviewId });

  const [content, setContent] = useState<CarePlanReviewContent>({});
  const [meetingNotes, setMeetingNotes] = useState("");
  const [dirty, setDirty] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);

  const saveNotes = trpc.cqc.saveReviewMeetingNotes.useMutation({
    onSuccess: () => toast.success("Meeting notes saved"),
    onError: (e) => toast.error(e.message),
  });
  const saveContent = trpc.cqc.saveReviewContent.useMutation({
    onSuccess: () => { inv(); utils.cqc.reviews.invalidate(); setDirty(false); toast.success("Review report saved"); },
    onError: (e) => toast.error(e.message),
  });
  const generate = trpc.cqc.generateReviewReport.useMutation({
    onSuccess: () => { inv(); setDirty(false); toast.success("AI review report ready — edit before sign-off"); },
    onError: (e) => toast.error(e.message),
  });
  const complete = trpc.cqc.completeReview.useMutation({
    onSuccess: (r) => {
      inv();
      utils.cqc.reviews.invalidate();
      utils.cqc.plans.invalidate();
      setCompleteOpen(false);
      toast.success(`Review completed by ${r.completedBy} · next review ${r.nextReviewDue}`);
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!q.data || dirty) return;
    setContent({ ...emptyCarePlanReviewContent(), ...q.data.content });
    setMeetingNotes(q.data.review.meetingNotes ?? "");
  }, [q.data, dirty]);

  if (q.isLoading) return <Loading rows={8} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  const { review, plan, client, changeEvents, sections, isLocked } = q.data!;
  const canEdit = canWrite && !isLocked;
  const hasWarning = reviewHasInfoNeeded(content);
  const isAi = !!review.aiGeneratedAt;
  const provenance = review.aiProvenance as AiProvenance | null | undefined;

  return (
    <div className="space-y-4">
      <Link to="/cqc/plan-reviews" className="inline-flex items-center gap-1 text-sm text-[--brand-600] hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Plan reviews
      </Link>

      <PageHeader
        title={`Care plan review — ${client?.firstName ?? ""} ${client?.lastName ?? ""}`}
        subtitle={`${client?.clientRef ?? ""} · ${review.trigger.replace(/_/g, " ")} · due ${fmtDate(review.dueDate)}${plan ? ` · plan v${plan.version}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Chip value={review.status} />
            {isAi && <AiBadge />}
            {isLocked && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> Locked
              </span>
            )}
            {canEdit && (
              <>
                <Button
                  size="sm"
                  disabled={generate.isPending}
                  onClick={() => generate.mutate({ id: reviewId, meetingNotes })}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  {generate.isPending ? "Generating…" : "Generate AI report"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!dirty || saveContent.isPending}
                  onClick={() => saveContent.mutate({ id: reviewId, content })}
                >
                  {saveContent.isPending ? "Saving…" : "Save report"}
                </Button>
                <Button size="sm" onClick={() => setCompleteOpen(true)}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Complete review
                </Button>
              </>
            )}
          </div>
        }
      />

      {generate.error && <AiError error={generate.error} />}

      {isAi && canEdit && (
        <div className="rounded-xl border border-violet-300 bg-violet-50 p-4 text-sm text-violet-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <p>
            <strong>AI-drafted review — must be checked by a competent person before completion.</strong>{" "}
            The 21-area checklist defaults to “No change” unless your notes indicate otherwise.
            Missing facts are flagged “⚠ Information needed”.
          </p>
        </div>
      )}
      {hasWarning && canEdit && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Some fields still contain “⚠ Information needed” placeholders.
        </div>
      )}
      {isLocked && (
        <div className="rounded-xl border border-[--line] bg-white p-3 text-sm text-muted-foreground">
          Completed by <strong>{review.completedBy ?? "—"}</strong>
          {review.completedAt ? ` on ${fmtDate(review.completedAt)}` : ""}. Report is locked.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <section className="uc-card p-4">
            <h2 className="text-sm font-semibold text-[--brand-900] mb-1">Manager meeting notes</h2>
            <p className="text-[11px] text-muted-foreground mb-2">
              Combined with the approved plan and change events when you generate the AI report.
            </p>
            {canEdit ? (
              <>
                <Textarea
                  rows={5}
                  value={meetingNotes}
                  onChange={(e) => setMeetingNotes(e.target.value)}
                  placeholder="What was discussed at the review meeting…"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={saveNotes.isPending}
                  onClick={() => saveNotes.mutate({ id: reviewId, meetingNotes })}
                >
                  Save notes
                </Button>
              </>
            ) : (
              <p className="text-sm whitespace-pre-wrap">{meetingNotes || "—"}</p>
            )}
          </section>

          <ReviewReportForm
            sections={sections}
            content={content}
            canEdit={canEdit}
            aiProvenance={review.aiProvenance}
            onChange={(next) => { setContent(next); setDirty(true); }}
          />
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4 self-start">
          <ReviewSectionNav sections={sections} />
          {plan && (
            <div className="uc-card p-4">
              <h2 className="uc-label mb-2">Plan under review</h2>
              <p className="text-sm font-medium capitalize">{plan.planType} plan v{plan.version}</p>
              <p className="text-xs text-muted-foreground mt-1">Status: {plan.status}</p>
              {plan.nextReviewDue && (
                <p className="text-xs text-muted-foreground">Next review due: {fmtDate(plan.nextReviewDue)}</p>
              )}
              <Link to={`/cqc/plans/${plan.id}`} className="text-xs text-[--brand-700] hover:underline mt-2 inline-block">
                Open plan
              </Link>
            </div>
          )}
          {provenance?.lastGeneratedAt && (
            <div className="uc-card p-4">
              <h2 className="uc-label mb-2">AI transparency</h2>
              <p className="text-[11px] text-muted-foreground mb-2">
                AI-drafted sections are marked ✦ AI. Completion records the manager’s name.
              </p>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Last AI draft</dt>
                  <dd>{fmtDateTime(provenance.lastGeneratedAt)}</dd>
                </div>
                {provenance.lastActorName && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Triggered by</dt>
                    <dd>{provenance.lastActorName}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">AI sections</dt>
                  <dd>{Object.keys(provenance.sections ?? {}).length}</dd>
                </div>
                {review.completedBy && (
                  <div className="pt-1.5 border-t text-[11px] text-emerald-800" style={{ borderColor: "var(--line)" }}>
                    Completed by <strong>{review.completedBy}</strong>
                    {review.completedAt ? ` · ${fmtDate(review.completedAt)}` : ""}
                  </div>
                )}
              </dl>
            </div>
          )}
          <div className="uc-card p-4">
            <h2 className="uc-label mb-2">Change events since approval</h2>
            {changeEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">None recorded.</p>
            ) : (
              <ul className="space-y-2 max-h-56 overflow-y-auto">
                {changeEvents.map((e) => (
                  <li key={e.id} className="text-xs border-b pb-2 last:border-0" style={{ borderColor: "var(--line)" }}>
                    <span className="font-medium capitalize">{e.type.replace(/_/g, " ")}</span>
                    <span className="block text-muted-foreground">{fmtDate(e.occurredAt)}</span>
                    <span className="block mt-0.5">{e.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete this review?</DialogTitle>
            <DialogDescription>
              Locks the report, records you as the completing manager, sets the plan’s next review date 12 months ahead,
              and schedules the next annual review.
            </DialogDescription>
          </DialogHeader>
          {hasWarning && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
              Warning: “⚠ Information needed” placeholders are still present.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancel</Button>
            <Button
              disabled={complete.isPending}
              onClick={() => {
                if (dirty) {
                  saveContent.mutate(
                    { id: reviewId, content },
                    { onSuccess: () => complete.mutate({ id: reviewId }) },
                  );
                } else {
                  complete.mutate({ id: reviewId });
                }
              }}
            >
              {complete.isPending ? "Completing…" : "Complete & reschedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
