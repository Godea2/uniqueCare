import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, fmtDateTime, AiBadge, AiError } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, RefreshCw, CheckCircle2, ArrowLeft, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Section = { key: string; title: string; guidance?: string };

const INPUT_FIELDS = [
  { key: "about", label: "About the person / background" },
  { key: "health", label: "Health conditions (facts only)" },
  { key: "medication", label: "Medication" },
  { key: "mobility", label: "Mobility & moving/handling" },
  { key: "communication", label: "Communication" },
  { key: "preferences", label: "Preferences, routines, likes/dislikes" },
  { key: "risks", label: "Known risks" },
  { key: "family", label: "Family involvement & contacts" },
];

export default function PlanEditor() {
  const { id } = useParams<{ id: string }>();
  const planId = Number(id);
  const utils = trpc.useUtils();
  const q = trpc.cqc.planDetail.useQuery({ id: planId });
  const inv = () => utils.cqc.planDetail.invalidate({ id: planId });

  const [content, setContent] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [regenKey, setRegenKey] = useState<string | null>(null);
  const [regenInstruction, setRegenInstruction] = useState("");

  const generate = trpc.cqc.generatePlan.useMutation({
    onSuccess: () => { inv(); utils.cqc.plans.invalidate(); setGenOpen(false); toast.success("Draft generated — review every section"); },
  });
  const regen = trpc.cqc.regenerateSection.useMutation({
    onSuccess: (r) => {
      if (regenKey) setContent((c) => ({ ...c, [regenKey]: r.text }));
      setDirty(true); setRegenKey(null); setRegenInstruction("");
      toast.success("Section regenerated");
    },
  });
  const save = trpc.cqc.savePlanContent.useMutation({
    onSuccess: () => { inv(); utils.cqc.plans.invalidate(); setDirty(false); toast.success("Saved — status: in review"); },
    onError: (e) => toast.error(e.message),
  });
  const approve = trpc.cqc.approvePlan.useMutation({
    onSuccess: (r) => { inv(); utils.cqc.plans.invalidate(); setApproveOpen(false); toast.success(`Approved — next review ${r.nextReviewDue}`); },
    onError: (e) => toast.error(e.message),
  });

  const structure: Section[] = useMemo(
    () => ((q.data?.template?.structure as Section[] | null) ?? []),
    [q.data],
  );

  useEffect(() => {
    if (q.data && !dirty) setContent({ ...((q.data.plan.content as Record<string, string>) ?? {}) });
  }, [q.data, dirty]);

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const plan = d.plan;
  const isAi = plan.status === "ai_generated";
  const canEdit = ["draft", "ai_generated", "in_review"].includes(plan.status);
  const hasWarning = Object.values(content).some((v) => v?.includes("⚠ Information needed"));

  return (
    <div className="space-y-4">
      <Link to={plan.planType === "care" ? "/clients/care-plans" : "/clients/support-plans"} className="inline-flex items-center gap-1 text-sm text-[--brand-600] hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> {plan.planType === "care" ? "Care plans" : "Support plans"}
      </Link>
      <PageHeader
        title={`${plan.planType === "care" ? "Care" : "Support"} plan — ${d.client?.firstName} ${d.client?.lastName}`}
        subtitle={`Version ${plan.version} · ${d.client?.clientRef}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Chip value={plan.status} />
            {isAi && <AiBadge />}
            {plan.status === "draft" && (
              <Button size="sm" onClick={() => setGenOpen(true)}>
                <Sparkles className="h-3.5 w-3.5 mr-1" /> Generate with AI
              </Button>
            )}
            {canEdit && plan.status !== "draft" && (
              <Button size="sm" variant="outline" disabled={!dirty || save.isPending} onClick={() => save.mutate({ planId, content })}>
                {save.isPending ? "Saving…" : "Save for review"}
              </Button>
            )}
            {plan.status === "in_review" && (
              <Button size="sm" onClick={() => setApproveOpen(true)}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve plan
              </Button>
            )}
          </div>
        }
      />

      {generate.error && <AiError error={generate.error} />}

      {isAi && (
        <div className="rounded-xl border border-violet-300 bg-violet-50 p-4 text-sm text-violet-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <p>
            <strong>AI-generated draft — must be reviewed and approved by a competent person.</strong>{" "}
            Sections marked “⚠ Information needed” are missing facts. The AI never invents medical or personal details.
          </p>
        </div>
      )}
      {hasWarning && !isAi && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Some sections still contain “⚠ Information needed” placeholders — fill these in before approval.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 space-y-3">
          {structure.length === 0 ? (
            <div className="uc-card p-5 text-sm text-muted-foreground">
              No template structure linked. {plan.status === "draft" ? "Generate with AI to create sections, or attach a template in Settings." : ""}
            </div>
          ) : (
            structure.map((sec) => (
              <section key={sec.key} className="uc-card p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <h2 className="text-sm font-semibold text-[--brand-900]">{sec.title}</h2>
                  {canEdit && plan.status !== "draft" && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-[--brand-600]"
                      disabled={regen.isPending}
                      onClick={() => { setRegenKey(sec.key); setRegenInstruction(""); }}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
                    </Button>
                  )}
                </div>
                {sec.guidance && <p className="text-[11px] text-muted-foreground mb-2">{sec.guidance}</p>}
                {canEdit ? (
                  <Textarea
                    rows={Math.max(3, Math.min(10, (content[sec.key] ?? "").split("\n").length + 1))}
                    value={content[sec.key] ?? ""}
                    onChange={(e) => { setContent((c) => ({ ...c, [sec.key]: e.target.value })); setDirty(true); }}
                    aria-label={sec.title}
                    className={content[sec.key]?.includes("⚠ Information needed") ? "border-amber-400 bg-amber-50/40" : ""}
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{content[sec.key] || "—"}</p>
                )}
              </section>
            ))
          )}
        </div>

        <aside className="space-y-3">
          <div className="uc-card p-4">
            <h2 className="uc-label mb-2">Status</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground text-xs">Status</dt><dd><Chip value={plan.status} /></dd></div>
              {plan.aiGeneratedAt && <div className="flex justify-between"><dt className="text-muted-foreground text-xs">AI generated</dt><dd className="text-xs">{fmtDateTime(plan.aiGeneratedAt)}</dd></div>}
              {plan.approvedBy && <div className="flex justify-between"><dt className="text-muted-foreground text-xs">Approved by</dt><dd className="text-xs">{plan.approvedBy}</dd></div>}
              {plan.nextReviewDue && <div className="flex justify-between"><dt className="text-muted-foreground text-xs">Next review</dt><dd className="text-xs">{plan.nextReviewDue}</dd></div>}
            </dl>
          </div>
          <div className="uc-card p-4">
            <h2 className="uc-label mb-2">Versions</h2>
            <ul className="space-y-1.5">
              {d.versions.map((v) => (
                <li key={v.id}>
                  <Link to={`/clients/plans/${v.id}`} className="uc-focus flex items-center justify-between text-sm rounded-md px-2 py-1 hover:bg-[--brand-50]">
                    <span className={v.id === plan.id ? "font-semibold text-[--brand-900]" : ""}>v{v.version}</span>
                    <Chip value={v.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* Generate dialog */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Generate plan with AI</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Enter only the facts gathered at assessment. Anything not supplied becomes a
            “⚠ Information needed” placeholder — the AI never invents details.
          </p>
          <GenerateForm onSubmit={(inputs) => generate.mutate({ planId, inputs })} pending={generate.isPending} error={generate.error} />
        </DialogContent>
      </Dialog>

      {/* Regenerate dialog */}
      <Dialog open={regenKey !== null} onOpenChange={(o) => !o && setRegenKey(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Regenerate section</DialogTitle></DialogHeader>
          <Label htmlFor="rg-i">Instruction (optional)</Label>
          <Textarea id="rg-i" rows={2} value={regenInstruction} onChange={(e) => setRegenInstruction(e.target.value)}
            placeholder="e.g. Make it warmer and mention the morning routine" />
          {regen.error && <div className="mt-2"><AiError error={regen.error} /></div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenKey(null)}>Cancel</Button>
            <Button disabled={regen.isPending}
              onClick={() => regen.mutate({ planId, sectionKey: regenKey!, instruction: regenInstruction || undefined })}>
              {regen.isPending ? "Regenerating…" : "Regenerate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve this plan?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Approving marks you as the competent reviewer, supersedes any previous approved version, and schedules the annual review in 12 months.
          </p>
          {hasWarning && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
              Warning: “⚠ Information needed” placeholders are still present.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button disabled={approve.isPending} onClick={() => approve.mutate({ planId })}>
              I have reviewed this plan — approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GenerateForm({ onSubmit, pending, error }: {
  onSubmit: (inputs: Record<string, string>) => void; pending: boolean; error: unknown;
}) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const filled = Object.values(vals).some((v) => v.trim().length > 3);
  return (
    <div className="mt-2 space-y-3">
      {INPUT_FIELDS.map((f) => (
        <div key={f.key}>
          <Label htmlFor={`gi-${f.key}`}>{f.label}</Label>
          <Textarea id={`gi-${f.key}`} rows={2} value={vals[f.key] ?? ""}
            onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))} />
        </div>
      ))}
      {error ? <AiError error={error} /> : null}
      <DialogFooter>
        <Button disabled={!filled || pending}
          onClick={() => onSubmit(Object.fromEntries(Object.entries(vals).filter(([, v]) => v.trim())))}>
          <Sparkles className="h-4 w-4 mr-1.5" /> {pending ? "Generating…" : "Generate draft"}
        </Button>
      </DialogFooter>
    </div>
  );
}
