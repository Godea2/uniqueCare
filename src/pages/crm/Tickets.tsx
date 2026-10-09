import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, PhoneCall } from "lucide-react";
import { toast } from "sonner";

const VIEWS = [
  { key: "all", label: "All" }, { key: "mine", label: "Mine" }, { key: "unassigned", label: "Unassigned" },
  { key: "due_today", label: "Due today" }, { key: "overdue", label: "Overdue" }, { key: "escalated", label: "Escalated" },
] as const;

const CATEGORIES = ["care_query", "complaint", "compliment", "safeguarding_concern", "rota_change", "missed_or_late_visit", "billing_invoice", "new_care_enquiry", "recruitment_query", "hr_staff_query", "medication_query", "commissioner_request", "general"];

export default function Tickets() {
  const [view, setView] = useState<string>("all");
  const [q2, setQ2] = useState("");
  const q = trpc.crm.tickets.useQuery({ view: view as never, q: q2 || undefined });
  const [createOpen, setCreateOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Tickets"
        subtitle="Full lifecycle — SLA timers, escalation, and safeguarding rules built in"
        actions={
          <>
            <Button variant="outline" onClick={() => setCallOpen(true)}><PhoneCall className="h-4 w-4 mr-1.5" /> Log call</Button>
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New ticket</Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full border bg-white p-1" style={{ borderColor: "var(--card-line)" }} role="tablist" aria-label="Ticket views">
          {VIEWS.map((v) => (
            <button key={v.key} role="tab" aria-selected={view === v.key}
              onClick={() => setView(v.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium uc-focus transition-colors ${view === v.key ? "bg-[--brand-600] text-white" : "text-slate-600 hover:bg-[--brand-50]"}`}>
              {v.label}
            </button>
          ))}
        </div>
        <Input placeholder="Search ticket no or subject…" value={q2} onChange={(e) => setQ2(e.target.value)} className="w-56" aria-label="Search tickets" />
      </div>

      {q.isLoading ? <Loading rows={6} /> : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} /> : (
        <div className="uc-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
                <th className="px-4 py-2.5 font-medium">Ticket</th>
                <th className="px-4 py-2.5 font-medium">Requester</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Priority</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Assignee</th>
                <th className="px-4 py-2.5 font-medium">SLA due</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((t) => (
                <tr key={t.id} className={`border-b last:border-0 hover:bg-[--brand-50]/60 ${t.slaBreached ? "bg-red-50/40" : ""}`} style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-2.5">
                    <Link to={`/crm/tickets/${t.id}`} className="uc-focus">
                      <span className="block text-xs text-[--brand-600] font-mono">{t.ticketNo}</span>
                      <span className="block font-medium text-[--brand-900] line-clamp-1 max-w-64">{t.subject}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{t.requester ? `${t.requester.firstName} ${t.requester.lastName}` : "—"}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {t.category === "safeguarding_concern" ? (
                      <span className="font-semibold text-red-700">Safeguarding</span>
                    ) : t.category.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-2.5"><Chip value={t.priority} /></td>
                  <td className="px-4 py-2.5"><Chip value={t.status} /></td>
                  <td className="px-4 py-2.5 text-xs">{t.assignee?.fullName ?? <span className="text-muted-foreground">Unassigned</span>}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {t.dueAt ? (
                      <span className={t.slaBreached ? "font-semibold text-red-700" : "text-muted-foreground"}>
                        {fmtDateTime(t.dueAt)}{t.slaBreached ? " — breached" : ""}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
              {(q.data ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No tickets in this view.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <CreateTicketDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <LogCallDialog open={callOpen} onClose={() => setCallOpen(false)} />
    </div>
  );
}

function CreateTicketDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const [f, setF] = useState({
    subject: "", description: "", category: "general", priority: "normal",
    channel: "phone", requesterContactId: "", useAi: false,
  });
  const [contactQ, setContactQ] = useState("");
  const contactsQ = trpc.crm.contacts.useQuery({ q: contactQ || undefined }, { enabled: open });
  const create = trpc.crm.createTicket.useMutation({
    onSuccess: (r) => {
      utils.crm.tickets.invalidate();
      toast.success(`Ticket ${r.ticketNo} created`);
      onClose();
      navigate(`/crm/tickets/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New ticket</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="t-sub">Subject</Label>
            <Input id="t-sub" value={f.subject} onChange={(e) => setF((s) => ({ ...s, subject: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="t-desc">Description</Label>
            <Textarea id="t-desc" rows={3} value={f.description} onChange={(e) => setF((s) => ({ ...s, description: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="t-req">Requester</Label>
            <Input id="t-req" placeholder="Search contacts…" value={contactQ} onChange={(e) => setContactQ(e.target.value)} />
            {(contactsQ.data ?? []).length > 0 && contactQ && (
              <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border" style={{ borderColor: "var(--line)" }}>
                {(contactsQ.data ?? []).slice(0, 6).map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => { setF((s) => ({ ...s, requesterContactId: String(c.id) })); setContactQ(`${c.firstName} ${c.lastName}`); }}
                    className={`uc-focus block w-full px-3 py-1.5 text-left text-sm hover:bg-[--brand-50] ${f.requesterContactId === String(c.id) ? "bg-[--brand-50] font-medium" : ""}`}>
                    {c.firstName} {c.lastName} <span className="text-xs text-muted-foreground">{c.phone ?? c.email ?? ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={f.category} onValueChange={(v) => setF((s) => ({ ...s, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={f.priority} onValueChange={(v) => setF((s) => ({ ...s, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Channel</Label>
              <Select value={f.channel} onValueChange={(v) => setF((s) => ({ ...s, channel: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["phone", "email", "sms", "web", "walk_in", "internal"].map((c) => (
                    <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.useAi} onCheckedChange={(v) => setF((s) => ({ ...s, useAi: v === true }))} />
            Classify with AI (category + priority suggestion — you can override)
          </label>
          {f.category === "safeguarding_concern" && (
            <p className="rounded-lg border border-red-300 bg-red-50 p-2.5 text-xs text-red-800">
              Safeguarding tickets are urgent, visible to management only, and alert the Registered Manager immediately.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={f.subject.length < 3 || create.isPending}
            onClick={() => create.mutate({
              subject: f.subject, description: f.description || undefined,
              category: f.category as never, priority: f.priority as never, channel: f.channel as never,
              requesterContactId: f.requesterContactId ? Number(f.requesterContactId) : undefined,
              useAiClassify: f.useAi,
            })}>
            Create ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LogCallDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [phone, setPhone] = useState("");
  const [type, setType] = useState("inbound_call");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [contactId, setContactId] = useState<number | null>(null);
  const [followUp, setFollowUp] = useState("none");
  const lookup = trpc.crm.lookupCaller.useQuery({ phone }, { enabled: phone.replace(/\D/g, "").length >= 10 });
  const log = trpc.crm.logInteraction.useMutation({
    onSuccess: () => {
      utils.crm.contacts.invalidate(); utils.crm.myTasks.invalidate();
      toast.success(type === "missed_call" || type === "voicemail" ? "Logged — return-call task created" : "Call logged");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const found = lookup.data?.contact;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Log a call</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lc-phone">Caller number</Label>
              <Input id="lc-phone" value={phone} onChange={(e) => { setPhone(e.target.value); setContactId(null); }} placeholder="07700 900123" />
            </div>
            <div>
              <Label>Call type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbound_call">Inbound call</SelectItem>
                  <SelectItem value="outbound_call">Outbound call</SelectItem>
                  <SelectItem value="missed_call">Missed call</SelectItem>
                  <SelectItem value="voicemail">Voicemail</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {phone.replace(/\D/g, "").length >= 10 && (
            <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--line)" }}>
              {lookup.isLoading ? "Looking up caller…" : found ? (
                <button type="button" onClick={() => setContactId(Number(found.id))}
                  className={`uc-focus w-full text-left ${contactId === Number(found.id) ? "font-semibold text-[--brand-700]" : ""}`}>
                  <span className="font-medium">{found.firstName} {found.lastName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{found.contactType.replace(/_/g, " ")}</span>
                  {(lookup.data?.openTickets.length ?? 0) > 0 && (
                    <span className="ml-2 text-xs text-amber-700">{lookup.data!.openTickets.length} open ticket(s)</span>
                  )}
                  {(lookup.data?.recent ?? []).slice(0, 1).map((r) => (
                    <span key={r.id} className="block text-xs text-muted-foreground mt-0.5">Last contact: {r.subject}</span>
                  ))}
                  {contactId === Number(found.id) && <span className="block text-xs text-[--brand-600] mt-0.5">✓ Linked to this call</span>}
                </button>
              ) : "No match — the call will be logged without a contact."}
            </div>
          )}

          <div>
            <Label htmlFor="lc-sub">Subject</Label>
            <Input id="lc-sub" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Mrs Patel asking about tomorrow's visit time" />
          </div>
          <div>
            <Label htmlFor="lc-body">Notes</Label>
            <Textarea id="lc-body" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div>
            <Label>Follow-up task</Label>
            <Select value={followUp} onValueChange={setFollowUp}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="tomorrow">Tomorrow</SelectItem>
                <SelectItem value="3days">In 3 days</SelectItem>
                <SelectItem value="week">In a week</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={subject.length < 2 || log.isPending}
            onClick={() => log.mutate({
              type: type as never, subject, body: body || undefined,
              contactId: contactId ?? undefined, createFollowUp: followUp as never,
            })}>
            Log call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
