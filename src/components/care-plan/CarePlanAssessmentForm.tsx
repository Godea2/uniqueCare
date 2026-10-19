import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AiSectionBadge, fmtDateTime } from "@/components/common";
import {
  ASSISTANCE_DOMAINS,
  ASSISTANCE_LEVELS,
  VISIT_SLOTS,
  type AssistanceRow,
  type CarePlanAssessmentContent,
  type CarePlanFieldDef,
  type CarePlanSectionDef,
  type VisitRow,
} from "@contracts/care-plan-assessment";
import { sectionIsAiDrafted, type AiProvenance } from "@contracts/ai-provenance";

type Props = {
  sections: CarePlanSectionDef[];
  content: CarePlanAssessmentContent;
  canEdit: boolean;
  onChange: (next: CarePlanAssessmentContent) => void;
  /** Label for the per-visit care/support needs field (default: Care needs identified). */
  visitNeedsLabel?: string;
  /** Per-section AI draft markers for inspector transparency. */
  aiProvenance?: unknown | null;
};

export default function CarePlanAssessmentForm({
  sections, content, canEdit, onChange, visitNeedsLabel = "Care needs identified", aiProvenance,
}: Props) {
  function patchSection(key: string, patch: Record<string, unknown>) {
    onChange({
      ...content,
      [key]: { ...(content[key] ?? {}), ...patch },
    });
  }

  function setField(sectionKey: string, fieldKey: string, value: string) {
    patchSection(sectionKey, { [fieldKey]: value });
  }

  return (
    <div className="space-y-3">
      {sections.map((sec) => {
        const aiMeta = (aiProvenance as AiProvenance | null | undefined)?.sections?.[sec.key];
        const isAi = sectionIsAiDrafted(aiProvenance, sec.key);
        return (
        <section key={sec.key} id={`cp-${sec.key}`} className="uc-card p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold text-[--brand-900]">{sec.title}</h2>
            {isAi && (
              <AiSectionBadge
                title={aiMeta
                  ? `AI-drafted ${fmtDateTime(aiMeta.generatedAt)} by ${aiMeta.actorName}${aiMeta.model ? ` · ${aiMeta.model}` : ""} — human approval required`
                  : undefined}
              />
            )}
          </div>
          {sec.guidance && <p className="mt-1 text-[11px] text-muted-foreground mb-3">{sec.guidance}</p>}

          {sec.layout === "visits" ? (
            <VisitsEditor
              visits={(content[sec.key]?.visits as VisitRow[] | undefined) ?? []}
              canEdit={canEdit}
              needsLabel={visitNeedsLabel}
              onChange={(visits) => patchSection(sec.key, { visits })}
            />
          ) : sec.layout === "assistance" ? (
            <AssistanceEditor
              domains={(content[sec.key]?.domains as AssistanceRow[] | undefined) ?? []}
              canEdit={canEdit}
              onChange={(domains) => patchSection(sec.key, { domains })}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(sec.fields ?? []).map((f) => (
                <Field
                  key={f.key}
                  field={f}
                  value={String(content[sec.key]?.[f.key] ?? "")}
                  canEdit={canEdit}
                  onChange={(v) => setField(sec.key, f.key, v)}
                />
              ))}
            </div>
          )}
        </section>
        );
      })}
    </div>
  );
}

function Field({
  field, value, canEdit, onChange,
}: {
  field: CarePlanFieldDef;
  value: string;
  canEdit: boolean;
  onChange: (v: string) => void;
}) {
  const span = field.span === "full" ? "md:col-span-2" : "";
  const warn = value.includes("⚠ Information needed");

  if (!canEdit) {
    return (
      <div className={span}>
        <p className="text-[11px] font-medium text-muted-foreground">{field.label}</p>
        <p className="mt-0.5 text-sm whitespace-pre-wrap leading-relaxed">{value || "—"}</p>
      </div>
    );
  }

  const id = `cpf-${field.key}`;
  return (
    <div className={span}>
      <Label htmlFor={id} className="text-xs">
        {field.label}{field.required ? " *" : ""}
      </Label>
      {field.help && <p className="text-[10px] text-muted-foreground mb-1">{field.help}</p>}
      {field.type === "textarea" ? (
        <Textarea
          id={id}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={warn ? "border-amber-400 bg-amber-50/40" : ""}
        />
      ) : field.type === "select" || field.type === "yes_no" ? (
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger id={id} className={warn ? "border-amber-400" : ""}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? (field.type === "yes_no"
              ? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]
              : [])).map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={warn ? "border-amber-400 bg-amber-50/40" : ""}
        />
      )}
    </div>
  );
}

