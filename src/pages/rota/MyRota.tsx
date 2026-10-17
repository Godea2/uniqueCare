import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, fmtTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { CalendarOff, MapPin, Users, LogIn, LogOut, Navigation, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { PROBE_INTERVAL_MS, readLocation } from "@/lib/geolocation";

export default function MyRota() {
  const utils = trpc.useUtils();
  const q = trpc.rota.myRota.useQuery(undefined, { refetchInterval: 60_000 });
  const unavQ = trpc.rota.myUnavailability.useQuery();
  const meQ = trpc.core.me.useQuery();
  const [offOpen, setOffOpen] = useState(false);
  const [clockOutVisit, setClockOutVisit] = useState<number | null>(null);
  const probing = useRef(false);

  const clockIn = trpc.attendance.clockIn.useMutation({
    onSuccess: (r) => {
      toast.success(`Clocked in · ${r.distanceM} m from the address`);
      utils.rota.myRota.invalidate();
      utils.attendance.myActive.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const clockOut = trpc.attendance.clockOut.useMutation({
    onSuccess: (r) => {
      toast.success(`Clocked out · ${r.paidMinutes} paid minutes` + (r.unpaidGraceMinutes ? ` (${r.unpaidGraceMinutes}m unpaid grace)` : ""));
      utils.rota.myRota.invalidate();
      utils.attendance.myActive.invalidate();
      utils.attendance.myTimesheet.invalidate();
      setClockOutVisit(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const probe = trpc.attendance.probe.useMutation({
    onSuccess: (r) => {
      if (r.autoClosed) {
        toast.message("Auto clocked out — you left the visit geofence for 15 minutes. That grace time is unpaid.");
        utils.rota.myRota.invalidate();
      } else if (!r.inside) {
        toast.warning(`Outside the visit geofence (~${r.distanceM} m). Return within 15 minutes or you will be clocked out.`);
      }
    },
  });

  const activeVisitId = (q.data ?? []).find((v) => v.myAttendance?.status === "in_progress")?.id;

  // 15-minute location probes while a visit is open
  useEffect(() => {
    if (!activeVisitId) return;
    const run = async () => {
      if (probing.current) return;
      probing.current = true;
      try {
        const geo = await readLocation({ highAccuracy: true });
        await probe.mutateAsync({
          visitId: Number(activeVisitId),
          lat: geo.lat, lng: geo.lng, accuracyM: geo.accuracyM,
        });
      } catch {
        // silent — next interval retries; don't spam toasts while driving between rooms
      } finally {
        probing.current = false;
      }
    };
    // first probe shortly after clock-in, then every 15 minutes
    const first = window.setTimeout(run, 30_000);
    const id = window.setInterval(run, PROBE_INTERVAL_MS);
    return () => { window.clearTimeout(first); window.clearInterval(id); };
  }, [activeVisitId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  const visits = q.data ?? [];
  const byDay = new Map<string, typeof visits>();
  for (const v of visits) {
    const key = new Date(v.scheduledStart).toDateString();
    byDay.set(key, [...(byDay.get(key) ?? []), v]);
  }
  const days = [...byDay.entries()].sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());

  async function handleClockIn(visitId: number) {
    try {
      const geo = await readLocation({ highAccuracy: true });
      clockIn.mutate({ visitId, lat: geo.lat, lng: geo.lng, accuracyM: geo.accuracyM });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read location");
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <PageHeader
        title="My rota"
        subtitle={meQ.data ? `${meQ.data.fullName} — upcoming visits` : "Upcoming visits"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/rota/timesheets"><ClipboardList className="h-4 w-4 mr-1.5" /> Timesheet</Link>
            </Button>
            <Button variant="outline" onClick={() => setOffOpen(true)}>
              <CalendarOff className="h-4 w-4 mr-1.5" /> Report unavailability
            </Button>
          </div>
        }
      />

      <p className="rounded-lg border bg-[--brand-50]/60 px-3 py-2 text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
        <Navigation className="inline h-3.5 w-3.5 mr-1 text-[--brand-700]" />
        Clock in when you arrive at the client's address (within about 3 metres, allowing for GPS accuracy).
        Stay on the page — location is checked every 15 minutes. Leaving for 15+ minutes auto clock-outs; that grace is unpaid.
      </p>

      {days.length === 0 && (
        <p className="uc-card p-6 text-center text-sm text-muted-foreground">No visits assigned yet. You'll be notified when a rota is published.</p>
      )}
      {days.map(([day, vs]) => (
        <section key={day} aria-label={day}>
          <h2 className="uc-label mb-2">
            {new Date(day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </h2>
          <div className="space-y-2">
            {vs.map((v) => {
              const att = v.myAttendance;
              const inProgress = att?.status === "in_progress";
              const done = att && att.status !== "in_progress";
              const startSoon = Math.abs(new Date(v.scheduledStart).getTime() - Date.now()) < 3 * 3600_000
                || (new Date(v.scheduledStart) <= new Date() && new Date(v.scheduledEnd) >= new Date(Date.now() - 3600_000));
              return (
                <article key={v.id} className={`uc-card p-4 ${inProgress ? "ring-2 ring-[--brand-500]" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
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
                      {inProgress && att?.leftGeofenceAt && (
                        <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                          Outside the geofence since {new Date(att.leftGeofenceAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.
                          Return within 15 minutes or you will be auto clocked out (unpaid).
                        </p>
                      )}
                      {done && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Clocked {att.clockInAt ? new Date(att.clockInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
                          {" → "}
                          {att.clockOutAt ? new Date(att.clockOutAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
                          {att.paidMinutes != null ? ` · ${att.paidMinutes}m paid` : ""}
                          {att.unpaidGraceMinutes ? ` · ${att.unpaidGraceMinutes}m unpaid grace` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Chip value={inProgress ? "in_progress" : done ? (att.status === "auto_closed" ? "missed" : "completed") : v.status}
                        label={inProgress ? "on visit" : done ? (att.clockOutReason?.replaceAll("_", " ") ?? "done") : undefined} />
                      <span className="text-[11px] text-muted-foreground">{(v.visitType ?? "visit").replace(/_/g, " ")}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {!done && !inProgress && startSoon && (
                      <Button
                        size="sm"
                        disabled={clockIn.isPending || !v.clientHasGeo}
                        onClick={() => handleClockIn(Number(v.id))}
                        title={!v.clientHasGeo ? "Client has no postcode / map location" : undefined}
                      >
                        <LogIn className="h-3.5 w-3.5 mr-1.5" />
                        {clockIn.isPending ? "Locating…" : "Clock in"}
                      </Button>
                    )}
                    {inProgress && (
                      <Button size="sm" variant="outline" disabled={clockOut.isPending}
                        onClick={() => setClockOutVisit(Number(v.id))}>
                        <LogOut className="h-3.5 w-3.5 mr-1.5" /> Clock out
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
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

      {clockOutVisit != null && (
        <ClockOutDialog
          visitId={clockOutVisit}
          pending={clockOut.isPending}
          onClose={() => setClockOutVisit(null)}
          onConfirm={async (reason, earlyReasonText) => {
            try {
              let geo: { lat: number; lng: number; accuracyM: number } | undefined;
              try { geo = await readLocation({ highAccuracy: true }); } catch { /* allow clock-out without GPS */ }
              clockOut.mutate({
                visitId: clockOutVisit,
                reason,
                earlyReasonText,
                ...(geo ? { lat: geo.lat, lng: geo.lng, accuracyM: geo.accuracyM } : {}),
              });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Clock-out failed");
            }
          }}
        />
      )}
    </div>
  );
}

function ClockOutDialog({
  visitId, pending, onClose, onConfirm,
}: {
  visitId: number;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: "completed" | "early_client_request" | "early_no_access" | "early_emergency" | "early_other", text?: string) => void;
}) {
  const [reason, setReason] = useState<"completed" | "early_client_request" | "early_no_access" | "early_emergency" | "early_other">("completed");
  const [text, setText] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clock out</DialogTitle>
          <DialogDescription>
            Confirm you are finishing visit #{visitId}. Early finishes need a reason. Time after leaving the geofence is unpaid.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">Visit completed</SelectItem>
                <SelectItem value="early_client_request">Client asked me to leave early</SelectItem>
                <SelectItem value="early_no_access">Could not gain access</SelectItem>
                <SelectItem value="early_emergency">Emergency / incident</SelectItem>
                <SelectItem value="early_other">Other (explain)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {reason !== "completed" && (
            <div>
              <Label htmlFor="early-note">Notes</Label>
              <Textarea id="early-note" value={text} onChange={(e) => setText(e.target.value)} rows={3}
                placeholder="Briefly explain…" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending || (reason === "early_other" && text.trim().length < 3)}
            onClick={() => onConfirm(reason, text.trim() || undefined)}
          >
            {pending ? "Saving…" : "Confirm clock out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
        <DialogHeader>
          <DialogTitle>Report unavailability</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div><Label htmlFor="ua-start">From</Label><Input id="ua-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label htmlFor="ua-end">To</Label><Input id="ua-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <div>
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sick">Sick</SelectItem>
                <SelectItem value="annual_leave">Annual leave</SelectItem>
                <SelectItem value="training">Training</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="ua-notes">Notes</Label><Textarea id="ua-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!start || !end || mark.isPending}
            onClick={() => mark.mutate({
              startsAt: new Date(start).toISOString(),
              endsAt: new Date(end).toISOString(),
              reason: reason as "sick" | "annual_leave" | "training" | "personal" | "other",
              notes: notes || undefined,
            })}>
            {mark.isPending ? "Saving…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
