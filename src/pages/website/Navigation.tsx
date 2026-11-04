import { useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import type { RouterOutputs } from "@/lib/router-types";
import { ConfirmDelete, rowStyle, thClass } from "./shared";

type NavItem = RouterOutputs["website"]["nav"]["list"]["items"][number];
type Menu = "header" | "footer_company" | "footer_legal" | "mobile_cta";
type Dropdown = "" | "services" | "areas";

const MENUS: { value: Menu; label: string }[] = [
  { value: "header", label: "Header" },
  { value: "footer_company", label: "Footer - company" },
  { value: "footer_legal", label: "Footer - legal" },
  { value: "mobile_cta", label: "Mobile call-to-action" },
];
const DROPDOWNS: { value: Dropdown; label: string }[] = [
  { value: "", label: "None (plain link)" },
  { value: "services", label: "Services dropdown" },
  { value: "areas", label: "Areas dropdown" },
];
const menuLabel = (m: string) => MENUS.find((x) => x.value === m)?.label ?? m;
const ALL = "all";

export default function Navigation() {
  const utils = trpc.useUtils();
  const [menu, setMenu] = useState<string>(ALL);
  const q = trpc.website.nav.list.useQuery(
    { menu: menu === ALL ? undefined : (menu as Menu) },
    { placeholderData: keepPreviousData },
  );
  const [editing, setEditing] = useState<NavItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<NavItem | null>(null);

  const refresh = () => { void utils.website.nav.list.invalidate(); };
  const del = trpc.website.nav.delete.useMutation({
    onSuccess: () => { refresh(); setDeleting(null); toast.success("Link deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const toggle = trpc.website.nav.update.useMutation({
    onSuccess: () => refresh(),
    onError: (e) => toast.error(e.message),
  });

  const items = useMemo(
    () => [...(q.data?.items ?? [])].sort(
      (a, b) => MENUS.findIndex((m) => m.value === a.menu) - MENUS.findIndex((m) => m.value === b.menu) || a.sortOrder - b.sortOrder,
    ),
    [q.data],
  );

  return (
    <div>
      <PageHeader
        title="Navigation"
        subtitle="Links in the website header, footer and mobile call-to-action. Hidden links stay saved but are not shown."
        actions={<Button onClick={() => setEditing("new")}><Plus className="mr-1.5 h-4 w-4" />New link</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Label htmlFor="nav-menu" className="text-xs text-muted-foreground">Menu</Label>
        <Select value={menu} onValueChange={setMenu}>
          <SelectTrigger id="nav-menu" aria-label="Filter by menu" className="h-9 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All menus</SelectItem>
            {MENUS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? <Loading rows={5} />
        : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : items.length === 0 ? <EmptyState title="No links" hint="Add the first navigation link." />
        : (
          <>
            <div className="uc-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground" style={rowStyle}>
                    <th className={thClass}>Link</th>
                    <th className={thClass}>Menu</th>
                    <th className={thClass}>Dropdown</th>
                    <th className={thClass}>Order</th>
                    <th className={thClass}>Visible</th>
                    <th className={`${thClass} text-right`}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((n) => (
                    <tr key={n.id} className="border-b last:border-0" style={rowStyle}>
                      <td className="max-w-80 px-4 py-2">
                        <p className="truncate font-medium" title={n.label}>{n.label}</p>
                        <p className="truncate text-xs text-muted-foreground" title={n.href}>{n.href}</p>
                      </td>
                      <td className="px-4 py-2 text-xs">{menuLabel(n.menu)}</td>
                      <td className="px-4 py-2 text-xs capitalize">{n.dropdown || "-"}</td>
                      <td className="px-4 py-2 text-xs tabular-nums">{n.sortOrder}</td>
                      <td className="px-4 py-2">
                        <Switch
                          checked={n.visible}
                          disabled={toggle.isPending}
                          aria-label={`${n.visible ? "Hide" : "Show"} ${n.label}`}
                          onCheckedChange={(v) => toggle.mutate({
                            id: n.id, menu: n.menu as Menu, label: n.label, href: n.href,
                            dropdown: (n.dropdown || "") as Dropdown, sortOrder: n.sortOrder, visible: v,
                          })}
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setEditing(n)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                          <Button size="sm" variant="ghost" aria-label={`Delete ${n.label}`} onClick={() => setDeleting(n)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{items.length} {items.length === 1 ? "link" : "links"}</p>
          </>
        )}

      {editing && (
        <NavEditor
          key={editing === "new" ? "new" : editing.id}
          item={editing === "new" ? null : editing}
          defaultMenu={menu === ALL ? "header" : (menu as Menu)}
          onClose={() => setEditing(null)}
          onSaved={() => { refresh(); setEditing(null); }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        title="Delete this link?"
        description={<>“{deleting?.label}” will be removed from the {deleting ? menuLabel(deleting.menu).toLowerCase() : ""} menu. You can hide it instead to keep it saved.</>}
        busy={del.isPending}
        onConfirm={() => deleting && del.mutate({ id: deleting.id })}
      />
    </div>
  );
}

function NavEditor({
  item, defaultMenu, onClose, onSaved,
}: { item: NavItem | null; defaultMenu: Menu; onClose: () => void; onSaved: () => void }) {
  const [menu, setMenu] = useState<Menu>((item?.menu as Menu) ?? defaultMenu);
  const [label, setLabel] = useState(item?.label ?? "");
  const [href, setHref] = useState(item?.href ?? "");
  const [dropdown, setDropdown] = useState<Dropdown>((item?.dropdown as Dropdown) ?? "");
  const [sortOrder, setSortOrder] = useState(String(item?.sortOrder ?? 0));
  const [visible, setVisible] = useState(item?.visible ?? true);

  const opts = {
    onSuccess: () => { toast.success(item ? "Link saved" : "Link created"); onSaved(); },
    onError: (e: { message: string }) => toast.error(e.message),
  };
  const create = trpc.website.nav.create.useMutation(opts);
  const update = trpc.website.nav.update.useMutation(opts);
  const busy = create.isPending || update.isPending;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{item ? "Edit link" : "New link"}</DialogTitle>
          <DialogDescription>Navigation links appear in the order set by their sort order.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const order = Number.parseInt(sortOrder, 10);
            const payload = {
              menu,
              label: label.trim(),
              href: href.trim(),
              dropdown,
              sortOrder: Number.isFinite(order) ? Math.min(9999, Math.max(0, order)) : 0,
              visible,
            };
            if (item) update.mutate({ id: item.id, ...payload });
            else create.mutate(payload);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Menu</Label>
              <Select value={menu} onValueChange={(v) => setMenu(v as Menu)}>
                <SelectTrigger aria-label="Menu"><SelectValue /></SelectTrigger>
                <SelectContent>{MENUS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nav-label">Label</Label>
              <Input id="nav-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nav-href">Link</Label>
              <Input id="nav-href" value={href} onChange={(e) => setHref(e.target.value)} placeholder="/services or https://…" maxLength={500} />
            </div>
            <div className="space-y-1.5">
              <Label>Dropdown</Label>
              <Select value={dropdown || "none"} onValueChange={(v) => setDropdown(v === "none" ? "" : (v as Dropdown))}>
                <SelectTrigger aria-label="Dropdown"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DROPDOWNS.map((d) => <SelectItem key={d.value || "none"} value={d.value || "none"}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Lists published services or areas under this link.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nav-order">Sort order</Label>
              <Input id="nav-order" type="number" min={0} max={9999} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Lower numbers appear first.</p>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch id="nav-visible" checked={visible} onCheckedChange={setVisible} />
              <Label htmlFor="nav-visible">Visible on the website</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || !label.trim() || !href.trim()}>{busy ? "Saving…" : "Save link"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
