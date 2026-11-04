import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, EmptyState, Chip, fmtDate } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { RouterOutputs } from "@/lib/router-types";
import { ConfirmDelete, rowStyle, thClass } from "./shared";
import { MediaField } from "./MediaPicker";

type Section = RouterOutputs["website"]["sections"]["list"]["items"][number];
type Content = Record<string, unknown>;
const STATUSES = ["draft", "published", "archived"] as const;
const PAGE_KEYS = ["home", "about", "careers", "contact"] as const;

/* ── Content shape helpers ─────────────────────────────────────────────────── */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isItems = (v: unknown): v is Item[] => Array.isArray(v) && v.every(isObj);

type Item = Record<string, unknown>;
type Cta = Record<string, unknown>;

type StringKey = "eyebrow" | "title" | "subtitle" | "text" | "videoSrc" | "poster" | "image" | "imageAlt";
type FieldKey = StringKey | "videos" | "paragraphs" | "primaryCta" | "secondaryCta" | "items";

const FIELD_ORDER: FieldKey[] = [
  "eyebrow", "title", "subtitle", "text", "paragraphs",
  "videoSrc", "poster", "videos", "image", "imageAlt",
  "primaryCta", "secondaryCta", "items",
];

const FIELD_LABEL: Record<FieldKey, string> = {
  eyebrow: "Eyebrow", title: "Title", subtitle: "Subtitle", text: "Text",
  paragraphs: "Paragraphs", videoSrc: "Video", poster: "Video poster image", videos: "Videos",
  image: "Image", imageAlt: "Image alt text", primaryCta: "Primary button", secondaryCta: "Secondary button",
  items: "Items",
};

const FIELD_MATCH: Record<FieldKey, (v: unknown) => boolean> = {
  eyebrow: isStr, title: isStr, subtitle: isStr, text: isStr,
  videoSrc: isStr, poster: isStr, image: isStr, imageAlt: isStr,
  videos: isStrArr, paragraphs: isStrArr,
  primaryCta: isObj, secondaryCta: isObj, items: isItems,
};

const FIELD_DEFAULT: Record<FieldKey, unknown> = {
  eyebrow: "", title: "", subtitle: "", text: "",
  videoSrc: "", poster: "", image: "", imageAlt: "",
  videos: [], paragraphs: [],
  primaryCta: { label: "", href: "" }, secondaryCta: { label: "", href: "" },
  items: [],
};

/** Drop empty strings, empty arrays and empty CTA objects for the typed fields before saving. */
function cleanContent(content: Content): Content {
  const out: Content = { ...content };
  for (const key of FIELD_ORDER) {
    if (!(key in out) || !FIELD_MATCH[key](out[key])) continue;
    const v = out[key];
    if (isStr(v)) {
      if (!v.trim()) delete out[key];
      else out[key] = v.trim();
    } else if (isStrArr(v)) {
      const arr = v.map((s) => s.trim()).filter(Boolean);
      if (arr.length === 0) delete out[key];
      else out[key] = arr;
    } else if (key === "primaryCta" || key === "secondaryCta") {
      const cta = cleanObj(v as Cta);
      if (!cta.label && !cta.href) delete out[key];
      else out[key] = cta;
    } else if (key === "items") {
      const items = (v as Item[]).map(cleanObj).filter((i) => Object.keys(i).length > 0);
      if (items.length === 0) delete out[key];
      else out[key] = items;
    }
  }
  return out;
}

