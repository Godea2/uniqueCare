import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AiSectionBadge, fmtDateTime } from "@/components/common";
import {
  CHECKLIST_CHANGE_OPTIONS,
  REVIEW_CHECKLIST_AREAS,
  type CarePlanReviewContent,
  type ChecklistChange,
  type ReviewChecklistContent,
  type ReviewFieldDef,
  type ReviewSectionDef,
} from "@contracts/care-plan-review";
import { sectionIsAiDrafted, type AiProvenance } from "@contracts/ai-provenance";

type Props = {
  sections: ReviewSectionDef[];
  content: CarePlanReviewContent;
  canEdit: boolean;
  onChange: (next: CarePlanReviewContent) => void;
  aiProvenance?: unknown | null;
};

export default function ReviewReportForm({ sections, content, canEdit, onChange, aiProvenance }: Props) {
  function patchSection(key: string, patch: Record<string, unknown>) {
    onChange({ ...content, [key]: { ...(content[key] ?? {}), ...patch } });
  }

  return (
    <div className="space-y-3">
      {sections.map((sec) => {
        const aiMeta = (aiProvenance as AiProvenance | null | undefined)?.sections?.[sec.key];
        const isAi = sectionIsAiDrafted(aiProvenance, sec.key);
        return (
        <section key={sec.key} id={`rv-${sec.key}`} className="uc-card p-4">
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

          {sec.layout === "checklist" ? (
            <ChecklistEditor
              areas={(content[sec.key]?.areas as ReviewChecklistContent | undefined) ?? {}}
              canEdit={canEdit}
              onChange={(areas) => patchSection(sec.key, { areas })}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(sec.fields ?? []).map((f) => (
                <Field
                  key={f.key}
                  field={f}
                  value={String(content[sec.key]?.[f.key] ?? "")}
                  canEdit={canEdit}
                  onChange={(v) => patchSection(sec.key, { [f.key]: v })}
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
  field: ReviewFieldDef;
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

  const id = `rvf-${field.key}`;
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
            {(field.options ?? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]).map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          type={field.type === "date" ? "date" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={warn ? "border-amber-400 bg-amber-50/40" : ""}
        />
      )}
    </div>
  );
}

function ChecklistEditor({
  areas, canEdit, onChange,
}: {
  areas: ReviewChecklistContent;
  canEdit: boolean;
  onChange: (a: ReviewChecklistContent) => void;
}) {
  function patch(key: string, patch: Partial<{ change: ChecklistChange; notes: string }>) {
    const cur = areas[key] ?? { change: "no_change" as ChecklistChange, notes: "" };
    onChange({ ...areas, [key]: { ...cur, ...patch } });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
            <th className="py-2 pr-2 font-medium">Area</th>
            <th className="py-2 pr-2 font-medium w-36">Change</th>
            <th className="py-2 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {REVIEW_CHECKLIST_AREAS.map((a) => {
            const row = areas[a.key] ?? { change: "no_change" as ChecklistChange, notes: "" };
            return (
              <tr key={a.key} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                <td className="py-2 pr-2 align-top font-medium text-[--brand-900]">{a.label}</td>
                <td className="py-2 pr-2 align-top">
                  {canEdit ? (
                    <Select value={row.change} onValueChange={(v) => patch(a.key, { change: v as ChecklistChange })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CHECKLIST_CHANGE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs">{CHECKLIST_CHANGE_OPTIONS.find((o) => o.value === row.change)?.label ?? row.change}</span>
                  )}
                </td>
                <td className="py-2 align-top">
                  {canEdit ? (
                    <Input
                      className="h-8 text-xs"
                      value={row.notes}
                      onChange={(e) => patch(a.key, { notes: e.target.value })}
                      placeholder={row.change === "changed" ? "What changed?" : ""}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">{row.notes || "—"}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ReviewSectionNav({ sections }: { sections: ReviewSectionDef[] }) {
  return (
    <nav className="uc-card p-3" aria-label="Review sections">
      <h2 className="uc-label mb-2">Sections</h2>
      <ul className="space-y-1 max-h-[50vh] overflow-y-auto">
        {sections.map((s) => (
          <li key={s.key}>
            <a href={`#rv-${s.key}`} className="uc-focus block rounded-md px-2 py-1 text-xs text-[--brand-800] hover:bg-[--brand-50]">
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
