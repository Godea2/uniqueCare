import { useMemo, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtDate, fmtTime, AvatarDot } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { BellOff, CalendarDays, Mail, Plus, Sparkles, Trash2, Trophy, Video } from "lucide-react";
import { toast } from "sonner";

type DraftSlot = { date: string; start: string; end: string };

function emptyDraft(): DraftSlot {
  return { date: "", start: "10:00", end: "10:45" };
}

/** Local weekday suggestions: next 3 business mornings/afternoons. */
function suggestDrafts(count = 3): DraftSlot[] {
  const hours = [10, 11, 14];
  const out: DraftSlot[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1);
  while (out.length < count) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      const hour = hours[out.length % hours.length]!;
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      const d = String(cursor.getDate()).padStart(2, "0");
      const start = `${String(hour).padStart(2, "0")}:00`;
      const endMin = hour * 60 + 45;
      const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
      out.push({ date: `${y}-${m}-${d}`, start, end });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export default function Interviews() {
  const utils = trpc.useUtils();
  const slotsQ = trpc.hr2.slots.useQuery();
  const jobsQ = trpc.hr.jobs.useQuery();
  const staffQ = trpc.core.staffList.useQuery();
  const boardQ = trpc.hr2.leaderboard.useQuery({});
  const [open, setOpen] = useState(false);

  const openAvailable = useMemo(
    () => (slotsQ.data ?? []).filter((s) => s.state === "available").length,
    [slotsQ.data],
  );

  if (slotsQ.isLoading) return <Loading rows={5} />;
  if (slotsQ.error) return <ErrorState message={slotsQ.error.message} onRetry={() => slotsQ.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interviews"
        subtitle="Offer 3+ times, candidates pick one, double-booking is blocked"
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Offer slots</Button>}
      />

      {openAvailable < 3 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Only {openAvailable} open slot{openAvailable === 1 ? "" : "s"} right now. Offer at least three distinct times so candidates can choose without friction.
        </p>
      )}

      <section aria-label="Upcoming slots">
        <h2 className="uc-label mb-2">Slots</h2>
        {(slotsQ.data ?? []).length === 0 ? (
          <EmptyState icon={CalendarDays} title="No interview slots" hint="Offer at least three date/time choices with a panel; candidates book through their portal link." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {(slotsQ.data ?? []).map((s) => (
              <div key={s.id} className="uc-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-[--brand-900]">{fmtDate(s.startsAt)}</p>
                  <Chip
                    value={s.state === "closed" ? "closed" : s.state}
                    label={`${s.stateLabel} · ${s.bookedCount}/${s.capacity ?? 1}`}
                  />
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

      <CreateSlotsDialog open={open} onClose={() => setOpen(false)}
        jobs={(jobsQ.data ?? []).map((j) => ({ id: Number(j.id), title: j.title }))}
        staff={(staffQ.data ?? []).map((s) => ({ id: Number(s.id), name: s.fullName }))}
        onCreated={() => { utils.hr2.slots.invalidate(); setOpen(false); }}
      />
    </div>
  );
}

function CreateSlotsDialog({ open, onClose, jobs, staff, onCreated }: {
  open: boolean; onClose: () => void;
  jobs: { id: number; title: string }[];
  staff: { id: number; name: string }[];
  onCreated: () => void;
}) {
  const [drafts, setDrafts] = useState<DraftSlot[]>(() => suggestDrafts(3));
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
  const create = trpc.hr2.createSlots.useMutation({
    onSuccess: (res) => {
      toast.success(res.readyNow > 0
        ? `${res.count} slots offered. Emailing ${res.readyNow} candidate${res.readyNow === 1 ? "" : "s"} who can book now.`
        : `${res.count} interview slots offered.`);
      onCreated();
    },
    onError: (e) => toast.error(e.message),
  });

  const togglePanel = (id: number) =>
    setPanel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const updateDraft = (i: number, patch: Partial<DraftSlot>) =>
    setDrafts((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const removeDraft = (i: number) =>
    setDrafts((rows) => (rows.length <= 3 ? rows : rows.filter((_, idx) => idx !== i)));

  const valid = drafts.length >= 3
    && drafts.every((d) => d.date && d.end > d.start)
    && panel.length > 0
    && (!meetingUrl || /^https:\/\//.test(meetingUrl));

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) onClose();
      else setDrafts((d) => (d.some((x) => x.date) ? d : suggestDrafts(3)));
    }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Offer interview times</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Create at least three distinct slots. Candidates pick one in their portal; full slots show as booked and cannot be double-booked.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setDrafts(suggestDrafts(3))}>
            <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Suggest 3 weekdays
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setDrafts((d) => [...d, emptyDraft()])}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add time
          </Button>
          <span className="text-[11px] text-muted-foreground">{drafts.length} slot{drafts.length === 1 ? "" : "s"} (min 3)</span>
        </div>

        <div className="mt-3 space-y-3">
          {drafts.map((d, i) => {
            const startsInPast = !!d.date && new Date(`${d.date}T${d.start}:00`).getTime() <= Date.now();
            return (
              <div key={i} className="rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-[--brand-900]">Slot {i + 1}</p>
                  {drafts.length > 3 && (
                    <button type="button" className="text-muted-foreground hover:text-rose-600" onClick={() => removeDraft(i)} aria-label={`Remove slot ${i + 1}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor={`sl-date-${i}`}>Date</Label>
                    <Input id={`sl-date-${i}`} type="date" value={d.date} onChange={(e) => updateDraft(i, { date: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor={`sl-start-${i}`}>Start</Label>
                    <Input id={`sl-start-${i}`} type="time" value={d.start} onChange={(e) => updateDraft(i, { start: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor={`sl-end-${i}`}>End</Label>
                    <Input id={`sl-end-${i}`} type="time" value={d.end} onChange={(e) => updateDraft(i, { end: e.target.value })} />
                  </div>
                </div>
                {startsInPast && (
                  <p className="mt-1.5 text-xs text-amber-700">This start time has already passed.</p>
                )}
              </div>
            );
          })}
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
                Anyone who finishes the pre-interview form{jobId ? " for this job" : ""} while a slot still has room gets an email to book.
                {onTheWay > 0 && ` ${onTheWay} ${onTheWay === 1 ? "is" : "are"} on the way now.`}
              </span>
            </span>
          </label>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!valid || create.isPending}
            onClick={() => create.mutate({
              slots: drafts.map((d) => ({
                startsAt: new Date(`${d.date}T${d.start}:00`).toISOString(),
                endsAt: new Date(`${d.date}T${d.end}:00`).toISOString(),
              })),
              jobPostingId: jobId ? Number(jobId) : undefined,
              panelMemberIds: panel, capacity,
              meetingUrl: meetingUrl.trim() || undefined, locationText: locationText.trim() || undefined,
              notifyNow, notifyLater,
            })}>
            Offer {drafts.length} slots
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
