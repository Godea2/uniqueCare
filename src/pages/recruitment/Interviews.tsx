import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtDate, fmtTime, AvatarDot } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CalendarDays, Plus, Trophy, Video } from "lucide-react";
import { toast } from "sonner";

export default function Interviews() {
  const utils = trpc.useUtils();
  const slotsQ = trpc.hr2.slots.useQuery();
  const jobsQ = trpc.hr.jobs.useQuery();
  const staffQ = trpc.core.staffList.useQuery();
  const boardQ = trpc.hr2.leaderboard.useQuery({});
  const [open, setOpen] = useState(false);

  if (slotsQ.isLoading) return <Loading rows={5} />;
  if (slotsQ.error) return <ErrorState message={slotsQ.error.message} onRetry={() => slotsQ.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interviews"
        subtitle="Slots, panel composition, and the combined leaderboard"
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New slot</Button>}
      />

      <section aria-label="Upcoming slots">
        <h2 className="uc-label mb-2">Slots</h2>
        {(slotsQ.data ?? []).length === 0 ? (
          <EmptyState icon={CalendarDays} title="No interview slots" hint="Create slots with a panel; candidates book themselves through their portal link." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {(slotsQ.data ?? []).map((s) => (
              <div key={s.id} className="uc-card p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[--brand-900]">{fmtDate(s.startsAt)}</p>
                  <Chip value={s.bookedCount >= (s.capacity ?? 1) ? "booked" : "open"} label={`${s.bookedCount}/${s.capacity ?? 1} booked`} />
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Video className="h-3.5 w-3.5" aria-hidden />
                  {fmtTime(s.startsAt)}–{fmtTime(s.endsAt)} · {s.locationText ?? "Microsoft Teams"}
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  {(s.panel ?? []).map((p) => (
                    <span key={p} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <AvatarDot name={p} /> {p.split(" ")[0]}
                    </span>
                  ))}
                </div>
                {s.teamsMeetingUrl && (
                  <p className="mt-2 truncate text-[11px] text-muted-foreground" title={s.teamsMeetingUrl}>
                    Teams: {s.teamsMeetingUrl}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Leaderboard">
        <h2 className="uc-label mb-2 flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" aria-hidden /> Leaderboard — interviewed candidates</h2>
        <div className="uc-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
                <th className="px-4 py-2.5 font-medium">Candidate</th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 font-medium text-right">AI score</th>
                <th className="px-4 py-2.5 font-medium text-right">Panel avg</th>
                <th className="px-4 py-2.5 font-medium text-right">Panel %</th>
                <th className="px-4 py-2.5 font-medium text-right">Combined</th>
              </tr>
            </thead>
            <tbody>
              {(boardQ.data ?? []).map((r) => (
                <tr key={r.applicationId} className="border-b last:border-0 hover:bg-[--brand-50]/60" style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-2.5">
                    <Link to={`/recruitment/pipeline/${r.applicationId}`} className="font-medium text-[--brand-900] hover:text-[--brand-600]">
                      {r.candidate?.firstName} {r.candidate?.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5"><Chip value={r.stage} /></td>
                  <td className="px-4 py-2.5 text-right">{r.aiScore ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">{r.panelAvg ?? "—"}{r.panelAvg !== null && "/30"}</td>
                  <td className="px-4 py-2.5 text-right">{r.scorecards > 0 ? `${r.panelPct}%` : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-[--brand-900]">{r.combined}</td>
                </tr>
              ))}
              {(boardQ.data ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No interviewed candidates yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Combined = 50% AI screening score + 50% panel average. Ranking assists the decision — the admin approves or rejects.</p>
      </section>

      <CreateSlotDialog open={open} onClose={() => setOpen(false)}
        jobs={(jobsQ.data ?? []).map((j) => ({ id: Number(j.id), title: j.title }))}
        staff={(staffQ.data ?? []).map((s) => ({ id: Number(s.id), name: s.fullName }))}
        onCreated={() => { utils.hr2.slots.invalidate(); setOpen(false); }}
      />
    </div>
  );
}

function CreateSlotDialog({ open, onClose, jobs, staff, onCreated }: {
  open: boolean; onClose: () => void;
  jobs: { id: number; title: string }[];
  staff: { id: number; name: string }[];
  onCreated: () => void;
}) {
  const [date, setDate] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("10:45");
  const [jobId, setJobId] = useState<string>("");
  const [panel, setPanel] = useState<number[]>([]);
  const [capacity, setCapacity] = useState(1);
  const create = trpc.hr2.createSlot.useMutation({
    onSuccess: () => { toast.success("Slot created"); onCreated(); },
    onError: (e) => toast.error(e.message),
  });

  const togglePanel = (id: number) =>
    setPanel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New interview slot</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="sl-date">Date</Label>
            <Input id="sl-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sl-start">Start</Label>
            <Input id="sl-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sl-end">End</Label>
            <Input id="sl-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <Label>Job (optional)</Label>
          <Select value={jobId} onValueChange={setJobId}>
            <SelectTrigger><SelectValue placeholder="Any job" /></SelectTrigger>
            <SelectContent>
              {jobs.map((j) => <SelectItem key={j.id} value={String(j.id)}>{j.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3">
          <Label>Panel members</Label>
          <div className="mt-1 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {staff.map((s) => (
              <button key={s.id} type="button" onClick={() => togglePanel(s.id)}
                aria-pressed={panel.includes(s.id)}
                className={`rounded-lg border px-2.5 py-1 text-xs uc-focus ${panel.includes(s.id) ? "bg-[--brand-600] text-white border-[--brand-600]" : "bg-white hover:bg-[--brand-50]"}`}
                style={{ borderColor: panel.includes(s.id) ? undefined : "var(--line)" }}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <Label htmlFor="sl-cap">Capacity (candidates per slot)</Label>
          <Input id="sl-cap" type="number" min={1} max={5} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="w-24" />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          A Microsoft Teams join link is generated as a placeholder — replace it with the real meeting link if you use your own Teams account.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!date || panel.length === 0 || create.isPending}
            onClick={() => create.mutate({
              startsAt: `${date}T${start}:00`, endsAt: `${date}T${end}:00`,
              jobPostingId: jobId ? Number(jobId) : undefined,
              panelMemberIds: panel, capacity,
            })}>
            Create slot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
