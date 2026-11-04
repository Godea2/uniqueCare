import { useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, EmptyState, Chip, fmtDate } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import type { RouterOutputs } from "@/lib/router-types";
import { ConfirmDelete, rowStyle, thClass } from "./shared";

type Section = RouterOutputs["website"]["sections"]["list"]["items"][number];
const STATUSES = ["draft", "published", "archived"] as const;
const PAGE_KEYS = ["home", "about", "careers", "contact"] as const;

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
        subtitle="Editable text blocks on the Home, About, Careers and Contact pages. Content is stored as JSON — edit values, keep the keys."
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

function SectionEditor({
  section, defaultPageKey, onClose, onSaved,
}: { section: Section | null; defaultPageKey: string; onClose: () => void; onSaved: () => void }) {
  const [pageKey, setPageKey] = useState(section?.pageKey ?? defaultPageKey);
  const [sectionKey, setSectionKey] = useState(section?.sectionKey ?? "");
  const [label, setLabel] = useState(section?.label ?? "");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>((section?.status as (typeof STATUSES)[number]) ?? "published");
  const [sortOrder, setSortOrder] = useState(String(section?.sortOrder ?? 0));
  const [json, setJson] = useState(JSON.stringify(section?.content ?? {}, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const upsert = trpc.website.sections.upsert.useMutation({
    onSuccess: () => { toast.success("Section saved"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const validate = (text: string): Record<string, unknown> | null => {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setJsonError("Content must be a JSON object, e.g. { \"title\": \"…\" }.");
        return null;
      }
      setJsonError(null);
      return parsed as Record<string, unknown>;
    } catch (e) {
      setJsonError(`Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`);
      return null;
    }
  };

  const isNew = !section;
  const pageKeyOptions = PAGE_KEYS.includes(pageKey as (typeof PAGE_KEYS)[number]) ? PAGE_KEYS : [...PAGE_KEYS, pageKey];

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
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const content = validate(json);
            if (!content) return;
            const order = Number.parseInt(sortOrder, 10);
            upsert.mutate({
              pageKey,
              sectionKey: sectionKey.trim(),
              label: label.trim(),
              content,
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
            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="sec-json">Content (JSON)</Label>
                <Button
                  type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs"
                  onClick={() => { const c = validate(json); if (c) setJson(JSON.stringify(c, null, 2)); }}
                >
                  Format
                </Button>
              </div>
              <Textarea
                id="sec-json"
                value={json}
                onChange={(e) => { setJson(e.target.value); if (jsonError) setJsonError(null); }}
                onBlur={() => { validate(json); }}
                rows={16}
                spellCheck={false}
                aria-invalid={!!jsonError}
                aria-describedby={jsonError ? "sec-json-err" : undefined}
                className="font-mono text-[13px]"
              />
              {jsonError && <p id="sec-json-err" role="alert" className="text-xs text-red-600">{jsonError}</p>}
            </div>
          </div>
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
