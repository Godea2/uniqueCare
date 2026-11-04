import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, EmptyState, Chip, fmtDate } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import type { RouterOutputs } from "@/lib/router-types";
import { ConfirmDelete, FilterBar, Pager, rowStyle, thClass, useListParams } from "./shared";

type Area = RouterOutputs["website"]["areasCms"]["list"]["items"][number];
const STATUSES = ["draft", "published", "archived"] as const;
const WEBSITE_URL = (import.meta.env.VITE_WEBSITE_URL as string | undefined)?.replace(/\/$/, "") || "https://uniquecareuk.com";

export default function CmsAreas() {
  const utils = trpc.useUtils();
  const params = useListParams();
  const q = trpc.website.areasCms.list.useQuery(params.input, { placeholderData: keepPreviousData });
  const [editing, setEditing] = useState<Area | "new" | null>(null);
  const [deleting, setDeleting] = useState<Area | null>(null);

  const refresh = () => { void utils.website.areasCms.list.invalidate(); };
  const del = trpc.website.areasCms.delete.useMutation({
    onSuccess: () => { refresh(); setDeleting(null); toast.success("Area deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const items = q.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Areas"
        subtitle="Locations we cover, shown on the public website. Only published areas are visible."
        actions={<Button onClick={() => setEditing("new")}><Plus className="mr-1.5 h-4 w-4" />New area</Button>}
      />
      <FilterBar params={params} statuses={STATUSES} counts={q.data?.counts} placeholder="Search name, region…" />

      {q.isLoading ? <Loading rows={5} />
        : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : items.length === 0 ? <EmptyState title="No areas" hint="Add the first area you cover." />
        : (
          <>
            <div className="uc-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground" style={rowStyle}>
                    <th className={thClass}>Area</th>
                    <th className={thClass}>Region</th>
                    <th className={thClass}>Order</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>Updated</th>
                    <th className={`${thClass} text-right`}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id} className="border-b last:border-0" style={rowStyle}>
                      <td className="max-w-72 px-4 py-2">
                        <p className="truncate font-medium" title={a.name}>{a.name}</p>
                        <p className="truncate text-xs text-muted-foreground">/areas/{a.slug}</p>
                      </td>
                      <td className="px-4 py-2 text-xs">{a.region}</td>
                      <td className="px-4 py-2 text-xs tabular-nums">{a.sortOrder}</td>
                      <td className="px-4 py-2"><Chip value={a.status} /></td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDate(a.updatedAt)}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          {a.status === "published" && (
                            <Button size="sm" variant="ghost" asChild aria-label={`View ${a.name} on the website`}>
                              <a href={`${WEBSITE_URL}/areas/${a.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setEditing(a)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                          <Button size="sm" variant="ghost" aria-label={`Delete ${a.name}`} onClick={() => setDeleting(a)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager offset={params.offset} limit={params.limit} total={q.data?.total ?? 0} onChange={params.setOffset} />
          </>
        )}

      {editing && (
        <AreaEditor
          key={editing === "new" ? "new" : editing.id}
          area={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { refresh(); setEditing(null); }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        title="Delete this area?"
        description={<>“{deleting?.name}” will be permanently removed{deleting?.status === "published" ? " and disappear from the public website" : ""}. Consider archiving it instead.</>}
        busy={del.isPending}
        onConfirm={() => deleting && del.mutate({ id: deleting.id })}
      />
    </div>
  );
}

function AreaEditor({ area, onClose, onSaved }: { area: Area | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(area?.name ?? "");
  const [slug, setSlug] = useState(area?.slug ?? "");
  const [region, setRegion] = useState(area?.region ?? "");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>((area?.status as (typeof STATUSES)[number]) ?? "draft");
  const [sortOrder, setSortOrder] = useState(String(area?.sortOrder ?? 0));
  const [intro, setIntro] = useState(area?.intro ?? "");
  const [surrounding, setSurrounding] = useState(area?.surrounding ?? "");
  const [seoTitle, setSeoTitle] = useState(area?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(area?.seoDescription ?? "");

  const opts = {
    onSuccess: () => { toast.success(area ? "Area saved" : "Area created"); onSaved(); },
    onError: (e: { message: string }) => toast.error(e.message),
  };
  const create = trpc.website.areasCms.create.useMutation(opts);
  const update = trpc.website.areasCms.update.useMutation(opts);
  const busy = create.isPending || update.isPending;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{area ? "Edit area" : "New area"}</DialogTitle>
          <DialogDescription>Shown on the Areas page and its own landing page once published.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const order = Number.parseInt(sortOrder, 10);
            const payload = {
              name: name.trim(),
              slug: slug.trim() || undefined,
              region: region.trim(),
              intro,
              surrounding,
              sortOrder: Number.isFinite(order) ? Math.min(9999, Math.max(0, order)) : 0,
              status,
              seoTitle: seoTitle.trim() || undefined,
              seoDescription: seoDescription.trim() || undefined,
            };
            if (area) update.mutate({ id: area.id, ...payload });
            else create.mutate(payload);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="area-name">Name</Label>
              <Input id="area-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="area-slug">URL slug</Label>
              <Input id="area-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from name" maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="area-region">Region</Label>
              <Input id="area-region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. Greater London" maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="area-order">Sort order</Label>
              <Input id="area-order" type="number" min={0} max={9999} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="area-intro">Intro</Label>
              <Textarea id="area-intro" value={intro} onChange={(e) => setIntro(e.target.value)} rows={4} maxLength={2000} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="area-surr">Surrounding-area text</Label>
              <Input id="area-surr" value={surrounding} onChange={(e) => setSurrounding(e.target.value)} placeholder="e.g. London and the surrounding Greater London area" maxLength={500} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="area-seot">SEO title (optional)</Label>
              <Input id="area-seot" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="area-seod">SEO description (optional)</Label>
              <Textarea id="area-seod" value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={2} maxLength={400} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || name.trim().length < 2}>{busy ? "Saving…" : "Save area"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
