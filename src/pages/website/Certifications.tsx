import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, EmptyState, Chip, fmtDate } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import type { RouterOutputs } from "@/lib/router-types";
import { ConfirmDelete, FilterBar, Pager, rowStyle, thClass, useListParams } from "./shared";
import { MediaField } from "./MediaPicker";

type Cert = RouterOutputs["website"]["certifications"]["list"]["items"][number];
const STATUSES = ["draft", "published", "archived"] as const;

export default function Certifications() {
  const utils = trpc.useUtils();
  const params = useListParams();
  const q = trpc.website.certifications.list.useQuery(params.input, { placeholderData: keepPreviousData });
  const [editing, setEditing] = useState<Cert | "new" | null>(null);
  const [deleting, setDeleting] = useState<Cert | null>(null);

  const refresh = () => { void utils.website.certifications.list.invalidate(); };
  const del = trpc.website.certifications.delete.useMutation({
    onSuccess: () => { refresh(); setDeleting(null); toast.success("Certification deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const items = q.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Certifications"
        subtitle="Accreditation badges (for example ISO 9001) shown on the Home and About pages. Only published items are visible."
        actions={<Button onClick={() => setEditing("new")}><Plus className="mr-1.5 h-4 w-4" />New certification</Button>}
      />
      <FilterBar params={params} statuses={STATUSES} counts={q.data?.counts} placeholder="Search code, label…" />

      {q.isLoading ? <Loading rows={4} />
        : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : items.length === 0 ? <EmptyState title="No certifications" hint="Add your first accreditation." />
        : (
          <>
            <div className="uc-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground" style={rowStyle}>
                    <th className={thClass}>Certification</th>
                    <th className={thClass}>Order</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>Updated</th>
                    <th className={`${thClass} text-right`}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id} className="border-b last:border-0" style={rowStyle}>
                      <td className="max-w-96 px-4 py-2">
                        <div className="flex items-center gap-3">
                          {c.image ? (
                            <img src={c.image} alt={c.imageAlt || c.code} className="h-10 w-10 shrink-0 rounded-md border object-contain" style={rowStyle} />
                          ) : (
                            <span className="h-10 w-10 shrink-0 rounded-md border bg-slate-50" style={rowStyle} aria-hidden />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium" title={c.code}>{c.code}</p>
                            <p className="truncate text-xs text-muted-foreground" title={c.label}>{c.label}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs tabular-nums">{c.sortOrder}</td>
                      <td className="px-4 py-2"><Chip value={c.status} /></td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDate(c.updatedAt)}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          {c.url && (
                            <Button size="sm" variant="ghost" asChild aria-label={`Open ${c.code} link`}>
                              <a href={c.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setEditing(c)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                          <Button size="sm" variant="ghost" aria-label={`Delete ${c.code}`} onClick={() => setDeleting(c)}>
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
        <CertEditor
          key={editing === "new" ? "new" : editing.id}
          cert={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { refresh(); setEditing(null); }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        title="Delete this certification?"
        description={<>“{deleting?.code}” will be permanently removed{deleting?.status === "published" ? " and disappear from the public website" : ""}. Consider archiving it instead.</>}
        busy={del.isPending}
        onConfirm={() => deleting && del.mutate({ id: deleting.id })}
      />
    </div>
  );
}

function CertEditor({ cert, onClose, onSaved }: { cert: Cert | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(cert?.code ?? "");
  const [label, setLabel] = useState(cert?.label ?? "");
  const [image, setImage] = useState(cert?.image ?? "");
  const [imageAlt, setImageAlt] = useState(cert?.imageAlt ?? "");
  const [url, setUrl] = useState(cert?.url ?? "");
  const [sortOrder, setSortOrder] = useState(String(cert?.sortOrder ?? 0));
  const [status, setStatus] = useState<(typeof STATUSES)[number]>((cert?.status as (typeof STATUSES)[number]) ?? "published");

  const opts = {
    onSuccess: () => { toast.success(cert ? "Certification saved" : "Certification created"); onSaved(); },
    onError: (e: { message: string }) => toast.error(e.message),
  };
  const create = trpc.website.certifications.create.useMutation(opts);
  const update = trpc.website.certifications.update.useMutation(opts);
  const busy = create.isPending || update.isPending;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{cert ? "Edit certification" : "New certification"}</DialogTitle>
          <DialogDescription>Shown as a badge on the website once published.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const order = Number.parseInt(sortOrder, 10);
            const payload = {
              code: code.trim(),
              label: label.trim(),
              image: image.trim(),
              imageAlt: imageAlt.trim(),
              url: url.trim(),
              sortOrder: Number.isFinite(order) ? Math.min(9999, Math.max(0, order)) : 0,
              status,
            };
            if (cert) update.mutate({ id: cert.id, ...payload });
            else create.mutate(payload);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cert-code">Code</Label>
              <Input id="cert-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ISO 9001" maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cert-label">Label</Label>
              <Input id="cert-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Quality Management" maxLength={160} />
            </div>
            <div className="sm:col-span-2">
              <MediaField id="cert-image" label="Badge image" kindFilter="image" value={image} onChange={setImage} onAltChange={(a) => { if (!imageAlt) setImageAlt(a); }} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cert-alt">Image alt text</Label>
              <Input id="cert-alt" value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cert-url">Link (optional)</Label>
              <Input id="cert-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… certificate or issuer page" maxLength={1000} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cert-order">Sort order</Label>
              <Input id="cert-order" type="number" min={0} max={9999} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Lower numbers appear first.</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || !code.trim()}>{busy ? "Saving…" : "Save certification"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
