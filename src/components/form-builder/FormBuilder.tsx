import { useEffect, useRef, useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FIELD_TYPES, DISPLAY_TYPES, conditionMet, isRequirementField,
  type FormField, type FormSchemaDoc, type FormSection, type FieldType,
} from "@contracts/form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  GripVertical, Plus, Trash2, Copy, Lock, Undo2, Redo2, Eye, Pencil,
  ChevronDown, ChevronUp, Smartphone, Monitor, Check, X,
} from "lucide-react";
import { toast } from "sonner";

const TYPE_LABELS: Record<FieldType, string> = {
  short_text: "Short text", long_text: "Long text", email: "Email", uk_phone: "UK phone",
  number: "Number", date: "Date", uk_postcode: "UK postcode",
  single_choice: "Single choice", multiple_choice: "Multiple choice", yes_no: "Yes / No",
  availability_grid: "Availability grid", rating: "Rating (1–5)", file_upload: "File upload",
  consent: "Consent checkbox", heading: "Heading", paragraph: "Paragraph", image: "Image", divider: "Divider",
};

let uid = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${(uid++).toString(36)}`;

type SuggestedQ = { id: string; type: string; label: string; required: boolean; locked: boolean; useInAi: boolean; options?: { value: string; label: string }[]; rationale?: string };

export function FormBuilder({ title, schema: initial, backLabel, onBack, onSave, onPublish, onSuggest, publishLabel, extraActions, versions }: {
  title: string;
  schema: FormSchemaDoc;
  backLabel: string | null;
  onBack: (() => void) | null;
  onSave: (schema: FormSchemaDoc) => Promise<unknown>;
  onPublish?: (schema: FormSchemaDoc) => Promise<unknown>;
  onSuggest?: () => Promise<SuggestedQ[]>;
  publishLabel: string;
  extraActions?: React.ReactNode;
  versions?: { id: number | bigint; version: number; publishedBy: string | null; createdAt: string | Date }[];
}) {
  const [doc, setDoc] = useState<FormSchemaDoc>(initial);
  const [past, setPast] = useState<FormSchemaDoc[]>([]);
  const [future, setFuture] = useState<FormSchemaDoc[]>([]);
  const [sel, setSel] = useState<{ section: number; field: number } | null>(null);
  const [preview, setPreview] = useState(false);
  const [previewMobile, setPreviewMobile] = useState(true);
  const [testAnswers, setTestAnswers] = useState<Record<string, unknown>>({});
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const [publishing, setPublishing] = useState(false);
  const [deleteFieldWarn, setDeleteFieldWarn] = useState<{ s: number; f: number } | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedQ[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstLoad = useRef(true);

  // autosave draft (debounced) — skip the initial mount
  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; return; }
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      try { await onSave(doc); setSaveState("saved"); } catch { setSaveState("dirty"); }
    }, 1200);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  const mutate = (fn: (d: FormSchemaDoc) => FormSchemaDoc) => {
    setPast((p) => [...p.slice(-29), doc]);
    setFuture([]);
    setDoc(fn(doc));
  };
  const undo = () => { if (!past.length) return; setFuture((f) => [doc, ...f]); setDoc(past[past.length - 1]); setPast((p) => p.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setPast((p) => [...p, doc]); setDoc(future[0]); setFuture((f) => f.slice(1)); };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const selected: FormField | null = sel ? doc.sections[sel.section]?.fields[sel.field] ?? null : null;

  const addField = (type: FieldType, sectionIdx: number) => {
    const base: FormField = {
      id: nid("f"), type, label: TYPE_LABELS[type], required: false, locked: false, useInAi: false,
      ...(type === "single_choice" || type === "multiple_choice"
        ? { options: [{ value: "option_1", label: "Option 1" }, { value: "option_2", label: "Option 2" }] }
        : {}),
      ...(type === "long_text" ? { validation: { minChars: 0, maxChars: 2000 } } : {}),
      ...(type === "file_upload" ? { validation: { fileTypes: [".pdf", ".doc", ".docx"], maxMb: 10 } } : {}),
    };
    mutate((d) => ({
      ...d,
      sections: d.sections.map((s, i) => i === sectionIdx ? { ...s, fields: [...s.fields, base] } : s),
    }));
    setSel({ section: sectionIdx, field: doc.sections[sectionIdx].fields.length });
  };

  const updateField = (s: number, f: number, patch: Partial<FormField>) =>
    mutate((d) => ({
      ...d,
      sections: d.sections.map((sec, i) => i === s
        ? { ...sec, fields: sec.fields.map((fl, j) => j === f ? { ...fl, ...patch } : fl) }
        : sec),
    }));

  const moveField = (s: number, from: number, to: number) =>
    mutate((d) => ({
      ...d,
      sections: d.sections.map((sec, i) => i === s ? { ...sec, fields: arrayMove(sec.fields, from, to) } : sec),
    }));

  const onSectionDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = doc.sections.map((s) => s.id);
    mutate((d) => ({ ...d, sections: arrayMove(d.sections, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))) }));
  };

  const publish = async () => {
    if (!onPublish) return;
    setPublishing(true);
    try { await onPublish(doc); } finally { setPublishing(false); }
  };

  const runSuggest = async () => {
    if (!onSuggest) return;
    setSuggesting(true);
    try {
      const qs = await onSuggest();
      setSuggestions(qs.map((q) => ({ ...q })));
      setSuggestOpen(true);
    } finally { setSuggesting(false); }
  };

  return (
    <div>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {onBack && <Button variant="ghost" size="sm" onClick={onBack}>← {backLabel}</Button>}
        {title && <h2 className="font-semibold text-[--brand-900] mr-auto">{title}</h2>}
        <span className={`text-xs ${saveState === "saved" ? "text-green-600" : saveState === "saving" ? "text-muted-foreground" : "text-amber-600"}`}>
          {saveState === "saved" ? "Draft saved" : saveState === "saving" ? "Saving…" : "Unsaved changes…"}
        </span>
        <Button size="sm" variant="ghost" onClick={undo} disabled={!past.length} aria-label="Undo"><Undo2 className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={redo} disabled={!future.length} aria-label="Redo"><Redo2 className="h-4 w-4" /></Button>
        <Button size="sm" variant={preview ? "default" : "outline"} onClick={() => setPreview((p) => !p)}>
          {preview ? <Pencil className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
          {preview ? "Back to editor" : "Preview / fill as test"}
        </Button>
        {onSuggest && (
          <Button size="sm" variant="outline" onClick={runSuggest} disabled={suggesting}>
            {suggesting ? "Thinking…" : "Suggest questions from the job description"}
          </Button>
        )}
        {extraActions}
        {onPublish && (
          <Button size="sm" onClick={publish} disabled={publishing}>
            {publishing ? "Publishing…" : publishLabel}
          </Button>
        )}
      </div>

      {preview ? (
        <div className="flex flex-col items-center">
          <div className="flex gap-1 mb-3 rounded-full border bg-white p-1" style={{ borderColor: "var(--card-line)" }}>
            <button className={`rounded-full px-3 py-1 text-xs flex items-center gap-1 ${previewMobile ? "bg-[--brand-600] text-white" : ""}`}
              onClick={() => setPreviewMobile(true)}><Smartphone className="h-3.5 w-3.5" /> Mobile</button>
            <button className={`rounded-full px-3 py-1 text-xs flex items-center gap-1 ${!previewMobile ? "bg-[--brand-600] text-white" : ""}`}
              onClick={() => setPreviewMobile(false)}><Monitor className="h-3.5 w-3.5" /> Desktop</button>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Test mode — answers are not submitted and no application is created.</p>
          <div className={`rounded-2xl border bg-white p-5 ${previewMobile ? "w-[360px]" : "w-full max-w-2xl"}`} style={{ borderColor: "var(--card-line)" }}>
            {doc.introText && <p className="text-sm text-slate-600 mb-4">{doc.introText}</p>}
            {doc.sections.map((s) => (
              <div key={s.id} className="mb-5">
                <h3 className="font-semibold text-[--brand-900]">{s.title}</h3>
                {s.description && <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>}
                <div className="mt-2 space-y-3">
                  {s.fields.filter((f) => conditionMet(f, testAnswers)).map((f) => (
                    <PreviewField key={f.id} field={f} value={testAnswers[f.id]}
                      onChange={(v) => setTestAnswers((a) => ({ ...a, [f.id]: v }))} />
                  ))}
                </div>
              </div>
            ))}
            {doc.thankYouText && <p className="text-xs text-muted-foreground border-t pt-3" style={{ borderColor: "var(--card-line)" }}>Thank-you message: {doc.thankYouText}</p>}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          {/* canvas */}
          <div data-tour="form-canvas">
            {/* branding */}
            <div className="uc-card p-4 mb-4">
              <p className="uc-label mb-2">Branding & messages</p>
              <Label htmlFor="fb-intro">Introduction shown at the top of the form</Label>
              <Textarea id="fb-intro" rows={2} value={doc.introText ?? ""} onChange={(e) => mutate((d) => ({ ...d, introText: e.target.value }))} />
              <Label htmlFor="fb-ty" className="mt-2">Thank-you message after submission</Label>
              <Textarea id="fb-ty" rows={2} value={doc.thankYouText ?? ""} onChange={(e) => mutate((d) => ({ ...d, thankYouText: e.target.value }))} />
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSectionDragEnd}>
              <SortableContext items={doc.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {doc.sections.map((s, si) => (
                  <SectionCard key={s.id} section={s}
                    onRename={(t) => mutate((d) => ({ ...d, sections: d.sections.map((x, i) => i === si ? { ...x, title: t } : x) }))}
                    onDescription={(t) => mutate((d) => ({ ...d, sections: d.sections.map((x, i) => i === si ? { ...x, description: t } : x) }))}
                    onDelete={() => mutate((d) => ({ ...d, sections: d.sections.filter((_, i) => i !== si) }))}
                    onDuplicate={() => mutate((d) => ({
                      ...d,
                      sections: [
                        ...d.sections.slice(0, si + 1),
                        { ...s, id: nid("sec"), title: `${s.title} (copy)`, fields: s.fields.map((f) => ({ ...f, id: f.locked ? f.id : nid("f"), locked: f.locked })).filter((f, i, arr) => arr.findIndex((x) => x.id === f.id) === i) },
                        ...d.sections.slice(si + 1),
                      ],
                    }))}
                    onMoveUp={si > 0 ? () => mutate((d) => ({ ...d, sections: arrayMove(d.sections, si, si - 1) })) : undefined}
                    onMoveDown={si < doc.sections.length - 1 ? () => mutate((d) => ({ ...d, sections: arrayMove(d.sections, si, si + 1) })) : undefined}
                    selected={sel?.section === si ? sel.field : null}
                    onSelectField={(fi) => setSel({ section: si, field: fi })}
                    onMoveField={(from, to) => moveField(si, from, to)}
                    onDeleteField={(fi) => setDeleteFieldWarn({ s: si, f: fi })}
                    onDuplicateField={(fi) => mutate((d) => ({
                      ...d,
                      sections: d.sections.map((sec, i) => {
                        if (i !== si) return sec;
                        const src = sec.fields[fi];
                        const copy = { ...src, id: nid("f"), locked: false, label: `${src.label} (copy)` };
                        return { ...sec, fields: [...sec.fields.slice(0, fi + 1), copy, ...sec.fields.slice(fi + 1)] };
                      }),
                    }))}
                  />
                ))}
              </SortableContext>
            </DndContext>

            <Button variant="outline" className="w-full mt-3"
              onClick={() => mutate((d) => ({ ...d, sections: [...d.sections, { id: nid("sec"), title: `Section ${d.sections.length + 1}`, fields: [] }] }))}>
              <Plus className="h-4 w-4 mr-1" /> Add section
            </Button>
          </div>

          {/* right rail: palette + field settings */}
          <div className="space-y-4">
            <div className="uc-card p-4">
              <p className="uc-label mb-2">Add a field</p>
              {sel || doc.sections.length > 0 ? (
                <>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Adds to: <strong>{doc.sections[sel?.section ?? doc.sections.length - 1]?.title}</strong>
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FIELD_TYPES.map((t) => (
                      <button key={t}
                        className="rounded-lg border px-2 py-1.5 text-[11px] text-left hover:bg-slate-50 hover:border-[--brand-400]"
                        style={{ borderColor: "var(--card-line)" }}
                        onClick={() => addField(t, sel?.section ?? doc.sections.length - 1)}>
                        {TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </>
              ) : <p className="text-xs text-muted-foreground">Add a section first.</p>}
            </div>

            {selected && sel && (
              <FieldSettings
                field={selected}
                allFields={doc.sections.flatMap((s) => s.fields).filter((f) => !DISPLAY_TYPES.includes(f.type) && f.id !== selected.id)}
                onChange={(patch) => updateField(sel.section, sel.field, patch)}
                onClose={() => setSel(null)}
              />
            )}
          </div>
        </div>
      )}

      {/* warn before deleting fields */}
      <AlertDialog open={!!deleteFieldWarn} onOpenChange={(o) => !o && setDeleteFieldWarn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this field?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFieldWarn && doc.sections[deleteFieldWarn.s]?.fields[deleteFieldWarn.f]
                ? `“${doc.sections[deleteFieldWarn.s].fields[deleteFieldWarn.f].label}” will be removed from the form. Answers already submitted by applicants are kept and stay visible on their applications, but new applicants will not see this question.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep field</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (deleteFieldWarn) {
                mutate((d) => ({
                  ...d,
                  sections: d.sections.map((sec, i) => i === deleteFieldWarn.s
                    ? { ...sec, fields: sec.fields.filter((_, j) => j !== deleteFieldWarn.f) } : sec),
                }));
                setSel(null);
              }
              setDeleteFieldWarn(null);
            }}>Delete field</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI suggestions */}
      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Suggested questions</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Accept, edit or discard each suggestion. Accepted questions are added to the last section.</p>
          <div className="space-y-3 mt-2">
            {suggestions.map((q, i) => (
              <div key={q.id} className="rounded-xl border p-3" style={{ borderColor: "var(--card-line)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <Input value={q.label} onChange={(e) => setSuggestions((ss) => ss.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      className="text-sm font-medium" aria-label="Suggested question" />
                    <p className="mt-1 text-[11px] text-muted-foreground">{TYPE_LABELS[q.type as FieldType] ?? q.type}{q.rationale ? ` — ${q.rationale}` : ""}</p>
                    {q.options && <p className="text-[11px] text-muted-foreground">Options: {q.options.map((o) => o.label).join(", ")}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="h-7 px-2" aria-label="Accept suggestion"
                      onClick={() => {
                        const { rationale: _r, ...field } = q;
                        mutate((d) => ({
                          ...d,
                          sections: d.sections.map((s, si) => si === d.sections.length - 1
                            ? { ...s, fields: [...s.fields, field as FormField] } : s),
                        }));
                        setSuggestions((ss) => ss.filter((_, j) => j !== i));
                        toast.success("Question added");
                      }}>
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" aria-label="Discard suggestion"
                      onClick={() => setSuggestions((ss) => ss.filter((_, j) => j !== i))}>
                      <X className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {suggestions.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">All suggestions handled.</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSuggestOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {versions && versions.length > 0 && (
        <p className="mt-4 text-[11px] text-muted-foreground">
          Version history: {versions.map((v) => `v${v.version} (${new Date(v.createdAt).toLocaleDateString("en-GB")}${v.publishedBy ? `, ${v.publishedBy}` : ""})`).join(" · ")}
        </p>
      )}
    </div>
  );
}

// ── Section card ────────────────────────────────────────────────────────────
function SectionCard({ section: s, onRename, onDescription, onDelete, onDuplicate, onMoveUp, onMoveDown, selected, onSelectField, onMoveField, onDeleteField, onDuplicateField }: {
  section: FormSection;
  onRename: (t: string) => void; onDescription: (t: string) => void;
  onDelete: () => void; onDuplicate: () => void;
  onMoveUp?: () => void; onMoveDown?: () => void;
  selected: number | null; onSelectField: (i: number) => void;
  onMoveField: (from: number, to: number) => void;
  onDeleteField: (i: number) => void; onDuplicateField: (i: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: s.id });
  const [open, setOpen] = useState(true);
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className="uc-card p-4 mb-3">
      <div className="flex items-center gap-2">
        <button {...attributes} {...listeners} className="cursor-grab text-slate-400 hover:text-slate-600" aria-label={`Drag section ${s.title}`}>
          <GripVertical className="h-4 w-4" />
        </button>
        <Input value={s.title} onChange={(e) => onRename(e.target.value)} className="h-8 font-medium flex-1" aria-label="Section title" />
        <button onClick={() => setOpen((o) => !o)} aria-label="Collapse section" className="text-slate-400">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onMoveUp} disabled={!onMoveUp} aria-label="Move section up"><ChevronUp className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onMoveDown} disabled={!onMoveDown} aria-label="Move section down"><ChevronDown className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onDuplicate} aria-label="Duplicate section"><Copy className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onDelete} aria-label="Delete section"><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
      </div>
      {open && (
        <>
          <Input value={s.description ?? ""} onChange={(e) => onDescription(e.target.value)}
            placeholder="Section description (optional)" className="h-7 mt-2 text-xs" aria-label="Section description" />
          <div className="mt-2 space-y-1.5">
            {s.fields.map((f, fi) => (
              <div key={f.id}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer ${selected === fi ? "border-[--brand-500] bg-[--brand-50]" : "bg-white hover:bg-slate-50"}`}
                style={{ borderColor: selected === fi ? undefined : "var(--card-line)" }}
                onClick={() => onSelectField(fi)}
                role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onSelectField(fi)}>
                <span className="flex-1 truncate">
                  {f.label}
                  <span className="ml-2 text-[10px] text-muted-foreground">{TYPE_LABELS[f.type]}</span>
                  {f.required && <span className="ml-1 text-red-500">*</span>}
                </span>
                {f.locked && (
                  <span title="Core field — cannot be deleted (you can edit the label)">
                    <Lock className="h-3.5 w-3.5 text-slate-400" aria-label="Locked core field" />
                  </span>
                )}
                {f.knockoutRule && <span className="rounded-full bg-amber-100 text-amber-800 px-1.5 text-[10px]">knockout</span>}
                {f.useInAi && <span className="rounded-full bg-[--brand-50] text-[--brand-700] px-1.5 text-[10px]">AI</span>}
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={fi === 0}
                  onClick={(e) => { e.stopPropagation(); onMoveField(fi, fi - 1); }} aria-label="Move field up"><ChevronUp className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={fi === s.fields.length - 1}
                  onClick={(e) => { e.stopPropagation(); onMoveField(fi, fi + 1); }} aria-label="Move field down"><ChevronDown className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={f.locked}
                  onClick={(e) => { e.stopPropagation(); onDuplicateField(fi); }} aria-label="Duplicate field"><Copy className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={f.locked}
                  title={f.locked ? "Core field — cannot be deleted" : "Delete field"}
                  onClick={(e) => { e.stopPropagation(); if (!f.locked) onDeleteField(fi); }} aria-label="Delete field">
                  <Trash2 className={`h-3 w-3 ${f.locked ? "text-slate-300" : "text-red-500"}`} />
                </Button>
              </div>
            ))}
            {s.fields.length === 0 && <p className="text-xs text-muted-foreground py-2">No fields yet — pick one from the palette on the right.</p>}
          </div>
        </>
      )}
    </div>
  );
}

// ── Field settings panel ────────────────────────────────────────────────────
function FieldSettings({ field: f, allFields, onChange, onClose }: {
  field: FormField;
  allFields: FormField[];
  onChange: (p: Partial<FormField>) => void;
  onClose: () => void;
}) {
  const isDisplay = DISPLAY_TYPES.includes(f.type);
  const fromRequirement = isRequirementField(f);
  return (
    <div className="uc-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="uc-label">Field settings {f.locked && <Lock className="inline h-3 w-3 ml-1 text-slate-400" />}</p>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onClose} aria-label="Close settings"><X className="h-3.5 w-3.5" /></Button>
      </div>
      <div className="space-y-3">
        <div>
          <Label>Label</Label>
          <Input value={f.label} disabled={fromRequirement} onChange={(e) => onChange({ label: e.target.value })} />
          {fromRequirement ? (
            <p className="text-[10px] text-muted-foreground mt-0.5">This question comes from the job's screening requirements. Change its wording, or remove it, by editing the job.</p>
          ) : f.locked && <p className="text-[10px] text-muted-foreground mt-0.5">Core field — the label is editable, but the field cannot be deleted and stays required.</p>}
        </div>
        {!isDisplay && (
          <>
            <div>
              <Label>Help text</Label>
              <Input value={f.help ?? ""} onChange={(e) => onChange({ help: e.target.value || undefined })} />
            </div>
            {["short_text", "long_text", "email", "uk_phone", "number", "uk_postcode"].includes(f.type) && (
              <div>
                <Label>Placeholder</Label>
                <Input value={f.placeholder ?? ""} onChange={(e) => onChange({ placeholder: e.target.value || undefined })} />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={f.required} disabled={f.locked} onCheckedChange={(v) => onChange({ required: v })} />
              Required
            </label>
          </>
        )}
        {(f.type === "single_choice" || f.type === "multiple_choice") && (
          <div>
            <Label>Options (one per line)</Label>
            <Textarea rows={4}
              value={(f.options ?? []).map((o) => o.label).join("\n")}
              onChange={(e) => onChange({
                options: e.target.value.split("\n").filter(Boolean).map((label) => ({
                  label,
                  value: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "").slice(0, 40) || "option",
                })),
              })} />
          </div>
        )}
        {f.type === "long_text" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Min characters</Label>
              <Input type="number" min={0} value={f.validation?.minChars ?? 0}
                onChange={(e) => onChange({ validation: { ...f.validation, minChars: Number(e.target.value) } })} />
            </div>
            <div>
              <Label>Max characters</Label>
              <Input type="number" min={1} value={f.validation?.maxChars ?? 2000}
                onChange={(e) => onChange({ validation: { ...f.validation, maxChars: Number(e.target.value) } })} />
            </div>
          </div>
        )}
        {f.type === "number" && (
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Min</Label><Input type="number" value={f.validation?.min ?? ""} onChange={(e) => onChange({ validation: { ...f.validation, min: e.target.value === "" ? undefined : Number(e.target.value) } })} /></div>
            <div><Label>Max</Label><Input type="number" value={f.validation?.max ?? ""} onChange={(e) => onChange({ validation: { ...f.validation, max: e.target.value === "" ? undefined : Number(e.target.value) } })} /></div>
          </div>
        )}
        {f.type === "file_upload" && (
          <div>
            <Label>Max file size (MB)</Label>
            <Input type="number" min={0.5} max={25} value={f.validation?.maxMb ?? 10}
              onChange={(e) => onChange({ validation: { ...f.validation, maxMb: Number(e.target.value) } })} />
            <p className="text-[10px] text-muted-foreground mt-0.5">Accepted: PDF, DOC, DOCX</p>
          </div>
        )}
        {!isDisplay && (
          <>
            <div className="border-t pt-3" style={{ borderColor: "var(--card-line)" }}>
              <Label>Show only if…</Label>
              <div className="flex gap-1.5 mt-1">
                <Select value={f.condition?.fieldId ?? ""} onValueChange={(v) => onChange({ condition: v ? { fieldId: v, op: f.condition?.op ?? "equals", value: f.condition?.value ?? "" } : undefined })}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Always shown" /></SelectTrigger>
                  <SelectContent>
                    {allFields.map((af) => <SelectItem key={af.id} value={af.id}>{af.label.slice(0, 40)}</SelectItem>)}
                  </SelectContent>
                </Select>
                {f.condition && (
                  <>
                    <Select value={f.condition.op} onValueChange={(v) => onChange({ condition: { ...f.condition!, op: v as "equals" | "not_equals" | "contains" | "answered" } })}>
                      <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equals">equals</SelectItem>
                        <SelectItem value="not_equals">not equals</SelectItem>
                        <SelectItem value="contains">contains</SelectItem>
                        <SelectItem value="answered">is answered</SelectItem>
                      </SelectContent>
                    </Select>
                    {f.condition.op !== "answered" && (
                      <Input className="h-8 text-xs w-24" value={f.condition.value ?? ""} placeholder="value"
                        onChange={(e) => onChange({ condition: { ...f.condition!, value: e.target.value } })} />
                    )}
                  </>
                )}
              </div>
              {f.condition && (
                <Button size="sm" variant="ghost" className="text-xs mt-1 h-6" onClick={() => onChange({ condition: undefined })}>Remove condition</Button>
              )}
            </div>

            <div className="border-t pt-3 space-y-2" style={{ borderColor: "var(--card-line)" }}>
              <p className="uc-label">Screening</p>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={f.useInAi} disabled={fromRequirement} onCheckedChange={(v) => onChange({ useInAi: v })} />
                Use in AI screening
              </label>
              {f.useInAi && !fromRequirement && (
                <div>
                  <Label>Maps to requirement (optional)</Label>
                  <Input value={f.requirementKey ?? ""} placeholder="e.g. right_to_work"
                    onChange={(e) => onChange({ requirementKey: e.target.value || undefined })} />
                </div>
              )}
              <div>
                <Label>Knockout rule (flags for human review — never auto-rejects)</Label>
                <div className="flex gap-1.5 mt-1">
                  <Select value={f.knockoutRule ? "set" : ""} onValueChange={(v) => onChange({ knockoutRule: v === "set" ? { op: "equals", value: "no", message: "" } : undefined })}>
                    <SelectTrigger className="h-8 text-xs w-24"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="set">When answer…</SelectItem>
                    </SelectContent>
                  </Select>
                  {f.knockoutRule && (
                    <>
                      <Select value={f.knockoutRule.op} onValueChange={(v) => onChange({ knockoutRule: { ...f.knockoutRule!, op: v as "equals" | "not_equals" | "contains" } })}>
                        <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equals">equals</SelectItem>
                          <SelectItem value="not_equals">not equals</SelectItem>
                          <SelectItem value="contains">contains</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input className="h-8 text-xs w-20" value={f.knockoutRule.value} placeholder="value"
                        onChange={(e) => onChange({ knockoutRule: { ...f.knockoutRule!, value: e.target.value } })} />
                    </>
                  )}
                </div>
                {f.knockoutRule && (
                  <Input className="h-8 text-xs mt-1" value={f.knockoutRule.message} placeholder="Flag message shown to reviewers"
                    onChange={(e) => onChange({ knockoutRule: { ...f.knockoutRule!, message: e.target.value } })} />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Preview field (simplified renderer for test-fill mode) ─────────────────
function PreviewField({ field: f, value, onChange }: { field: FormField; value: unknown; onChange: (v: unknown) => void }) {
  if (f.type === "heading") return <h4 className="font-semibold">{f.label}</h4>;
  if (f.type === "paragraph") return <p className="text-sm text-slate-600">{f.label}</p>;
  if (f.type === "divider") return <hr style={{ borderColor: "var(--card-line)" }} />;
  if (f.type === "image") return f.imageKey ? <img src={f.imageKey} alt="" className="rounded-xl" /> : null;
  if (f.type === "yes_no") {
    return (
      <div>
        <Label>{f.label}{f.required ? " *" : ""}</Label>
        <div className="flex gap-2 mt-1">
          {["yes", "no"].map((v) => (
            <button key={v} type="button" onClick={() => onChange(v)}
              className={`rounded-full border px-4 py-1.5 text-xs ${value === v ? "bg-[--brand-600] text-white border-[--brand-600]" : "bg-white"}`}
              style={value === v ? undefined : { borderColor: "var(--card-line)" }}>
              {v === "yes" ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (f.type === "consent") {
    return (
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={value === true} onCheckedChange={(v) => onChange(v === true)} />
        <span>{f.label}{f.required ? " *" : ""}</span>
      </label>
    );
  }
  if (f.type === "single_choice") {
    return (
      <div>
        <Label>{f.label}{f.required ? " *" : ""}</Label>
        <Select value={String(value ?? "")} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>{(f.options ?? []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    );
  }
  if (f.type === "multiple_choice") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div>
        <Label>{f.label}{f.required ? " *" : ""}</Label>
        <div className="space-y-1 mt-1">
          {(f.options ?? []).map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <Checkbox checked={arr.includes(o.value)} onCheckedChange={(v) => onChange(v === true ? [...arr, o.value] : arr.filter((x) => x !== o.value))} />
              {o.label}
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (f.type === "long_text") {
    return (
      <div>
        <Label>{f.label}{f.required ? " *" : ""}</Label>
        <Textarea rows={3} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (f.type === "rating") {
    return (
      <div>
        <Label>{f.label}{f.required ? " *" : ""}</Label>
        <div className="flex gap-1 mt-1">
          {[1, 2, 3, 4, 5].map((v) => (
            <button key={v} type="button" onClick={() => onChange(v)}
              className={`h-8 w-8 rounded-full border text-xs ${Number(value ?? 0) >= v ? "bg-[--brand-600] text-white border-[--brand-600]" : "bg-white"}`}
              style={Number(value ?? 0) >= v ? undefined : { borderColor: "var(--card-line)" }}>{v}</button>
          ))}
        </div>
      </div>
    );
  }
  if (f.type === "availability_grid") {
    return (
      <div>
        <Label>{f.label}{f.required ? " *" : ""}</Label>
        <p className="text-[11px] text-muted-foreground">(availability grid — shown to applicants as a tick-grid)</p>
      </div>
    );
  }
  if (f.type === "file_upload") {
    return (
      <div>
        <Label>{f.label}{f.required ? " *" : ""}</Label>
        <p className="text-[11px] text-muted-foreground">(file upload — applicants attach a file here)</p>
      </div>
    );
  }
  return (
    <div>
      <Label>{f.label}{f.required ? " *" : ""}</Label>
      <Input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={String(value ?? "")}
        placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
      {f.help && <p className="text-[10px] text-muted-foreground mt-0.5">{f.help}</p>}
    </div>
  );
}
