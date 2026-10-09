import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, fmtTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CalendarOff, MapPin, Users } from "lucide-react";
import { toast } from "sonner";

export default function MyRota() {
  const utils = trpc.useUtils();
  const q = trpc.rota.myRota.useQuery();
  const unavQ = trpc.rota.myUnavailability.useQuery();
  const meQ = trpc.core.me.useQuery();
  const [offOpen, setOffOpen] = useState(false);

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  const visits = q.data ?? [];
  const byDay = new Map<string, typeof visits>();
  for (const v of visits) {
    const key = new Date(v.scheduledStart).toDateString();
    byDay.set(key, [...(byDay.get(key) ?? []), v]);
  }
  const days = [...byDay.entries()].sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <PageHeader
        title="My rota"
        subtitle={meQ.data ? `${meQ.data.fullName} — upcoming visits` : "Upcoming visits"}
        actions={<Button variant="outline" onClick={() => setOffOpen(true)}><CalendarOff className="h-4 w-4 mr-1.5" /> Report unavailability</Button>}
      />

      {days.length === 0 && (
        <p className="uc-card p-6 text-center text-sm text-muted-foreground">No visits assigned yet. You'll be notified when a rota is published.</p>
      )}
      {days.map(([day, vs]) => (
        <section key={day} aria-label={day}>
          <h2 className="uc-label mb-2">
            {new Date(day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </h2>
          <div className="space-y-2">
            {vs.map((v) => (
              <article key={v.id} className="uc-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[--brand-900] text-base">
                      {fmtTime(v.scheduledStart)} – {fmtTime(v.scheduledEnd)}
                    </p>
                    <p className="text-sm font-medium mt-0.5">
                      {v.client ? `${v.client.firstName} ${v.client.lastName}` : "Visit"}
                    </p>
                    {v.client && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" aria-hidden />
                        {v.client.addressLine1}, {v.client.postcode}
                      </p>
                    )}
                    {v.client?.accessNotes && (
                      <p className="mt-1.5 rounded bg-[--brand-50] border px-2 py-1 text-xs" style={{ borderColor: "var(--line)" }}>
                        {v.client.accessNotes}
                      </p>
                    )}
                    {v.partner && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" aria-hidden /> Double-handed with {v.partner}
                      </p>
                    )}
                    {v.myAssignment?.travelMinutesFromPrevious != null && v.myAssignment.travelMinutesFromPrevious > 0 && (
                      <p className="mt-1 text-[11px] text-muted-foreground">~{v.myAssignment.travelMinutesFromPrevious} min travel from previous visit</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Chip value={v.status} />
                    <span className="text-[11px] text-muted-foreground">{(v.visitType ?? "visit").replace(/_/g, " ")}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      {(unavQ.data ?? []).length > 0 && (
        <section className="uc-card p-4" aria-label="My unavailability">
          <h2 className="uc-label mb-2">My unavailability</h2>
          <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
            {(unavQ.data ?? []).map((u) => (
              <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {new Date(u.startsAt).toLocaleDateString("en-GB")} – {new Date(u.endsAt).toLocaleDateString("en-GB")}
                  <span className="ml-2 text-muted-foreground text-xs">{u.reason.replace(/_/g, " ")}{u.notes ? ` — ${u.notes}` : ""}</span>
                </span>
                <Chip value={u.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <UnavailabilityDialog open={offOpen} onClose={() => setOffOpen(false)}
        onDone={() => { utils.rota.myUnavailability.invalidate(); setOffOpen(false); }} />
    </div>
  );
}

function UnavailabilityDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("sick");
  const [notes, setNotes] = useState("");
  const mark = trpc.rota.markUnavailable.useMutation({
    onSuccess: () => {
      toast.success("Recorded — affected visits are being reassigned automatically where possible");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Report unavailability</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Any visits in this window are reassigned automatically. Where no suitable cover exists, a coordinator is alerted with the nearest options.
        </p>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div><Label htmlFor="un-s">From</Label><Input id="un-s" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label htmlFor="un-e">To</Label><Input id="un-e" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        <div className="mt-3">
          <Label>Reason</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sick">Sickness</SelectItem>
              <SelectItem value="annual_leave">Annual leave</SelectItem>
              <SelectItem value="training">Training</SelectItem>
              <SelectItem value="personal">Personal</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3">
          <Label htmlFor="un-n">Notes (optional)</Label>
          <Textarea id="un-n" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!start || !end || mark.isPending}
            onClick={() => mark.mutate({
              startsAt: `${start}T00:00:00`, endsAt: `${end}T23:59:59`,
              reason: reason as never, notes: notes || undefined,
            })}>
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
