import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, fmtDateTime, AiBadge, AiError, AiSectionBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { RefreshCw, CheckCircle2, ArrowLeft, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import CarePlanAssessmentForm, { CarePlanSectionNav } from "@/components/care-plan/CarePlanAssessmentForm";
import {
  assessmentHasInfoNeeded,
  emptyCarePlanAssessmentContent,
  isCarePlanAssessmentTemplate,
  type CarePlanAssessmentContent,
  type CarePlanSectionDef,
} from "@contracts/care-plan-assessment";
import {
  emptySupportPlanContent,
  isSupportPlanTemplate,
  supportPlanHasInfoNeeded,
} from "@contracts/support-plan";
import { sectionIsAiDrafted, type AiProvenance } from "@contracts/ai-provenance";
import { roleAllowed, CQC_PLAN_WRITE_ROLES } from "@/lib/roles";

type LegacySection = { key: string; title: string; guidance?: string };
type LegacyContent = Record<string, string>;
type StructuredContent = CarePlanAssessmentContent;

const CARE_INPUT_FIELDS = [
  { key: "about", label: "About the person / background" },
  { key: "health", label: "Health conditions (facts only)" },
  { key: "medication", label: "Medication (morning / tea / PRN)" },
  { key: "mobility", label: "Mobility & moving/handling" },
  { key: "communication", label: "Communication & sensory" },
  { key: "contacts", label: "Extra contacts not on the client record" },
  { key: "property", label: "Property / utilities (beyond access notes)" },
  { key: "preferences", label: "Preferences, routines, likes/dislikes" },
  { key: "risks", label: "Known risks" },
  { key: "visits", label: "Visit pattern notes (if not on rota templates)" },
];

const SUPPORT_INPUT_FIELDS = [
  { key: "about", label: "About the person / what matters" },
  { key: "outcomes", label: "Outcomes they want" },
  { key: "support", label: "How they want to be supported" },
  { key: "independence", label: "Independence & daily living" },
  { key: "wellbeing", label: "Health & wellbeing (support focus)" },
  { key: "community", label: "Community & relationships" },
  { key: "working", label: "What's working / not working" },
  { key: "risks", label: "Positive risk-taking / choices" },
  { key: "contingency", label: "Contingency / what if" },
];

const STATUS_FLOW = ["draft", "ai_generated", "in_review", "approved"] as const;

export default function PlanEditor() {
  const { id } = useParams<{ id: string }>();
  const planId = Number(id);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const meQ = trpc.core.me.useQuery();
  const canWrite = roleAllowed(meQ.data?.role, CQC_PLAN_WRITE_ROLES);
  const q = trpc.cqc.planDetail.useQuery({ id: planId });
  const inv = () => utils.cqc.planDetail.invalidate({ id: planId });
  const startReview = trpc.cqc.startReviewFromPlan.useMutation({
    onSuccess: (r) => {
      toast.success("Review started");
      navigate(`/cqc/plan-reviews/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const [structured, setStructured] = useState<StructuredContent>({});
  const [legacy, setLegacy] = useState<LegacyContent>({});
  const [dirty, setDirty] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [regenKey, setRegenKey] = useState<string | null>(null);
  const [regenInstruction, setRegenInstruction] = useState("");

  const structureKind = useMemo(() => {
    const s = q.data?.template?.structure;
    if (isCarePlanAssessmentTemplate(s)) return "care_assessment" as const;
    if (isSupportPlanTemplate(s)) return "support" as const;
    return "legacy" as const;
  }, [q.data?.template?.structure]);

  const isStructured = structureKind !== "legacy";

  const structuredSections: CarePlanSectionDef[] = useMemo(() => {
    const s = q.data?.template?.structure;
    if (isCarePlanAssessmentTemplate(s) || isSupportPlanTemplate(s)) return s.sections;
    return [];
  }, [q.data?.template?.structure]);

  const legacyStructure: LegacySection[] = useMemo(() => {
    const s = q.data?.template?.structure;
    if (isStructured) return [];
    return Array.isArray(s) ? (s as LegacySection[]) : [];
  }, [q.data?.template?.structure, isStructured]);

  const ctxQ = trpc.cqc.planAiContext.useQuery(
    { planId },
    { enabled: genOpen || (!!q.data && ["draft", "ai_generated"].includes(q.data.plan.status)) },
  );

  const generate = trpc.cqc.generatePlan.useMutation({
    onSuccess: () => {
      inv();
      utils.cqc.plans.invalidate();
      setGenOpen(false);
      setDirty(false);
      toast.success("AI draft ready — review every section before approval");
    },
    onError: (e) => toast.error(e.message),
  });
  const regen = trpc.cqc.regenerateSection.useMutation({
    onSuccess: (r) => {
      if (isStructured && regenKey && r.fields) {
        setStructured((c) => ({
          ...c,
          [regenKey]: { ...(c[regenKey] ?? {}), ...r.fields },
        }));
      } else if (regenKey && r.text) {
        setLegacy((c) => ({ ...c, [regenKey]: r.text }));
      }
      setDirty(true);
      setRegenKey(null);
      setRegenInstruction("");
      inv();
      toast.success("Section regenerated");
    },
    onError: (e) => toast.error(e.message),
  });
  const save = trpc.cqc.savePlanContent.useMutation({
    onSuccess: () => { inv(); utils.cqc.plans.invalidate(); setDirty(false); toast.success("Saved — status: in review"); },
    onError: (e) => toast.error(e.message),
  });
  const approve = trpc.cqc.approvePlan.useMutation({
    onSuccess: (r) => {
      inv();
      utils.cqc.plans.invalidate();
      setApproveOpen(false);
      toast.success(`Approved — previous version superseded · next review ${r.nextReviewDue}`);
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!q.data || dirty) return;
    const raw = q.data.plan.content;
    const s = q.data.template?.structure;
    if (isCarePlanAssessmentTemplate(s)) {
      const base = emptyCarePlanAssessmentContent();
      const stored = (raw && typeof raw === "object" && !Array.isArray(raw)) ? (raw as StructuredContent) : {};
      setStructured({ ...base, ...stored });
      setLegacy({});
    } else if (isSupportPlanTemplate(s)) {
      const base = emptySupportPlanContent();
      const stored = (raw && typeof raw === "object" && !Array.isArray(raw)) ? (raw as StructuredContent) : {};
      setStructured({ ...base, ...stored });
      setLegacy({});
    } else {
      setLegacy({ ...((raw as LegacyContent) ?? {}) });
      setStructured({});
    }
  }, [q.data, dirty]);

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const plan = d.plan;
  const provenance = plan.aiProvenance as AiProvenance | null | undefined;
  const isAi = plan.status === "ai_generated" || !!plan.aiGeneratedAt;
  const canEdit = canWrite && ["draft", "ai_generated", "in_review"].includes(plan.status);
  const canGenerate = canWrite && ["draft", "ai_generated"].includes(plan.status);
  const canApprove = canWrite && plan.status === "in_review";
  const canStartReview = canWrite && plan.status === "approved" && plan.planType === "care";
  const hasWarning = structureKind === "care_assessment"
    ? assessmentHasInfoNeeded(structured)
    : structureKind === "support"
      ? supportPlanHasInfoNeeded(structured)
      : Object.values(legacy).some((v) => v?.includes("⚠ Information needed"));

  const kindLabel = structureKind === "care_assessment"
    ? "Full assessment"
    : structureKind === "support"
      ? "Person-centred"
      : "";

  function saveContent() {
    save.mutate({ planId, content: isStructured ? structured : legacy });
  }

  function oneClickGenerate() {
    generate.mutate({ planId, inputs: {} });
  }

  const inputFields = structureKind === "support" ? SUPPORT_INPUT_FIELDS : CARE_INPUT_FIELDS;
  const regenSectionTitle = structuredSections.find((s) => s.key === regenKey)?.title
    ?? legacyStructure.find((s) => s.key === regenKey)?.title
    ?? regenKey;

  return (
    <div className="space-y-4">
      <Link to="/cqc/plans" className="inline-flex items-center gap-1 text-sm text-[--brand-600] hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Care & support plans
      </Link>
      <PageHeader
        title={`${plan.planType === "care" ? "Care" : "Support"} plan — ${d.client?.firstName} ${d.client?.lastName}`}
        subtitle={`Version ${plan.version} · ${d.client?.clientRef}${kindLabel ? ` · ${kindLabel}` : ""}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Chip value={plan.status} />
            {isAi && <AiBadge />}
            {canGenerate && (
              <>
                <Button size="sm" disabled={generate.isPending} onClick={oneClickGenerate}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  {generate.isPending ? "Generating…" : "Generate with AI"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setGenOpen(true)} disabled={generate.isPending}>
                  Add notes & generate
                </Button>
              </>
            )}
            {canEdit && (
              <Button size="sm" variant="outline" disabled={!dirty || save.isPending} onClick={saveContent}>
                {save.isPending ? "Saving…" : "Save for review"}
              </Button>
            )}
            {canApprove && (
              <Button size="sm" onClick={() => setApproveOpen(true)}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve plan
              </Button>
            )}
            {canStartReview && (
              <Button
                size="sm"
                variant="outline"
                disabled={startReview.isPending}
                onClick={() => startReview.mutate({ planId, trigger: "annual" })}
              >
                {startReview.isPending ? "Starting…" : "Start review"}
              </Button>
            )}
          </div>
        }
      />

      <StatusFlow current={plan.status} />

      {generate.error && <AiError error={generate.error} />}

      {canGenerate && plan.status === "draft" && (
        <div className="rounded-xl border border-[--brand-200] bg-[--brand-50]/50 p-3 text-sm text-[--brand-900]">
          <strong>Generate with AI</strong> builds a first draft from this client’s live record
          (name, address, GP, next of kin, access notes, funding, risk, preferences, etc.).
          Optional assessor notes fill gaps. Visit tables stay for you to complete.
          Missing facts are flagged “⚠ Information needed” — the AI never invents them.
        </div>
      )}

      {(isAi || plan.status === "in_review") && (
        <div className="rounded-xl border border-violet-300 bg-violet-50 p-4 text-sm text-violet-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <p>
            <strong>Every AI draft must be checked and approved by a competent person.</strong>{" "}
            Sections marked ✦ AI show when they were drafted. Fields marked “⚠ Information needed” require manager completion before approval.
            Approving supersedes any previous approved version and schedules the annual review.
          </p>
        </div>
      )}
      {hasWarning && plan.status !== "draft" && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Some fields still contain “⚠ Information needed” placeholders — fill these in before approval.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 space-y-3">
          {isStructured ? (
            structuredSections.length === 0 ? (
              <div className="uc-card p-5 text-sm text-muted-foreground">No template linked.</div>
            ) : (
              <CarePlanAssessmentForm
                sections={structuredSections}
                content={structured}
                canEdit={canEdit}
                aiProvenance={plan.aiProvenance}
                visitNeedsLabel={structureKind === "support" ? "Support focus for this visit" : "Care needs identified"}
                onChange={(next) => { setStructured(next); setDirty(true); }}
              />
            )
          ) : legacyStructure.length === 0 ? (
            <div className="uc-card p-5 text-sm text-muted-foreground">
              No template structure linked. Use <strong>Generate with AI</strong> to create the first draft.
            </div>
          ) : (
            legacyStructure.map((sec) => (
              <section key={sec.key} className="uc-card p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-[--brand-900]">{sec.title}</h2>
                    {sectionIsAiDrafted(plan.aiProvenance, sec.key) && <AiSectionBadge />}
                  </div>
                  {canEdit && (
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
                    rows={Math.max(3, Math.min(10, (legacy[sec.key] ?? "").split("\n").length + 1))}
                    value={legacy[sec.key] ?? ""}
                    onChange={(e) => { setLegacy((c) => ({ ...c, [sec.key]: e.target.value })); setDirty(true); }}
                    aria-label={sec.title}
                    className={legacy[sec.key]?.includes("⚠ Information needed") ? "border-amber-400 bg-amber-50/40" : ""}
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{legacy[sec.key] || "—"}</p>
                )}
              </section>
            ))
          )}
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4 self-start">
          {isStructured && <CarePlanSectionNav sections={structuredSections} />}
          <div className="uc-card p-4">
            <h2 className="uc-label mb-2">Status</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground text-xs">Status</dt><dd><Chip value={plan.status} /></dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground text-xs">Version</dt><dd className="text-xs font-medium">v{plan.version}</dd></div>
              {plan.aiGeneratedAt && <div className="flex justify-between"><dt className="text-muted-foreground text-xs">AI generated</dt><dd className="text-xs">{fmtDateTime(plan.aiGeneratedAt)}</dd></div>}
              {plan.approvedBy && <div className="flex justify-between"><dt className="text-muted-foreground text-xs">Approved by</dt><dd className="text-xs">{plan.approvedBy}</dd></div>}
              {plan.nextReviewDue && <div className="flex justify-between"><dt className="text-muted-foreground text-xs">Next review</dt><dd className="text-xs">{plan.nextReviewDue}</dd></div>}
            </dl>
          </div>
          {provenance?.lastGeneratedAt && (
            <div className="uc-card p-4">
              <h2 className="uc-label mb-2">AI transparency</h2>
              <p className="text-[11px] text-muted-foreground mb-2">
                Inspectors can see which sections were AI-drafted. All drafts require human approval.
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
                {provenance.lastModel && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Model</dt>
                    <dd className="truncate max-w-[9rem]" title={provenance.lastModel}>{provenance.lastModel}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">AI sections</dt>
                  <dd>{Object.keys(provenance.sections ?? {}).length}</dd>
                </div>
                {plan.status === "approved" && plan.approvedBy && (
                  <div className="pt-1.5 border-t text-[11px] text-emerald-800" style={{ borderColor: "var(--line)" }}>
                    Human-approved by <strong>{plan.approvedBy}</strong>
                    {plan.approvedAt ? ` · ${fmtDateTime(plan.approvedAt)}` : ""}
                  </div>
                )}
              </dl>
            </div>
          )}
          <div className="uc-card p-4">
            <h2 className="uc-label mb-2">Versions</h2>
            <ul className="space-y-1.5">
              {d.versions.map((v) => (
                <li key={v.id}>
                  <Link to={`/cqc/plans/${v.id}`} className="uc-focus flex items-center justify-between text-sm rounded-md px-2 py-1 hover:bg-[--brand-50]">
                    <span className={v.id === plan.id ? "font-semibold text-[--brand-900]" : ""}>v{v.version}</span>
                    <Chip value={v.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {isStructured && canEdit && (
            <div className="uc-card p-4">
              <h2 className="uc-label mb-2">Regenerate section</h2>
              <p className="text-[11px] text-muted-foreground mb-2">
                Rewrite one section with an instruction (e.g. “make it more detailed”) without redrafting the whole plan.
              </p>
              <select
                className="w-full text-xs border rounded-md px-2 py-1.5 mb-2"
                style={{ borderColor: "var(--line)" }}
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    setRegenKey(e.target.value);
                    setRegenInstruction("");
                  }
                }}
              >
                <option value="">Choose section…</option>
                {structuredSections.filter((s) => s.layout === "fields").map((s) => (
                  <option key={s.key} value={s.key}>{s.title}</option>
                ))}
              </select>
            </div>
          )}
        </aside>
      </div>

      {/* Generate with optional notes */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate with AI</DialogTitle>
            <DialogDescription>
              The AI always uses this client’s live record. Add assessor notes only for facts not already on file.
              Missing information is flagged — never invented.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-[--brand-50]/40 p-3 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto" style={{ borderColor: "var(--line)" }}>
            <p className="font-semibold text-[--brand-900] mb-1">Live client record (auto-included)</p>
            {ctxQ.isLoading && "Loading client facts…"}
            {ctxQ.error && <span className="text-red-700">{ctxQ.error.message}</span>}
            {ctxQ.data?.factsText}
          </div>

          <GenerateForm
            fields={inputFields}
            onSubmit={(inputs) => generate.mutate({ planId, inputs })}
            onOneClick={() => generate.mutate({ planId, inputs: {} })}
            pending={generate.isPending}
            error={generate.error}
          />
        </DialogContent>
      </Dialog>

      {/* Regenerate with instruction (structured + legacy) */}
      <Dialog open={regenKey !== null} onOpenChange={(o) => !o && setRegenKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate: {regenSectionTitle}</DialogTitle>
            <DialogDescription>
              Only this section is rewritten. Uses the live client record plus any assessor notes saved on the plan.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="rg-i">Instruction</Label>
          <Textarea
            id="rg-i"
            rows={3}
            value={regenInstruction}
            onChange={(e) => setRegenInstruction(e.target.value)}
            placeholder='e.g. "make it more detailed" or "use plainer language"'
          />
          {regen.error && <div className="mt-2"><AiError error={regen.error} /></div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenKey(null)}>Cancel</Button>
            <Button
              disabled={regen.isPending || !regenKey}
              onClick={() => regen.mutate({
                planId,
                sectionKey: regenKey!,
                instruction: regenInstruction.trim() || undefined,
              })}
            >
              {regen.isPending ? "Regenerating…" : "Regenerate section"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve this plan?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            You confirm you have reviewed this plan as a competent person. Approving supersedes any previous
            approved version for this client and schedules the annual review in 12 months.
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

function StatusFlow({ current }: { current: string }) {
  const idx = STATUS_FLOW.indexOf(current as (typeof STATUS_FLOW)[number]);
  return (
    <ol className="flex flex-wrap gap-2 text-[11px]" aria-label="Plan status flow">
      {STATUS_FLOW.map((s, i) => {
        const active = s === current;
        const done = idx > i;
        return (
          <li
            key={s}
            className={`rounded-full px-2.5 py-1 border ${
              active ? "bg-[--brand-600] text-white border-[--brand-600]"
                : done ? "bg-[--brand-50] text-[--brand-800] border-[--brand-200]"
                  : "bg-white text-muted-foreground"
            }`}
            style={{ borderColor: active || done ? undefined : "var(--line)" }}
          >
            {s.replace(/_/g, " ")}
          </li>
        );
      })}
    </ol>
  );
}

function GenerateForm({ fields, onSubmit, onOneClick, pending, error }: {
  fields: { key: string; label: string }[];
  onSubmit: (inputs: Record<string, string>) => void;
  onOneClick: () => void;
  pending: boolean;
  error: unknown;
}) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const filled = Object.values(vals).some((v) => v.trim().length > 3);
  return (
    <div className="mt-2 space-y-3">
      <p className="text-xs text-muted-foreground">Assessor notes (optional — only facts not already on the client record)</p>
      {fields.map((f) => (
        <div key={f.key}>
          <Label htmlFor={`gi-${f.key}`}>{f.label}</Label>
          <Textarea id={`gi-${f.key}`} rows={2} value={vals[f.key] ?? ""}
            onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))} />
        </div>
      ))}
      {error ? <AiError error={error} /> : null}
      <DialogFooter className="gap-2 sm:gap-2">
        <Button variant="outline" disabled={pending} onClick={onOneClick}>
          {pending ? "Generating…" : "Generate from client record only"}
        </Button>
        <Button
          disabled={pending}
          onClick={() => onSubmit(Object.fromEntries(Object.entries(vals).filter(([, v]) => v.trim())))}
        >
          <Sparkles className="h-3.5 w-3.5 mr-1" />
          {pending ? "Generating…" : filled ? "Generate with notes" : "Generate with AI"}
        </Button>
      </DialogFooter>
    </div>
  );
}
