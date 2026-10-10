import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtDate, fmtTime, AvatarDot } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { BellOff, CalendarDays, Mail, Plus, Trophy, Video } from "lucide-react";
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
                  {new Date(s.startsAt).getTime() <= Date.now()
                    ? <Chip value="closed" label={`Past · ${s.bookedCount}/${s.capacity ?? 1} booked`} />
                    : <Chip value={s.bookedCount >= (s.capacity ?? 1) ? "booked" : "open"} label={`${s.bookedCount}/${s.capacity ?? 1} booked`} />}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Video className="h-3.5 w-3.5" aria-hidden />
                  {fmtTime(s.startsAt)}–{fmtTime(s.endsAt)} · {s.locationText ?? "Interview"}
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  {(s.panel ?? []).map((p) => (
                    <span key={p} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <AvatarDot name={p} /> {p.split(" ")[0]}
                    </span>
                  ))}
                </div>
                {s.notifyNewCandidates === false && (
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <BellOff className="h-3 w-3" aria-hidden /> New candidates aren't emailed about this slot
                  </p>
                )}
                {s.teamsMeetingUrl && (
                  <a className="mt-2 block truncate text-[11px] text-[--brand-700] underline" href={s.teamsMeetingUrl}
                    target="_blank" rel="noreferrer" title={s.teamsMeetingUrl}>
                    {s.teamsMeetingUrl}
                  </a>
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
  const [meetingUrl, setMeetingUrl] = useState("");
  const [locationText, setLocationText] = useState("");
  const [notifyNow, setNotifyNow] = useState(true);
  const [notifyLater, setNotifyLater] = useState(true);
  const audienceQ = trpc.hr2.slotAudience.useQuery({ jobPostingId: jobId ? Number(jobId) : undefined }, { enabled: open });
  const readyNow = audienceQ.data?.readyNow ?? 0;
  const onTheWay = audienceQ.data?.onTheWay ?? 0;
  const create = trpc.hr2.createSlot.useMutation({
    onSuccess: (res) => {
      toast.success(res.readyNow > 0
        ? `Slot created. Emailing ${res.readyNow} candidate${res.readyNow === 1 ? "" : "s"} who can book now.`
        : "Slot created.");
      if (!res.laterSaved) {
        toast.warning("New candidates will still be emailed about this slot. Run the 0003 SQL in Supabase to turn that off per slot.");
      }
      onCreated();
    },
    onError: (e) => toast.error(e.message),
  });

  const togglePanel = (id: number) =>
    setPanel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const startsInPast = !!date && new Date(`${date}T${start}:00`).getTime() <= Date.now();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
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
        {startsInPast && (
          <p className="mt-2 text-xs text-amber-700">This start time has already passed. While the system is being built, candidates can still see and book it.</p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">Each slot is one interview. Create one slot per interview time.</p>
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
        <div className="mt-3">
          <Label htmlFor="sl-url">Meeting link (optional)</Label>
          <Input id="sl-url" type="url" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder="Paste the Teams, Zoom or Google Meet link" />
          <p className="mt-1 text-[11px] text-muted-foreground">Candidates see this link once they book. Leave it blank for a face-to-face interview.</p>
        </div>
        <div className="mt-3">
          <Label htmlFor="sl-loc">Where</Label>
          <Input id="sl-loc" value={locationText} onChange={(e) => setLocationText(e.target.value)}
            placeholder={meetingUrl ? "Video interview" : "Office address"} />
        </div>
        <fieldset className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
          <legend className="flex items-center gap-1.5 px-1 text-sm font-medium text-[--brand-900]">
            <Mail className="h-3.5 w-3.5" aria-hidden /> Let candidates know
          </legend>
          <label className="flex items-start gap-2.5 py-1.5 text-sm">
            <Checkbox className="mt-0.5" checked={notifyNow} onCheckedChange={(v) => setNotifyNow(v === true)} />
            <span>
              <span className="font-medium text-slate-800">Email candidates who can book now</span>
              <span className="block text-xs text-muted-foreground">
                {audienceQ.isLoading ? "Counting…"
                  : readyNow === 0 ? `Nobody${jobId ? " for this job" : ""} has finished their pre-interview form yet.`
                  : `${readyNow} candidate${readyNow === 1 ? " has" : "s have"} finished the pre-interview form${jobId ? " for this job" : ""} and ${readyNow === 1 ? "is" : "are"} waiting for a time.`}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 py-1.5 text-sm">
            <Checkbox className="mt-0.5" checked={notifyLater} onCheckedChange={(v) => setNotifyLater(v === true)} />
            <span>
              <span className="font-medium text-slate-800">Also email candidates who become ready later</span>
              <span className="block text-xs text-muted-foreground">
                Anyone who finishes the pre-interview form{jobId ? " for this job" : ""} while this slot still has room gets an email to book.
                {onTheWay > 0 && ` ${onTheWay} ${onTheWay === 1 ? "is" : "are"} on the way now.`}
              </span>
            </span>
          </label>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Only shortlisted candidates who have completed their pre-interview form can book. Nobody gets this email more than once a day.
          </p>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!date || panel.length === 0 || end <= start || create.isPending || (!!meetingUrl && !/^https:\/\//.test(meetingUrl))}
            onClick={() => create.mutate({
              startsAt: new Date(`${date}T${start}:00`).toISOString(), endsAt: new Date(`${date}T${end}:00`).toISOString(),
              jobPostingId: jobId ? Number(jobId) : undefined,
              panelMemberIds: panel, capacity,
              meetingUrl: meetingUrl.trim() || undefined, locationText: locationText.trim() || undefined,
              notifyNow, notifyLater,
            })}>
            Create slot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
