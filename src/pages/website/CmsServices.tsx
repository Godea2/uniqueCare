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
import { MediaField } from "./MediaPicker";

type Service = RouterOutputs["website"]["services"]["list"]["items"][number];
const STATUSES = ["draft", "published", "archived"] as const;
const WEBSITE_URL = (import.meta.env.VITE_WEBSITE_URL as string | undefined)?.replace(/\/$/, "") || "https://uniquecareuk.com";

export default function CmsServices() {
  const utils = trpc.useUtils();
  const params = useListParams();
  const q = trpc.website.services.list.useQuery(params.input, { placeholderData: keepPreviousData });
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);

  const refresh = () => { void utils.website.services.list.invalidate(); };
  const del = trpc.website.services.delete.useMutation({
    onSuccess: () => { refresh(); setDeleting(null); toast.success("Service deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const items = q.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Services"
        subtitle="Care services listed on the public website. Only published services are visible."
        actions={<Button onClick={() => setEditing("new")}><Plus className="mr-1.5 h-4 w-4" />New service</Button>}
      />
      <FilterBar params={params} statuses={STATUSES} counts={q.data?.counts} placeholder="Search name, slug…" />

      {q.isLoading ? <Loading rows={5} />
        : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : items.length === 0 ? <EmptyState title="No services" hint="Add your first service." />
        : (
          <>
            <div className="uc-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground" style={rowStyle}>
                    <th className={thClass}>Service</th>
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
                        <p className="truncate font-medium" title={s.name}>
                          {s.name}
                          {s.badge && <span className="ml-2 rounded bg-[--brand-50] px-1.5 py-0.5 text-[10px] font-medium text-[--brand-900]">{s.badge}</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">/services/{s.slug}</p>
                      </td>
                      <td className="px-4 py-2 text-xs tabular-nums">{s.sortOrder}</td>
                      <td className="px-4 py-2"><Chip value={s.status} /></td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDate(s.updatedAt)}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          {s.status === "published" && (
                            <Button size="sm" variant="ghost" asChild aria-label={`View ${s.name} on the website`}>
                              <a href={`${WEBSITE_URL}/services/${s.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setEditing(s)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                          <Button size="sm" variant="ghost" aria-label={`Delete ${s.name}`} onClick={() => setDeleting(s)}>
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
        <ServiceEditor
          key={editing === "new" ? "new" : editing.id}
          service={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { refresh(); setEditing(null); }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        title="Delete this service?"
        description={<>“{deleting?.name}” will be permanently removed{deleting?.status === "published" ? " and disappear from the public website" : ""}. Consider archiving it instead.</>}
        busy={del.isPending}
        onConfirm={() => deleting && del.mutate({ id: deleting.id })}
      />
    </div>
  );
}

function ServiceEditor({ service, onClose, onSaved }: { service: Service | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(service?.name ?? "");
  const [slug, setSlug] = useState(service?.slug ?? "");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>((service?.status as (typeof STATUSES)[number]) ?? "draft");
  const [short, setShort] = useState(service?.short ?? "");
  const [image, setImage] = useState(service?.image ?? "");
  const [imageAlt, setImageAlt] = useState(service?.imageAlt ?? "");
  const [icon, setIcon] = useState(service?.icon ?? "home");
  const [badge, setBadge] = useState(service?.badge ?? "");
  const [sortOrder, setSortOrder] = useState(String(service?.sortOrder ?? 0));
  // The API stores body as paragraphs; the editor exposes the first two as separate boxes
  // and keeps any further paragraphs together in the second so nothing is lost.
  const [body1, setBody1] = useState(service?.body?.[0] ?? "");
  const [body2, setBody2] = useState((service?.body ?? []).slice(1).join("\n\n"));
  const [seoTitle, setSeoTitle] = useState(service?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(service?.seoDescription ?? "");

  const opts = {
    onSuccess: () => { toast.success(service ? "Service saved" : "Service created"); onSaved(); },
    onError: (e: { message: string }) => toast.error(e.message),
  };
  const create = trpc.website.services.create.useMutation(opts);
  const update = trpc.website.services.update.useMutation(opts);
  const busy = create.isPending || update.isPending;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{service ? "Edit service" : "New service"}</DialogTitle>
          <DialogDescription>Shown on the Services page and its own detail page once published.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const body = [body1, ...body2.split(/\n{2,}/)].map((p) => p.trim()).filter(Boolean);
            const order = Number.parseInt(sortOrder, 10);
            const payload = {
              name: name.trim(),
              slug: slug.trim() || undefined,
              short,
              image: image.trim(),
              imageAlt,
              icon: icon.trim() || "home",
              badge: badge.trim() || undefined,
              body,
              sortOrder: Number.isFinite(order) ? Math.min(9999, Math.max(0, order)) : 0,
              status,
              seoTitle: seoTitle.trim() || undefined,
              seoDescription: seoDescription.trim() || undefined,
            };
            if (service) update.mutate({ id: service.id, ...payload });
            else create.mutate(payload);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="svc-name">Name</Label>
              <Input id="svc-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-slug">URL slug</Label>
              <Input id="svc-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from name" maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="svc-short">Short description</Label>
              <Textarea id="svc-short" value={short} onChange={(e) => setShort(e.target.value)} rows={2} maxLength={800} />
            </div>
            <MediaField
              id="svc-image" label="Image" kindFilter="image" value={image} onChange={setImage}
              onAltChange={(a) => { if (!imageAlt) setImageAlt(a); }}
              placeholder="https://… or /images/service.jpg"
            />
            <div className="space-y-1.5">
              <Label htmlFor="svc-alt">Image alt text</Label>
              <Input id="svc-alt" value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-icon">Icon</Label>
              <Input id="svc-icon" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="home" maxLength={40} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-badge">Badge (optional)</Label>
              <Input id="svc-badge" value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="e.g. Most popular" maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-order">Sort order</Label>
              <Input id="svc-order" type="number" min={0} max={9999} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Lower numbers appear first.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="svc-body1">Body — paragraph 1</Label>
              <Textarea id="svc-body1" value={body1} onChange={(e) => setBody1(e.target.value)} rows={4} maxLength={5000} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="svc-body2">Body — paragraph 2</Label>
              <Textarea id="svc-body2" value={body2} onChange={(e) => setBody2(e.target.value)} rows={4} maxLength={10000} />
              <p className="text-[11px] text-muted-foreground">Leave a blank line between paragraphs to add more.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="svc-seot">SEO title (optional)</Label>
              <Input id="svc-seot" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="svc-seod">SEO description (optional)</Label>
              <Textarea id="svc-seod" value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={2} maxLength={400} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || name.trim().length < 2}>{busy ? "Saving…" : "Save service"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