function VisitsEditor({
  visits, canEdit, onChange, needsLabel,
}: {
  visits: VisitRow[];
  canEdit: boolean;
  onChange: (v: VisitRow[]) => void;
  needsLabel: string;
}) {
  function patch(i: number, patch: Partial<VisitRow>) {
    onChange(visits.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-4">
      {visits.map((row, i) => {
        const label = VISIT_SLOTS.find((s) => s.value === row.slot)?.label ?? row.slot;
        return (
          <div key={row.slot} className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--line)" }}>
            <h3 className="text-xs font-semibold text-[--brand-800] uppercase tracking-wide">{label}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <MiniField label="Days" value={row.days} canEdit={canEdit} onChange={(v) => patch(i, { days: v })} placeholder="e.g. Mon-Fri" />
              <MiniField label="Start" value={row.startTime} canEdit={canEdit} onChange={(v) => patch(i, { startTime: v })} type="time" />
              <MiniField label="End" value={row.endTime} canEdit={canEdit} onChange={(v) => patch(i, { endTime: v })} type="time" />
              <MiniField label="Duration (min)" value={row.durationMinutes} canEdit={canEdit} onChange={(v) => patch(i, { durationMinutes: v })} />
              <MiniField label="Carers needed" value={row.carersNeeded} canEdit={canEdit} onChange={(v) => patch(i, { carersNeeded: v })} />
              <MiniField label="Task minutes" value={row.taskMinutes} canEdit={canEdit} onChange={(v) => patch(i, { taskMinutes: v })} />
            </div>
            <MiniField label="Tasks" value={row.tasks} canEdit={canEdit} onChange={(v) => patch(i, { tasks: v })} textarea placeholder="What carers do on this visit" />
            <MiniField label={needsLabel} value={row.careNeeds} canEdit={canEdit} onChange={(v) => patch(i, { careNeeds: v })} textarea placeholder="Needs / focus for this visit" />
          </div>
        );
      })}
    </div>
  );
}

function AssistanceEditor({
  domains, canEdit, onChange,
}: {
  domains: AssistanceRow[];
  canEdit: boolean;
  onChange: (d: AssistanceRow[]) => void;
}) {
  function patch(i: number, patch: Partial<AssistanceRow>) {
    onChange(domains.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-3">
      {domains.map((row, i) => {
        const label = ASSISTANCE_DOMAINS.find((d) => d.key === row.domain)?.label ?? row.domain;
        return (
          <div key={row.domain} className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--line)" }}>
            <h3 className="text-xs font-semibold text-[--brand-800]">{label}</h3>
            {canEdit ? (
              <>
                <div>
                  <Label className="text-xs">Independence level</Label>
                  <Select value={row.level || undefined} onValueChange={(v) => patch(i, { level: v })}>
                    <SelectTrigger><SelectValue placeholder="Select level…" /></SelectTrigger>
                    <SelectContent>
                      {ASSISTANCE_LEVELS.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Routine notes</Label>
                  <Textarea rows={2} value={row.routineNotes} onChange={(e) => patch(i, { routineNotes: e.target.value })} />
                </div>
              </>
            ) : (
              <>
                <p className="text-sm">
                  {ASSISTANCE_LEVELS.find((l) => l.value === row.level)?.label ?? (row.level || "—")}
                </p>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{row.routineNotes || "—"}</p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MiniField({
  label, value, canEdit, onChange, textarea, type, placeholder,
}: {
  label: string;
  value: string;
  canEdit: boolean;
  onChange: (v: string) => void;
  textarea?: boolean;
  type?: string;
  placeholder?: string;
}) {
  if (!canEdit) {
    return (
      <div className={textarea ? "md:col-span-2" : ""}>
        <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
        <p className="text-sm whitespace-pre-wrap">{value || "—"}</p>
      </div>
    );
  }
  return (
    <div className={textarea ? "col-span-full" : ""}>
      <Label className="text-[10px]">{label}</Label>
      {textarea ? (
        <Textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <Input type={type ?? "text"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}

/** Sticky section jump list for long assessments. */
export function CarePlanSectionNav({ sections }: { sections: CarePlanSectionDef[] }) {
  return (
    <nav className="uc-card p-3" aria-label="Assessment sections">
      <h2 className="uc-label mb-2">Sections</h2>
      <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
        {sections.map((s) => (
          <li key={s.key}>
            <a
              href={`#cp-${s.key}`}
              className="uc-focus block rounded-md px-2 py-1 text-xs text-[--brand-800] hover:bg-[--brand-50]"
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
