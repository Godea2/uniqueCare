import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";

export default function Incidents() {
  const utils = trpc.useUtils();
  const q = trpc.cqc.incidents.useQuery();
  const clientsQ = trpc.rota.clients.useQuery();
  const [open, setOpen] = useState(false);
  const close = trpc.cqc.closeIncident.useMutation({
    onSuccess: () => { utils.cqc.incidents.invalidate(); toast.success("Incident closed"); },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <Loading rows={5} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  return (
    <div>
      <PageHeader
        title="Incidents"
        subtitle="Serious and notifiable incidents alert the Registered Manager immediately"
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Log incident</Button>}
      />
      {(q.data ?? []).length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No incidents recorded" />
      ) : (
        <div className="space-y-2">
          {(q.data ?? []).map((i) => (
            <div key={i.id} className="uc-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-[--brand-900]">{i.category}</p>
                    <Chip value={i.severity} />
                    {i.notifiableToCqc && <Chip value="escalated" label="notifiable to CQC" />}
                    <Chip value={i.status} />
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{i.description}</p>
                  {i.actionsTaken && (
                    <p className="mt-1.5 text-xs text-muted-foreground"><strong>Actions taken:</strong> {i.actionsTaken}</p>
                  )}
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {i.client ? `${i.client.firstName} ${i.client.lastName} · ` : ""}
                    {i.staff ? `${i.staff.fullName} · ` : ""}
                    occurred {fmtDateTime(i.occurredAt)}
                  </p>
                </div>
                {i.status !== "closed" && (
                  <Button size="sm" variant="outline" disabled={close.isPending} onClick={() => close.mutate({ id: Number(i.id) })}>
                    Close
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <LogIncidentDialog open={open} onClose={() => setOpen(false)}
        clients={(clientsQ.data ?? []).map((c) => ({ id: Number(c.id), name: `${c.firstName} ${c.lastName}` }))}
        onDone={() => { utils.cqc.incidents.invalidate(); setOpen(false); }} />
    </div>
  );
}

function LogIncidentDialog({ open, onClose, clients, onDone }: {
  open: boolean; onClose: () => void; clients: { id: number; name: string }[]; onDone: () => void;
}) {
  const [f, setF] = useState({
    clientId: "", occurredAt: new Date().toISOString().slice(0, 10),
    category: "", description: "", severity: "low" as string, actionsTaken: "", notifiable: false,
  });
  const log = trpc.cqc.logIncident.useMutation({
    onSuccess: () => { toast.success("Incident logged"); onDone(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Log incident</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Client (if applicable)</Label>
              <Select value={f.clientId} onValueChange={(v) => setF((s) => ({ ...s, clientId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent className="max-h-56">
                  {clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="in-when">Date occurred</Label>
              <Input id="in-when" type="date" value={f.occurredAt} onChange={(e) => setF((s) => ({ ...s, occurredAt: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="in-cat">Category</Label>
              <Input id="in-cat" value={f.category} onChange={(e) => setF((s) => ({ ...s, category: e.target.value }))}
                placeholder="e.g. Fall, medication error, missed visit" />
            </div>
            <div>
              <Label>Severity</Label>
              <Select value={f.severity} onValueChange={(v) => setF((s) => ({ ...s, severity: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="serious">Serious</SelectItem>
                  <SelectItem value="severe">Severe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="in-desc">What happened</Label>
            <Textarea id="in-desc" rows={3} value={f.description} onChange={(e) => setF((s) => ({ ...s, description: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="in-act">Actions taken</Label>
            <Textarea id="in-act" rows={2} value={f.actionsTaken} onChange={(e) => setF((s) => ({ ...s, actionsTaken: e.target.value }))} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={f.notifiable} onCheckedChange={(v) => setF((s) => ({ ...s, notifiable: v === true }))} />
            <span>Notifiable to CQC <span className="text-muted-foreground">(Regulation 18 — alerts the Registered Manager immediately)</span></span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={f.category.length < 3 || f.description.length < 10 || log.isPending}
            onClick={() => log.mutate({
              clientId: f.clientId ? Number(f.clientId) : undefined,
              occurredAt: f.occurredAt, category: f.category, description: f.description,
              severity: f.severity as never, actionsTaken: f.actionsTaken || undefined,
              notifiableToCqc: f.notifiable,
            })}>
            Log incident
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
