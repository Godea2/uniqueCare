import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtDate, AvatarDot, AiBadge, AiError } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Star, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

type AiDraft = { summary: string; strengths: string; development: string; objectives: string[]; evidenceNoteIds: number[] };

export default function Appraisals() {
  const utils = trpc.useUtils();
  const q = trpc.cqc.appraisals.useQuery();
  const staffQ = trpc.core.staffList.useQuery();
  const meQ = trpc.core.me.useQuery();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<number | null>(null);

  if (q.isLoading) return <Loading rows={5} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  const mine = meQ.data ? (q.data ?? []).filter((a) => Number(a.staffId) === Number(meQ.data.id) && a.status === "completed") : [];
  const isManager = meQ.data && ["super_admin", "admin", "team_leader"].includes(meQ.data.role);

  return (
    <div>
      <PageHeader
        title="Appraisals"
        subtitle="Annual appraisals — AI drafts from evidence, the appraiser finalises, the staff member acknowledges"
        actions={isManager ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New appraisal</Button> : undefined}
      />

      {mine.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">You have {mine.length} appraisal{mine.length === 1 ? "" : "s"} awaiting acknowledgement.</p>
        </div>
      )}

      {(q.data ?? []).length === 0 ? (
        <EmptyState icon={Star} title="No appraisals yet" hint="Create an appraisal to draft it from supervision notes, training and rota reliability." />
      ) : (
        <div className="uc-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
                <th className="px-4 py-2.5 font-medium">Staff member</th>
                <th className="px-4 py-2.5 font-medium">Period</th>
                <th className="px-4 py-2.5 font-medium">Appraiser</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Next due</th>
                <th className="px-4 py-2.5 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((a) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-[--brand-50]/60" style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <AvatarDot name={a.staff?.fullName ?? "?"} color={a.staff?.avatarColor} />
                      <span className="font-medium">{a.staff?.fullName}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{fmtDate(a.periodStart)} – {fmtDate(a.periodEnd)}</td>
                  <td className="px-4 py-2.5 text-xs">{a.appraiserName}</td>
                  <td className="px-4 py-2.5">
                    <Chip value={a.status === "draft" ? "draft" : a.status === "scheduled" ? "in_progress" : a.status === "completed" ? "resolved" : "verified"} />
                  </td>
                  <td className="px-4 py-2.5 text-xs">{a.nextAppraisalDue ? fmtDate(a.nextAppraisalDue) : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setDetail(Number(a.id))}>Open</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewAppraisalDialog open={open} onClose={() => setOpen(false)}
        staff={(staffQ.data ?? []).map((s) => ({ id: Number(s.id), name: s.fullName }))}
        onCreated={(id) => { utils.cqc.appraisals.invalidate(); setOpen(false); setDetail(id); }} />
      {detail !== null && (
        <AppraisalDialog id={detail} onClose={() => setDetail(null)} isManager={!!isManager} myStaffId={meQ.data ? Number(meQ.data.id) : 0} />
      )}
    </div>
  );
}

function NewAppraisalDialog({ open, onClose, staff, onCreated }: {
  open: boolean; onClose: () => void; staff: { id: number; name: string }[]; onCreated: (id: number) => void;
}) {
  const [staffId, setStaffId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const create = trpc.cqc.createAppraisal.useMutation({
    onSuccess: (r) => onCreated(r.id),
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New appraisal</DialogTitle></DialogHeader>
        <Label>Staff member</Label>
        <Select value={staffId} onValueChange={setStaffId}>
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent className="max-h-56">{staff.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div><Label htmlFor="ap-s">Period start</Label><Input id="ap-s" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label htmlFor="ap-e">Period end</Label><Input id="ap-e" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!staffId || !start || !end || create.isPending}
            onClick={() => create.mutate({ staffId: Number(staffId), periodStart: start, periodEnd: end })}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AppraisalDialog({ id, onClose, isManager, myStaffId }: {
  id: number; onClose: () => void; isManager: boolean; myStaffId: number;
}) {
  const utils = trpc.useUtils();
  const q = trpc.cqc.appraisals.useQuery();
  const draft = trpc.cqc.draftAppraisal.useMutation({
    onSuccess: () => { utils.cqc.appraisals.invalidate(); toast.success("AI draft generated"); },
  });
  const finalise = trpc.cqc.finaliseAppraisal.useMutation({
    onSuccess: () => { utils.cqc.appraisals.invalidate(); toast.success("Appraisal finalised"); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const acknowledge = trpc.cqc.acknowledgeAppraisal.useMutation({
    onSuccess: () => { utils.cqc.appraisals.invalidate(); toast.success("Acknowledged"); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const [edited, setEdited] = useState<AiDraft | null>(null);

  const a = (q.data ?? []).find((x) => Number(x.id) === id);
  if (!a) return null;
  const aiDraft = (a.aiDraft as AiDraft | null) ?? null;
  const final = (a.final as AiDraft | null) ?? null;
  const shown = edited ?? final ?? aiDraft;
  const isMine = Number(a.staffId) === myStaffId;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Appraisal — {a.staff?.fullName}
            {a.status === "scheduled" && <AiBadge />}
          </DialogTitle>
        </DialogHeader>

        {a.status === "draft" && isManager && (
          <div className="rounded-lg bg-[--brand-50] border p-4 text-sm" style={{ borderColor: "var(--line)" }}>
            <p className="mb-2">Generate an AI draft from supervision notes, completed training and rota reliability. Evidence is linked so you can check every claim.</p>
            {draft.error && <div className="mb-2"><AiError error={draft.error} onRetry={() => draft.mutate({ appraisalId: id })} /></div>}
            <Button disabled={draft.isPending} onClick={() => draft.mutate({ appraisalId: id })}>
              <Sparkles className="h-4 w-4 mr-1.5" /> {draft.isPending ? "Drafting…" : "Draft with AI"}
            </Button>
          </div>
        )}

        {shown && (
          <div className="space-y-3 mt-2">
            {(["summary", "strengths", "development"] as const).map((k) => (
              <div key={k}>
                <Label className="capitalize">{k}</Label>
                {isManager && a.status !== "signed" ? (
                  <Textarea rows={3} value={shown[k]}
                    onChange={(e) => setEdited({ ...(edited ?? shown), [k]: e.target.value })} />
                ) : (
                  <p className="text-sm mt-1 whitespace-pre-wrap">{shown[k]}</p>
                )}
              </div>
            ))}
            <div>
              <Label>Objectives for next period</Label>
              {isManager && a.status !== "signed" ? (
                <Textarea rows={3} value={(shown.objectives ?? []).join("\n")}
                  onChange={(e) => setEdited({ ...(edited ?? shown), objectives: e.target.value.split("\n").filter(Boolean) })} />
              ) : (
                <ul className="list-disc pl-5 text-sm mt-1 space-y-1">{(shown.objectives ?? []).map((o, i) => <li key={i}>{o}</li>)}</ul>
              )}
            </div>
            {aiDraft?.evidenceNoteIds && aiDraft.evidenceNoteIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Evidence: supervision notes {aiDraft.evidenceNoteIds.map((n) => `#${n}`).join(", ")}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {isManager && a.status === "scheduled" && shown && (
            <Button disabled={finalise.isPending}
              onClick={() => finalise.mutate({ appraisalId: id, final: (edited ?? shown) as never })}>
              Finalise & send for acknowledgement
            </Button>
          )}
          {isMine && a.status === "completed" && (
            <Button disabled={acknowledge.isPending} onClick={() => acknowledge.mutate({ appraisalId: id })}>
              I acknowledge this appraisal
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
