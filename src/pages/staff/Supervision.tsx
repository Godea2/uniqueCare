import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtDateTime, AvatarDot, AiError, AiBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ClipboardList, Mic, Keyboard, Star, Plus } from "lucide-react";
import { toast } from "sonner";

const NOTE_TYPES = [
  { value: "spot_check", label: "Spot check" },
  { value: "supervision", label: "Supervision" },
  { value: "verbal_feedback", label: "Verbal feedback" },
  { value: "observation", label: "Observation" },
] as const;

export default function Supervision() {
  const [staffId, setStaffId] = useState<number | undefined>(undefined);
  const q = trpc.cqc.supervisorNotes.useQuery({ staffId });
  const staffQ = trpc.core.staffList.useQuery();
  const [open, setOpen] = useState(false);

  if (q.isLoading) return <Loading rows={5} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  return (
    <div>
      <PageHeader
        title="Supervision notes"
        subtitle="Spot checks, supervisions and feedback — structured against the CQC five key questions"
        actions={
          <>
            <Select value={staffId ? String(staffId) : "all"} onValueChange={(v) => setStaffId(v === "all" ? undefined : Number(v))}>
              <SelectTrigger className="w-52"><SelectValue placeholder="All staff" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                {(staffQ.data ?? []).filter((s) => ["care_worker", "senior"].some((r) => s.role.includes(r)) || s.role === "care_worker").map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Record note</Button>
          </>
        }
      />

      {(q.data ?? []).length === 0 ? (
        <EmptyState icon={ClipboardList} title="No notes yet" hint="Record spot checks and supervisions here — they feed appraisals and CQC evidence." />
      ) : (
        <div className="space-y-3">
          {(q.data ?? []).map((n) => {
            const structured = (n.structured as Record<string, string> | null) ?? {};
            const actions = (n.actions as { action: string; dueDate?: string }[] | null) ?? [];
            return (
              <article key={n.id} className="uc-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <AvatarDot name={n.staff?.fullName ?? "?"} color={n.staff?.avatarColor} />
                    <div>
                      <p className="font-medium text-[--brand-900]">{n.staff?.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        by {n.supervisorName} · {fmtDateTime(n.createdAt)}
                        {n.client ? ` · re: ${n.client.firstName} ${n.client.lastName}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip value={n.noteType === "spot_check" ? "open" : n.noteType === "supervision" ? "scheduled" : "pending"} label={n.noteType.replace(/_/g, " ")} />
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      {n.method === "voice" ? <Mic className="h-3 w-3" /> : <Keyboard className="h-3 w-3" />}
                      {n.method}
                    </span>
                    {n.rating && (
                      <span className="flex items-center gap-0.5 text-amber-600 text-sm font-semibold" aria-label={`Rating ${n.rating} out of 5`}>
                        <Star className="h-3.5 w-3.5 fill-current" /> {n.rating}
                      </span>
                    )}
                    {n.visibleToStaff && <Chip value="published" label="visible to staff" />}
                  </div>
                </div>

                {Object.keys(structured).length > 0 && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
                    {(["safe", "effective", "caring", "responsive", "well_led"] as const).map((k) => (
                      structured[k] ? (
                        <div key={k} className="rounded-lg bg-[--brand-50] border p-2.5" style={{ borderColor: "var(--line)" }}>
                          <p className="uc-label text-[--brand-700]">{k.replace(/_/g, "-")}</p>
                          <p className="mt-1 text-xs leading-relaxed">{structured[k]}</p>
                        </div>
                      ) : null
                    ))}
                  </div>
                )}

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-[--brand-600] hover:underline uc-focus rounded">Raw note</summary>
                  <p className="mt-1.5 text-sm text-muted-foreground whitespace-pre-wrap">{n.transcript}</p>
                </details>

                {(n.strengths || n.improvements) && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    {n.strengths && <div className="rounded-lg border border-green-200 bg-green-50 p-2.5"><p className="uc-label text-green-800">Strengths</p><p className="text-xs mt-1">{n.strengths}</p></div>}
                    {n.improvements && <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5"><p className="uc-label text-amber-800">Development</p><p className="text-xs mt-1">{n.improvements}</p></div>}
                  </div>
                )}
                {actions.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {actions.map((a, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[--brand-500]" aria-hidden />
                        {a.action}{a.dueDate ? ` — by ${a.dueDate}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}

      <RecordNoteDialog open={open} onClose={() => setOpen(false)} staff={(staffQ.data ?? []).map((s) => ({ id: Number(s.id), name: s.fullName }))} />
    </div>
  );
}

function RecordNoteDialog({ open, onClose, staff }: {
  open: boolean; onClose: () => void; staff: { id: number; name: string }[];
}) {
  const utils = trpc.useUtils();
  const [f, setF] = useState({
    staffId: "", noteType: "supervision" as string, method: "typed" as string,
    transcript: "", visibleToStaff: false, useAi: true,
  });
  const record = trpc.cqc.recordNote.useMutation({
    onSuccess: () => { utils.cqc.supervisorNotes.invalidate(); toast.success("Note recorded"); onClose(); setF((s) => ({ ...s, transcript: "" })); },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Record a supervision note</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Staff member</Label>
            <Select value={f.staffId} onValueChange={(v) => setF((s) => ({ ...s, staffId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent className="max-h-56">
                {staff.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Note type</Label>
            <Select value={f.noteType} onValueChange={(v) => setF((s) => ({ ...s, noteType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {NOTE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3">
          <Label htmlFor="note-t">Note (dictate or type)</Label>
          <Textarea id="note-t" rows={5} value={f.transcript} onChange={(e) => setF((s) => ({ ...s, transcript: e.target.value }))}
            placeholder="e.g. Observed Margaret supporting Mr Khan with his morning medication. She checked the MAR chart carefully, explained each step…" />
        </div>
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.useAi} onCheckedChange={(v) => setF((s) => ({ ...s, useAi: v === true }))} />
            Structure with AI into CQC key questions <AiBadge />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.visibleToStaff} onCheckedChange={(v) => setF((s) => ({ ...s, visibleToStaff: v === true }))} />
            Visible to the staff member
          </label>
        </div>
        {record.error && <div className="mt-2"><AiError error={record.error} /></div>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!f.staffId || f.transcript.length < 5 || record.isPending}
            onClick={() => record.mutate({
              staffId: Number(f.staffId), noteType: f.noteType as never, method: f.method as never,
              transcript: f.transcript, visibleToStaff: f.visibleToStaff, useAi: f.useAi,
            })}>
            {record.isPending ? "Recording…" : "Record note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