/** Trim strings and remove empty-string keys from a small object. */
function cleanObj(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (isStr(v)) {
      if (v.trim()) out[k] = v.trim();
    } else if (v !== undefined && v !== null) {
      out[k] = v;
    }
  }
  return out;
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function PageSections() {
  const utils = trpc.useUtils();
  const [pageKey, setPageKey] = useState<string>("all");
  const q = trpc.website.sections.list.useQuery(
    { pageKey: pageKey === "all" ? undefined : pageKey },
    { placeholderData: keepPreviousData },
  );
  const [editing, setEditing] = useState<Section | "new" | null>(null);
  const [deleting, setDeleting] = useState<Section | null>(null);

  const refresh = () => { void utils.website.sections.list.invalidate(); };
  const del = trpc.website.sections.delete.useMutation({
    onSuccess: () => { refresh(); setDeleting(null); toast.success("Section deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const items = useMemo(
    () => [...(q.data?.items ?? [])].sort((a, b) => a.pageKey.localeCompare(b.pageKey) || a.sortOrder - b.sortOrder),
    [q.data],
  );

  return (
    <div>
      <PageHeader
        title="Page sections"
        subtitle="Editable text, images and videos on the Home, About, Careers and Contact pages. Use the fields in each section, or the advanced JSON editor for full control."
        actions={<Button onClick={() => setEditing("new")}><Plus className="mr-1.5 h-4 w-4" />New section</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Label htmlFor="sec-page" className="text-xs text-muted-foreground">Page</Label>
        <Select value={pageKey} onValueChange={setPageKey}>
          <SelectTrigger id="sec-page" aria-label="Filter by page" className="h-9 w-44 capitalize"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pages</SelectItem>
            {PAGE_KEYS.map((k) => <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? <Loading rows={5} />
        : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : items.length === 0 ? <EmptyState title="No sections" hint="Sections you add here override the website's built-in text." />
        : (
          <>
            <div className="uc-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground" style={rowStyle}>
                    <th className={thClass}>Section</th>
                    <th className={thClass}>Page</th>
                    <th className={thClass}>Order</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>Updated</th>
                    <th className={`${thClass} text-right`}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s.id} className="border-b last:border-0" style={rowStyle}>
                      <td className="max-w-80 px-4 py-2">
                        <p className="truncate font-medium" title={s.label || s.sectionKey}>{s.label || s.sectionKey}</p>
                        <p className="truncate text-xs text-muted-foreground">{s.sectionKey}</p>
                      </td>
                      <td className="px-4 py-2 text-xs capitalize">{s.pageKey}</td>
                      <td className="px-4 py-2 text-xs tabular-nums">{s.sortOrder}</td>
                      <td className="px-4 py-2"><Chip value={s.status} /></td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDate(s.updatedAt)}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setEditing(s)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                          <Button size="sm" variant="ghost" aria-label={`Delete ${s.label || s.sectionKey}`} onClick={() => setDeleting(s)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{items.length} {items.length === 1 ? "section" : "sections"}</p>
          </>
        )}

      {editing && (
        <SectionEditor
          key={editing === "new" ? "new" : editing.id}
          section={editing === "new" ? null : editing}
          defaultPageKey={pageKey === "all" ? "home" : pageKey}
          onClose={() => setEditing(null)}
          onSaved={() => { refresh(); setEditing(null); }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        title="Delete this section?"
        description={<>“{deleting?.label || deleting?.sectionKey}” on the {deleting?.pageKey} page will be removed and the website will fall back to its built-in text.</>}
        busy={del.isPending}
        onConfirm={() => deleting && del.mutate({ id: deleting.id })}
      />
    </div>
  );
}

/* ── Editor ────────────────────────────────────────────────────────────────── */

function SectionEditor({
  section, defaultPageKey, onClose, onSaved,
}: { section: Section | null; defaultPageKey: string; onClose: () => void; onSaved: () => void }) {
  const [pageKey, setPageKey] = useState(section?.pageKey ?? defaultPageKey);
  const [sectionKey, setSectionKey] = useState(section?.sectionKey ?? "");
  const [label, setLabel] = useState(section?.label ?? "");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>((section?.status as (typeof STATUSES)[number]) ?? "published");
  const [sortOrder, setSortOrder] = useState(String(section?.sortOrder ?? 0));

  // The content object is the single source of truth; typed fields and the JSON box both edit it.
  const [content, setContent] = useState<Content>(() => ({ ...(section?.content ?? {}) }));
  const [json, setJson] = useState(() => JSON.stringify(section?.content ?? {}, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const jsonFocused = useRef(false);

  const visibleKeys = FIELD_ORDER.filter((k) => k in content && FIELD_MATCH[k](content[k]));
  const addableKeys = FIELD_ORDER.filter((k) => !(k in content));
  const [advancedOpen, setAdvancedOpen] = useState(() => visibleKeys.length === 0 && Object.keys(content).length > 0);

  // Keep the JSON box in step with typed edits (but never fight the user while they type in it).
  useEffect(() => {
    if (!jsonFocused.current) { setJson(JSON.stringify(content, null, 2)); setJsonError(null); }
  }, [content]);

  const setField = (key: FieldKey, value: unknown) => setContent((c) => ({ ...c, [key]: value }));
  const removeField = (key: FieldKey) => setContent((c) => { const next = { ...c }; delete next[key]; return next; });
  const addField = (key: FieldKey) => setContent((c) => ({ ...c, [key]: FIELD_DEFAULT[key] }));

  const onJsonChange = (text: string) => {
    setJson(text);
    try {
      const parsed: unknown = JSON.parse(text);
      if (!isObj(parsed)) {
        setJsonError("Content must be a JSON object, e.g. { \"title\": \"…\" }.");
        return;
      }
      setJsonError(null);
      setContent(parsed);
    } catch (e) {
      setJsonError(`Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`);
    }
  };

  const upsert = trpc.website.sections.upsert.useMutation({
    onSuccess: () => { toast.success("Section saved"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const isNew = !section;
  const pageKeyOptions = PAGE_KEYS.includes(pageKey as (typeof PAGE_KEYS)[number]) ? PAGE_KEYS : [...PAGE_KEYS, pageKey];

  const strField = (key: StringKey, opts?: { multiline?: boolean; rows?: number }) => {
    const value = isStr(content[key]) ? (content[key] as string) : "";
    const id = `sec-f-${key}`;
    return (
      <FieldShell key={key} id={id} label={FIELD_LABEL[key]} onRemove={() => removeField(key)} wide={opts?.multiline}>
        {opts?.multiline ? (
          <Textarea id={id} value={value} onChange={(e) => setField(key, e.target.value)} rows={opts.rows ?? 3} />
        ) : (
          <Input id={id} value={value} onChange={(e) => setField(key, e.target.value)} />
        )}
      </FieldShell>
    );
  };

  const renderField = (key: FieldKey) => {
    switch (key) {
      case "eyebrow":
      case "title":
      case "subtitle":
      case "imageAlt":
        return strField(key);
      case "text":
        return strField(key, { multiline: true, rows: 3 });
      case "videoSrc":
        return (
          <FieldShell key={key} id="sec-f-videoSrc" label={FIELD_LABEL[key]} onRemove={() => removeField(key)} bare>
            <MediaField id="sec-f-videoSrc" label={FIELD_LABEL[key]} kindFilter="video" value={content.videoSrc as string} onChange={(v) => setField("videoSrc", v)} maxLength={1000} />
          </FieldShell>
        );
      case "poster":
        return (
          <FieldShell key={key} id="sec-f-poster" label={FIELD_LABEL[key]} onRemove={() => removeField(key)} bare>
            <MediaField id="sec-f-poster" label={FIELD_LABEL[key]} kindFilter="image" value={content.poster as string} onChange={(v) => setField("poster", v)} maxLength={1000} />
          </FieldShell>
        );
      case "image":
        return (
          <FieldShell key={key} id="sec-f-image" label={FIELD_LABEL[key]} onRemove={() => removeField(key)} bare>
            <MediaField
              id="sec-f-image" label={FIELD_LABEL[key]} kindFilter="image"
              value={content.image as string} maxLength={1000}
              onChange={(v) => setField("image", v)}
              onAltChange={(alt) => { if (!isStr(content.imageAlt) || !content.imageAlt) setField("imageAlt", alt); }}
            />
          </FieldShell>
        );
      case "videos":
        return (
          <FieldShell key={key} id="sec-f-videos" label={FIELD_LABEL[key]} onRemove={() => removeField(key)} wide>
            <ListTextarea
              id="sec-f-videos" mode="line" rows={4}
              value={content.videos as string[]} onChange={(v) => setField("videos", v)}
              hint="One video URL per line."
            />
          </FieldShell>
        );
      case "paragraphs":
        return (
          <FieldShell key={key} id="sec-f-paragraphs" label={FIELD_LABEL[key]} onRemove={() => removeField(key)} wide>
            <ListTextarea
              id="sec-f-paragraphs" mode="paragraph" rows={6}
              value={content.paragraphs as string[]} onChange={(v) => setField("paragraphs", v)}
              hint="Leave a blank line between paragraphs."
            />
          </FieldShell>
        );
      case "primaryCta":
      case "secondaryCta":
        return (
          <CtaField
            key={key} fieldKey={key} label={FIELD_LABEL[key]}
            value={content[key] as Cta} onChange={(v) => setField(key, v)} onRemove={() => removeField(key)}
          />
        );
      case "items":
        return (
          <ItemsField
            key={key} items={content.items as Item[]}
            onChange={(v) => setField("items", v)} onRemove={() => removeField("items")}
          />
        );
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{section ? "Edit section" : "New section"}</DialogTitle>
          <DialogDescription>
            {section ? <>Page <code>{section.pageKey}</code> · key <code>{section.sectionKey}</code></> : "Page and key together identify the section — saving an existing pair updates it."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (jsonError) { toast.error("Fix the JSON error before saving"); return; }
            const order = Number.parseInt(sortOrder, 10);
            upsert.mutate({
              pageKey,
              sectionKey: sectionKey.trim(),
              label: label.trim(),
              content: cleanContent(content),
              sortOrder: Number.isFinite(order) ? Math.min(9999, Math.max(0, order)) : 0,
              status,
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Page</Label>
              <Select value={pageKey} onValueChange={setPageKey} disabled={!isNew}>
                <SelectTrigger aria-label="Page" className="capitalize"><SelectValue /></SelectTrigger>
                <SelectContent>{pageKeyOptions.map((k) => <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sec-key">Section key</Label>
              <Input id="sec-key" value={sectionKey} onChange={(e) => setSectionKey(e.target.value)} placeholder="e.g. hero" maxLength={60} disabled={!isNew} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sec-label">Label</Label>
              <Input id="sec-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Friendly name shown in this list" maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sec-order">Sort order</Label>
              <Input id="sec-order" type="number" min={0} max={9999} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3 border-t pt-4" style={rowStyle}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[--brand-900]">Content</h3>
              <p className="text-[11px] text-muted-foreground">Empty fields are left out when you save. Other keys in the JSON are kept as they are.</p>
            </div>

            {visibleKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No content fields yet. Add one below, or edit the advanced JSON.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">{visibleKeys.map(renderField)}</div>
            )}

            {addableKeys.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Add field:</span>
                {addableKeys.map((k) => (
                  <Button key={k} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => addField(k)}>
                    <Plus className="mr-1 h-3 w-3" />{FIELD_LABEL[k]}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="border-t pt-3" style={rowStyle}>
            <CollapsibleTrigger asChild>
              <button type="button" className="uc-focus flex w-full items-center justify-between rounded-md py-1 text-left text-sm font-semibold text-[--brand-900]" aria-expanded={advancedOpen}>
                Advanced JSON
                <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} aria-hidden />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="sec-json">Content (JSON)</Label>
                <Button
                  type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs"
                  onClick={() => { if (!jsonError) setJson(JSON.stringify(content, null, 2)); }}
                >
                  Format
                </Button>
              </div>
              <Textarea
                id="sec-json"
                value={json}
                onChange={(e) => onJsonChange(e.target.value)}
                onFocus={() => { jsonFocused.current = true; }}
                onBlur={() => { jsonFocused.current = false; if (!jsonError) setJson(JSON.stringify(content, null, 2)); }}
                rows={14}
                spellCheck={false}
                aria-invalid={!!jsonError}
                aria-describedby={jsonError ? "sec-json-err" : undefined}
                className="font-mono text-[13px]"
              />
              {jsonError && <p id="sec-json-err" role="alert" className="text-xs text-red-600">{jsonError}</p>}
              <p className="text-[11px] text-muted-foreground">Changes here update the fields above as soon as the JSON is valid.</p>
            </CollapsibleContent>
          </Collapsible>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={upsert.isPending || !sectionKey.trim() || !!jsonError}>
              {upsert.isPending ? "Saving…" : "Save section"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Field building blocks ─────────────────────────────────────────────────── */

function FieldShell({
  id, label, onRemove, wide, bare, children,
}: {
  id: string; label: string; onRemove: () => void; wide?: boolean;
  /** The child renders its own label (e.g. MediaField). */
  bare?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${wide || bare ? "sm:col-span-2" : ""}`}>
      {!bare && (
        <div className="flex items-center justify-between">
          <Label htmlFor={id}>{label}</Label>
          <RemoveButton label={label} onRemove={onRemove} />
        </div>
      )}
      {bare ? (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          <RemoveButton label={label} onRemove={onRemove} />
        </div>
      ) : children}
    </div>
  );
}

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground" aria-label={`Remove ${label} field`} onClick={onRemove}>
      <X className="h-3.5 w-3.5" />
    </Button>
  );
}

const joinList = (arr: string[], mode: "line" | "paragraph") => arr.join(mode === "line" ? "\n" : "\n\n");
const splitList = (text: string, mode: "line" | "paragraph") =>
  text.split(mode === "line" ? /\r?\n/ : /\r?\n\s*\r?\n/).map((s) => s.trim()).filter(Boolean);
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Textarea backed by a string[]; keeps the raw text so trailing newlines survive while typing. */
function ListTextarea({
  id, value, onChange, mode, rows, hint,
}: { id: string; value: string[]; onChange: (v: string[]) => void; mode: "line" | "paragraph"; rows: number; hint: string }) {
  const [text, setText] = useState(() => joinList(value, mode));
  useEffect(() => {
    // Re-sync only when the outside value no longer matches what the text parses to (e.g. JSON edited).
    if (!sameList(splitList(text, mode), value)) setText(joinList(value, mode));
  }, [value, mode, text]);
  return (
    <>
      <Textarea
        id={id}
        value={text}
        rows={rows}
        onChange={(e) => { setText(e.target.value); onChange(splitList(e.target.value, mode)); }}
      />
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </>
  );
}

function CtaField({
  fieldKey, label, value, onChange, onRemove,
}: { fieldKey: "primaryCta" | "secondaryCta"; label: string; value: Cta; onChange: (v: Cta) => void; onRemove: () => void }) {
  const str = (k: string) => (isStr(value[k]) ? (value[k] as string) : "");
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium leading-none">{label}</span>
        <RemoveButton label={label} onRemove={onRemove} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input aria-label={`${label} label`} placeholder="Button label" value={str("label")} onChange={(e) => onChange({ ...value, label: e.target.value })} id={`sec-f-${fieldKey}-label`} />
        <Input aria-label={`${label} link`} placeholder="/contact or https://…" value={str("href")} onChange={(e) => onChange({ ...value, href: e.target.value })} id={`sec-f-${fieldKey}-href`} />
      </div>
    </div>
  );
}

const ITEM_TEXT_FIELDS = [
  { key: "title", label: "Title" },
  { key: "label", label: "Label" },
  { key: "icon", label: "Icon" },
] as const;

function ItemsField({
  items, onChange, onRemove,
}: { items: Item[]; onChange: (v: Item[]) => void; onRemove: () => void }) {
  const patch = (i: number, p: Item) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const str = (it: Item, k: string) => (isStr(it[k]) ? (it[k] as string) : "");

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium leading-none">Items</span>
        <RemoveButton label="Items" onRemove={onRemove} />
      </div>
      {items.length === 0 && <p className="text-xs text-muted-foreground">No items yet.</p>}
      {items.map((it, i) => (
        <div key={i} className="rounded-xl border p-3" style={rowStyle}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Item {i + 1}</span>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5" aria-label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5" aria-label={`Move item ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5" aria-label={`Remove item ${i + 1}`} onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {ITEM_TEXT_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`sec-item-${i}-${f.key}`} className="text-xs">{f.label}</Label>
                <Input id={`sec-item-${i}-${f.key}`} value={str(it, f.key)} onChange={(e) => patch(i, { [f.key]: e.target.value })} />
              </div>
            ))}
            <div className="space-y-1 sm:col-span-3">
              <Label htmlFor={`sec-item-${i}-text`} className="text-xs">Text</Label>
              <Textarea id={`sec-item-${i}-text`} rows={2} value={str(it, "text")} onChange={(e) => patch(i, { text: e.target.value })} />
            </div>
            <div className="sm:col-span-3">
              <MediaField
                id={`sec-item-${i}-thumb`} label="Thumbnail" kindFilter="image"
                value={str(it, "thumb")} onChange={(v) => patch(i, { thumb: v })} maxLength={1000}
              />
            </div>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, {}])}>
        <Plus className="mr-1 h-3.5 w-3.5" />Add item
      </Button>
    </div>
  );
}
