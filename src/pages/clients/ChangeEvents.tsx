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

const TYPES = [
  "health_change", "mobility_change", "hospital_admission", "hospital_discharge",
  "medication_change", "incident", "safeguarding", "family_request", "other",
] as const;

export default function ChangeEvents() {
  const utils = trpc.useUtils();
  const q = trpc.cqc.changeEvents.useQuery();
  const clientsQ = trpc.rota.clients.useQuery();
  const [open, setOpen] = useState(false);

  if (q.isLoading) return <Loading rows={5} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  return (
    <div>
      <PageHeader
        title="Change events"
        subtitle="Significant changes in a client's circumstances — a triggering event starts a plan review immediately"
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Log event</Button>}
      />
      {(q.data ?? []).length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No change events" hint="Log hospital admissions, medication changes, and anything that should trigger a plan review." />
      ) : (
        <div className="space-y-2">
          {(q.data ?? []).map((e) => (
            <div key={e.id} className="uc-card p-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-[--brand-900]">{e.client?.firstName} {e.client?.lastName}</p>
                  <Chip value={e.type === "safeguarding" ? "urgent" : e.type.includes("hospital") ? "high" : "normal"} label={e.type.replace(/_/g, " ")} />
                  {e.triggersReview && <Chip value="escalated" label="review triggered" />}
                </div>
                <p className="mt-1 text-sm">{e.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reported by {e.reportedBy} · occurred {fmtDateTime(e.occurredAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      <LogEventDialog open={open} onClose={() => setOpen(false)}
        clients={(clientsQ.data ?? []).map((c) => ({ id: Number(c.id), name: `${c.firstName} ${c.lastName} (${c.clientRef})` }))}
        onDone={() => { utils.cqc.changeEvents.invalidate(); utils.cqc.reviews.invalidate(); utils.cqc.plans.invalidate(); setOpen(false); }} />
    </div>
  );
}

function LogEventDialog({ open, onClose, clients, onDone }: {
  open: boolean; onClose: () => void; clients: { id: number; name: string }[]; onDone: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [type, setType] = useState<string>("health_change");
  const [desc, setDesc] = useState("");
  const [when, setWhen] = useState(new Date().toISOString().slice(0, 10));
  const [triggers, setTriggers] = useState(true);
  const log = trpc.cqc.logChangeEvent.useMutation({
    onSuccess: () => { toast.success("Event logged"); onDone(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Log change event</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
              <SelectContent className="max-h-56">
                {clients.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Event type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ce-when">Occurred</Label>
              <Input id="ce-when" type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="ce-desc">What happened</Label>
            <Textarea id="ce-desc" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={triggers} onCheckedChange={(v) => setTriggers(v === true)} />
            <span>This should trigger a care plan review <span className="text-muted-foreground">(creates a review task and a pre-filled updated draft immediately)</span></span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!clientId || desc.length < 5 || log.isPending}
            onClick={() => log.mutate({ clientId: Number(clientId), type: type as never, description: desc, occurredAt: when, triggersReview: triggers })}>
            Log event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
