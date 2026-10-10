import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, fmtDate, fmtTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GraduationCap, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function Training() {
  const coursesQ = trpc.hr2.courses.useQuery();
  const sessionsQ = trpc.hr2.sessions.useQuery();
  const pipelineQ = trpc.hr.pipeline.useQuery({});
  const [dbsOpen, setDbsOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);

  if (coursesQ.isLoading || sessionsQ.isLoading) return <Loading rows={5} />;
  if (coursesQ.error) return <ErrorState message={coursesQ.error.message} onRetry={() => coursesQ.refetch()} />;

  const inTraining = (pipelineQ.data ?? []).filter((a) =>
    ["offer_accepted", "training_booked", "online_training_in_progress", "dbs_verified"].includes(a.stage));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training & DBS check-in"
        subtitle="Online courses, classroom induction, and DBS verification at the door"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setSessionOpen(true)}><GraduationCap className="h-4 w-4 mr-1.5" /> New session</Button>
            <Button onClick={() => setDbsOpen(true)}><ShieldCheck className="h-4 w-4 mr-1.5" /> DBS check-in</Button>
          </div>
        }
      />

      <section aria-label="Candidates in training">
        <h2 className="uc-label mb-2">New starters in training</h2>
        {inTraining.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody currently in the training stage.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {inTraining.map((a) => (
              <Link key={a.id} to={`/recruitment/pipeline/${a.id}`} className="uc-card p-4 block hover:shadow-md transition-shadow uc-focus">
                <p className="font-medium text-[--brand-900]">{a.candidate?.firstName} {a.candidate?.lastName}</p>
                <p className="text-xs text-muted-foreground">{a.job?.title}</p>
                <div className="mt-2"><Chip value={a.stage} /></div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Classroom sessions">
        <h2 className="uc-label mb-2">Classroom sessions</h2>
        <div className="space-y-3">
          {(sessionsQ.data ?? []).map((s) => (
            <div key={s.id} className="uc-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-[--brand-900]">{s.course?.title ?? "Session"}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(s.startsAt)} {fmtTime(s.startsAt)}–{fmtTime(s.endsAt)} · {s.location ?? "Office"}
                  </p>
                </div>
                <Chip value="scheduled" label={`${s.attendees.length}/${s.capacity ?? 12} booked`} />
              </div>
              {s.attendees.length > 0 && (
                <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                  <table className="w-full text-sm">
                    <tbody>
                      {s.attendees.map((at) => (
                        <tr key={at.id} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                          <td className="py-1.5">
                            {at.applicationId
                              ? <Link to={`/recruitment/pipeline/${at.applicationId}`} className="hover:underline">{at.name}</Link>
                              : at.name}
                          </td>
                          <td className="py-1.5 text-right space-x-1">
                            {at.personType === "candidate" && (
                              <Chip value={at.dbsVerified ? "verified" : "pending"} label={at.dbsVerified ? "DBS checked" : "DBS not checked"} />
                            )}
                            <Chip value={at.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {(sessionsQ.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No sessions scheduled.</p>
          )}
        </div>
      </section>

      <section aria-label="Course catalogue">
        <h2 className="uc-label mb-2">Course catalogue</h2>
        <div className="uc-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
                <th className="px-4 py-2.5 font-medium">Course</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Mandatory</th>
                <th className="px-4 py-2.5 font-medium">Valid for</th>
              </tr>
            </thead>
            <tbody>
              {(coursesQ.data ?? []).map((c) => (
                <tr key={c.id} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-2.5 font-medium">{c.title}</td>
                  <td className="px-4 py-2.5"><Chip value={c.type === "online" ? "open" : "scheduled"} label={c.type} /></td>
                  <td className="px-4 py-2.5">{c.mandatory ? <span className="text-[--brand-700] font-medium">Yes</span> : "No"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.renewEveryMonths ? `${c.renewEveryMonths} months` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <SessionDialog open={sessionOpen} onClose={() => setSessionOpen(false)}
        courses={(coursesQ.data ?? []).map((c) => ({ id: Number(c.id), title: c.title }))} />
      <DbsDialog open={dbsOpen} onClose={() => setDbsOpen(false)} candidates={inTraining.map((a) => ({
        id: Number(a.id), name: `${a.candidate?.firstName} ${a.candidate?.lastName}`,
      }))} />
    </div>
  );
}

function SessionDialog({ open, onClose, courses }: {
  open: boolean; onClose: () => void; courses: { id: number; title: string }[];
}) {
  const utils = trpc.useUtils();
  const [courseId, setCourseId] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("16:00");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("12");
  const [trainer, setTrainer] = useState("");
  const create = trpc.hr2.createSession.useMutation({
    onSuccess: () => {
      utils.hr2.sessions.invalidate();
      toast.success("Training session scheduled");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const valid = courseId && date && start && end && start < end;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Schedule classroom session</DialogTitle></DialogHeader>
        <div className="mt-2 space-y-3">
          <div>
            <Label>Course</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger><SelectValue placeholder="Select course…" /></SelectTrigger>
              <SelectContent>
                {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="sess-date">Date</Label>
              <Input id="sess-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="sess-start">Start</Label>
              <Input id="sess-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="sess-end">End</Label>
              <Input id="sess-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sess-loc">Location</Label>
              <Input id="sess-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Head office, training room 1" />
            </div>
            <div>
              <Label htmlFor="sess-cap">Capacity</Label>
              <Input id="sess-cap" type="number" min={1} max={100} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="sess-trainer">Trainer (optional)</Label>
            <Input id="sess-trainer" value={trainer} onChange={(e) => setTrainer(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!valid || create.isPending}
            onClick={() => create.mutate({
              courseId: Number(courseId),
              startsAt: new Date(`${date}T${start}:00`).toISOString(),
              endsAt: new Date(`${date}T${end}:00`).toISOString(),
              location: location || undefined,
              capacity: Number(capacity) || 12,
              trainerName: trainer || undefined,
            })}>
            <GraduationCap className="h-4 w-4 mr-1.5" /> Schedule session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DbsDialog({ open, onClose, candidates }: {
  open: boolean; onClose: () => void; candidates: { id: number; name: string }[];
}) {
  const utils = trpc.useUtils();
  const [appId, setAppId] = useState("");
  const [cert, setCert] = useState("");
  const [sighted, setSighted] = useState(false);
  const [barred, setBarred] = useState(false);
  const [update, setUpdate] = useState(false);
  const [notes, setNotes] = useState("");
  const checkin = trpc.hr2.dbsCheckIn.useMutation({
    onSuccess: () => {
      utils.hr.pipeline.invalidate();
      toast.success("DBS verification recorded — immutable");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>DBS check-in</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Recorded at classroom check-in. This record is immutable — it cannot be edited after saving.
        </p>
        <div className="mt-2 space-y-3">
          <div>
            <Label>Candidate</Label>
            <Select value={appId} onValueChange={setAppId}>
              <SelectTrigger><SelectValue placeholder="Select candidate…" /></SelectTrigger>
              <SelectContent>
                {candidates.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="dbs-cert">Certificate number</Label>
            <Input id="dbs-cert" value={cert} onChange={(e) => setCert(e.target.value)} placeholder="001234567890" />
          </div>
          <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={sighted} onCheckedChange={(v) => setSighted(v === true)} />
              I have sighted the ORIGINAL certificate (not a copy)
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={barred} onCheckedChange={(v) => setBarred(v === true)} />
              Barred list (adults) check completed
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={update} onCheckedChange={(v) => setUpdate(v === true)} />
              DBS Update Service checked
            </label>
          </div>
          <div>
            <Label htmlFor="dbs-notes">Notes (optional)</Label>
            <Input id="dbs-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!appId || cert.length < 4 || !sighted || !barred || checkin.isPending}
            onClick={() => checkin.mutate({
              applicationId: Number(appId), certificateNo: cert,
              sightedOriginal: true as const, barredListAdultsChecked: true as const,
              updateServiceChecked: update, notes: notes || undefined,
            })}>
            <GraduationCap className="h-4 w-4 mr-1.5" /> Record verification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
