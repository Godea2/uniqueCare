import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
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

type Branch = RouterOutputs["website"]["branches"]["list"]["items"][number];
const STATUSES = ["draft", "published", "archived"] as const;

export default function Branches() {
  const utils = trpc.useUtils();
  const params = useListParams();
  const q = trpc.website.branches.list.useQuery(params.input, { placeholderData: keepPreviousData });
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [deleting, setDeleting] = useState<Branch | null>(null);

  const refresh = () => { void utils.website.branches.list.invalidate(); };
  const del = trpc.website.branches.delete.useMutation({
    onSuccess: () => { refresh(); setDeleting(null); toast.success("Branch deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const items = q.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Branches"
        subtitle="Offices shown on the Contact and About pages. Only published branches are visible."
        actions={<Button onClick={() => setEditing("new")}><Plus className="mr-1.5 h-4 w-4" />New branch</Button>}
      />
      <FilterBar params={params} statuses={STATUSES} counts={q.data?.counts} placeholder="Search name, city, postcode…" />

      {q.isLoading ? <Loading rows={4} />
        : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : items.length === 0 ? <EmptyState title="No branches" hint="Add your first office." />
        : (
          <>
            <div className="uc-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground" style={rowStyle}>
                    <th className={thClass}>Branch</th>
                    <th className={thClass}>Contact</th>
                    <th className={thClass}>Order</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>Updated</th>
                    <th className={`${thClass} text-right`}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((b) => (
                    <tr key={b.id} className="border-b last:border-0" style={rowStyle}>
                      <td className="max-w-80 px-4 py-2">
                        <p className="truncate font-medium" title={b.name}>{b.name}</p>
                        <p className="truncate text-xs text-muted-foreground" title={b.address}>
                          {[b.address, b.city, b.postcode].filter(Boolean).join(", ") || "No address"}
                        </p>
                      </td>
                      <td className="max-w-56 px-4 py-2 text-xs">
                        <p className="truncate">{b.phoneDisplay || b.phone || "-"}</p>
                        <p className="truncate text-muted-foreground">{b.email}</p>
                      </td>
                      <td className="px-4 py-2 text-xs tabular-nums">{b.sortOrder}</td>
                      <td className="px-4 py-2"><Chip value={b.status} /></td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDate(b.updatedAt)}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setEditing(b)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                          <Button size="sm" variant="ghost" aria-label={`Delete ${b.name}`} onClick={() => setDeleting(b)}>
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
        <BranchEditor
          key={editing === "new" ? "new" : editing.id}
          branch={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { refresh(); setEditing(null); }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        title="Delete this branch?"
        description={<>“{deleting?.name}” will be permanently removed{deleting?.status === "published" ? " and disappear from the public website" : ""}. Consider archiving it instead.</>}
        busy={del.isPending}
        onConfirm={() => deleting && del.mutate({ id: deleting.id })}
      />
    </div>
  );
}

function BranchEditor({ branch, onClose, onSaved }: { branch: Branch | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(branch?.name ?? "");
  const [address, setAddress] = useState(branch?.address ?? "");
  const [city, setCity] = useState(branch?.city ?? "");
  const [postcode, setPostcode] = useState(branch?.postcode ?? "");
  const [phone, setPhone] = useState(branch?.phone ?? "");
  const [phoneDisplay, setPhoneDisplay] = useState(branch?.phoneDisplay ?? "");
  const [email, setEmail] = useState(branch?.email ?? "");
  const [hours, setHours] = useState(branch?.hours ?? "");
  const [mapsUrl, setMapsUrl] = useState(branch?.mapsUrl ?? "");
  const [image, setImage] = useState(branch?.image ?? "");
  const [imageAlt, setImageAlt] = useState(branch?.imageAlt ?? "");
  const [sortOrder, setSortOrder] = useState(String(branch?.sortOrder ?? 0));
  const [status, setStatus] = useState<(typeof STATUSES)[number]>((branch?.status as (typeof STATUSES)[number]) ?? "published");

  const opts = {
    onSuccess: () => { toast.success(branch ? "Branch saved" : "Branch created"); onSaved(); },
    onError: (e: { message: string }) => toast.error(e.message),
  };
  const create = trpc.website.branches.create.useMutation(opts);
  const update = trpc.website.branches.update.useMutation(opts);
  const busy = create.isPending || update.isPending;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{branch ? "Edit branch" : "New branch"}</DialogTitle>
          <DialogDescription>Shown on the Contact and About pages once published.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const order = Number.parseInt(sortOrder, 10);
            const payload = {
              name: name.trim(),
              address: address.trim(),
              city: city.trim(),
              postcode: postcode.trim(),
              phone: phone.trim(),
              phoneDisplay: phoneDisplay.trim(),
              email: email.trim(),
              hours: hours.trim(),
              mapsUrl: mapsUrl.trim(),
              image: image.trim(),
              imageAlt: imageAlt.trim(),
              sortOrder: Number.isFinite(order) ? Math.min(9999, Math.max(0, order)) : 0,
              status,
            };
            if (branch) update.mutate({ id: branch.id, ...payload });
            else create.mutate(payload);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="br-name">Name</Label>
              <Input id="br-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="London Branch" maxLength={120} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="br-address">Address</Label>
              <Input id="br-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={400} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-city">City</Label>
              <Input id="br-city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-postcode">Postcode</Label>
              <Input id="br-postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} maxLength={40} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-phone">Phone (dialling number)</Label>
              <Input id="br-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+442039170260" maxLength={40} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-phone-display">Phone (display)</Label>
              <Input id="br-phone-display" value={phoneDisplay} onChange={(e) => setPhoneDisplay(e.target.value)} placeholder="020 3917 0260" maxLength={40} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-email">Email</Label>
              <Input id="br-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-hours">Opening hours</Label>
              <Input id="br-hours" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Mon-Fri 9am-5pm" maxLength={200} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="br-maps">Google Maps link</Label>
              <Input id="br-maps" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} placeholder="https://maps.google.com/…" maxLength={1000} />
            </div>
            <div className="sm:col-span-2">
              <MediaField id="br-image" label="Image" kindFilter="image" value={image} onChange={setImage} onAltChange={(a) => { if (!imageAlt) setImageAlt(a); }} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="br-alt">Image alt text</Label>
              <Input id="br-alt" value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-order">Sort order</Label>
              <Input id="br-order" type="number" min={0} max={9999} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Lower numbers appear first.</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || name.trim().length < 2}>{busy ? "Saving…" : "Save branch"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
