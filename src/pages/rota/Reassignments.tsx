import { useState } from "react";
import { trpc } from "@/providers/trpc";
import type { RouterOutputs } from "@/lib/router-types";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtDateTime, fmtTime, fmtDate } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";

type Req = NonNullable<RouterOutputs["rota"]["reassignments"]>[number];

export default function Reassignments() {
  const utils = trpc.useUtils();
  const q = trpc.rota.reassignments.useQuery();
  const [manual, setManual] = useState<Req | null>(null);

  if (q.isLoading) return <Loading rows={5} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const rows = q.data ?? [];
  const open = rows.filter((r) => r.status === "manual_required");
  const rest = rows.filter((r) => r.status !== "manual_required");

  return (
    <div>
      <PageHeader title="Reassignments" subtitle="Cover requests created when a care worker becomes unavailable" />
      {rows.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No reassignment requests" hint="When someone calls in sick, affected visits appear here — resolved automatically where possible." />
      ) : (
        <>
          {open.length > 0 && (
            <>
              <h2 className="uc-label mb-2 text-red-800">Needs your decision ({open.length})</h2>
              <div className="space-y-2 mb-6">
                {open.map((r) => <ReqCard key={r.id} req={r} onPick={() => setManual(r)} />)}
              </div>
            </>
          )}
          <h2 className="uc-label mb-2">Resolved automatically</h2>
          <div className="space-y-2">
            {rest.map((r) => <ReqCard key={r.id} req={r} />)}
            {rest.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
          </div>
        </>
      )}
      {manual && (
        <ManualDialog req={manual} onClose={() => setManual(null)}
          onDone={() => { utils.rota.reassignments.invalidate(); utils.rota.weekData.invalidate(); setManual(null); }} />
      )}
    </div>
  );
}

function ReqCard({ req, onPick }: { req: Req; onPick?: () => void }) {
  const nearMisses = ((req.resolutionLog as { nearMisses?: { staffId: number; reasons: string[] }[] } | null)?.nearMisses) ?? [];
  return (
    <div className="uc-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-[--brand-900]">
            {req.client ? `${req.client.firstName} ${req.client.lastName}` : `Visit #${req.visitId}`}
            {req.visit && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {fmtDate(req.visit.scheduledStart)} {fmtTime(req.visit.scheduledStart)}–{fmtTime(req.visit.scheduledEnd)}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {req.reason} · requested by {req.requestedBy} · {fmtDateTime(req.createdAt)}
          </p>
          {req.resolvedStaff && (
            <p className="text-xs mt-1 text-green-700 font-medium">Covered by {req.resolvedStaff}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Chip value={req.status} />
          {req.status === "manual_required" && onPick && (
            <Button size="sm" onClick={onPick}>Assign cover</Button>
          )}
        </div>
      </div>
      {req.status === "manual_required" && nearMisses.length > 0 && (
        <div className="mt-3 rounded-lg bg-[--brand-50] border p-3" style={{ borderColor: "var(--line)" }}>
          <p className="uc-label mb-1">Why the closest workers were ruled out</p>
          <ul className="space-y-1 text-xs">
            {nearMisses.slice(0, 5).map((nm, i) => (
              <li key={i}>
                <span className="font-medium">Worker #{nm.staffId}:</span>{" "}
                <span className="text-muted-foreground">{nm.reasons.join("; ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ManualDialog({ req, onClose, onDone }: { req: Req; onClose: () => void; onDone: () => void }) {
  const staffQ = trpc.core.staffList.useQuery();
  const [staffId, setStaffId] = useState<number | null>(null);
  const check = trpc.rota.checkAssignment.useQuery(
    { visitId: Number(req.visitId), staffId: staffId! },
    { enabled: staffId !== null },
  );
  const reassign = trpc.rota.reassignVisit.useMutation({
    onSuccess: () => { toast.success("Cover assigned"); onDone(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Assign cover manually</DialogTitle></DialogHeader>
        <div className="max-h-64 overflow-y-auto space-y-1" role="radiogroup" aria-label="Choose cover worker">
          {(staffQ.data ?? []).filter((s) => s.status === "active" && ["care_worker", "team_leader", "supervisor"].includes(s.role)).map((s) => (
            <button key={s.id} type="button" onClick={() => setStaffId(Number(s.id))}
              aria-pressed={staffId === Number(s.id)}
              className={`uc-focus w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${staffId === Number(s.id) ? "border-[--brand-600] bg-[--brand-50]" : "bg-white hover:bg-[--brand-50]/60"}`}
              style={{ borderColor: staffId === Number(s.id) ? undefined : "var(--line)" }}>
              <span className="font-medium">{s.fullName}</span>
            </button>
          ))}
        </div>
        {staffId !== null && check.data && !check.data.ok && (
          <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-2.5 text-xs text-red-800">✕ {check.data.reason}</p>
        )}
        {check.data?.ok && (
          <p className="mt-2 rounded-lg border border-green-300 bg-green-50 p-2.5 text-xs text-green-800">✓ Within all hard constraints.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!check.data?.ok || reassign.isPending}
            onClick={() => reassign.mutate({ visitId: Number(req.visitId), staffId: staffId!, reason: "Manual cover assignment" })}>
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
