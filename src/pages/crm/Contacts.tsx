import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { LogCallDialog } from "./Tickets";

const TYPES = ["client", "family_member", "next_of_kin", "care_worker", "candidate", "commissioner", "social_worker", "gp_practice", "hospital", "supplier", "prospective_client", "other"];

export default function Contacts() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const q = trpc.crm.contacts.useQuery({ q: search || undefined, type: type === "all" ? undefined : type });
  const [open, setOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle="Everyone the office speaks to — clients' families, commissioners, GPs, suppliers"
        actions={
          <>
            <Input placeholder="Search name, phone, email…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" aria-label="Search contacts" />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setCallOpen(true)}>Log call</Button>
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New contact</Button>
          </>
        }
      />
      {q.isLoading ? <Loading rows={8} /> : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} /> : (
        <div className="uc-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Organisation</th>
                <th className="px-4 py-2.5 font-medium">Phone</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Open tickets</th>
                <th className="px-4 py-2.5 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-[--brand-50]/60" style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-2.5">
                    <Link to={`/crm/contacts/${c.id}`} className="uc-focus font-medium text-[--brand-900] hover:text-[--brand-600]">
                      {c.firstName} {c.lastName}
                    </Link>
                    {c.jobTitle && <span className="block text-xs text-muted-foreground">{c.jobTitle}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs">{c.contactType.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2.5 text-xs">{c.organisation?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs font-mono">{c.phone ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs">{c.email ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {c.openTicketCount > 0 ? <Chip value="open" label={String(c.openTicketCount)} /> : <span className="text-xs text-muted-foreground">0</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDateTime(c.updatedAt)}</td>
                </tr>
              ))}
              {(q.data ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No contacts found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <CreateContactDialog open={open} onClose={() => setOpen(false)} />
      <LogCallDialog open={callOpen} onClose={() => setCallOpen(false)} />
    </div>
  );
}

function CreateContactDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const orgsQ = trpc.crm.organisations.useQuery(undefined, { enabled: open });
  const [f, setF] = useState({
    contactType: "family_member", firstName: "", lastName: "", email: "", phone: "",
    jobTitle: "", organisationId: "", preferredChannel: "phone", notes: "",
  });
  const create = trpc.crm.createContact.useMutation({
    onSuccess: () => { utils.crm.contacts.invalidate(); toast.success("Contact created"); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>New contact</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <Select value={f.contactType} onValueChange={(v) => set("contactType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-64">
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Organisation</Label>
            <Select value={f.organisationId} onValueChange={(v) => set("organisationId", v)}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent className="max-h-56">
                {(orgsQ.data ?? []).map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="cc-fn">First name</Label><Input id="cc-fn" value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></div>
          <div><Label htmlFor="cc-ln">Last name</Label><Input id="cc-ln" value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></div>
          <div><Label htmlFor="cc-em">Email</Label><Input id="cc-em" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div><Label htmlFor="cc-ph">Phone</Label><Input id="cc-ph" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div><Label htmlFor="cc-jt">Job title</Label><Input id="cc-jt" value={f.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} /></div>
          <div>
            <Label>Preferred channel</Label>
            <Select value={f.preferredChannel} onValueChange={(v) => set("preferredChannel", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["phone", "email", "sms", "letter"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label htmlFor="cc-n">Notes</Label><Input id="cc-n" value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!f.firstName || !f.lastName || create.isPending}
            onClick={() => create.mutate({
              contactType: f.contactType as never, firstName: f.firstName, lastName: f.lastName,
              email: f.email || undefined, phone: f.phone || undefined,
              jobTitle: f.jobTitle || undefined,
              organisationId: f.organisationId ? Number(f.organisationId) : undefined,
              preferredChannel: f.preferredChannel as never, notes: f.notes || undefined,
            })}>
            Create contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
