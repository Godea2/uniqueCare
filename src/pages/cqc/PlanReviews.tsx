import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtDate, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { CalendarCheck2, AlertTriangle, Clock, CheckCircle2, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { REVIEW_TRIGGERS } from "@contracts/care-plan-review";
import { roleAllowed, CQC_PLAN_WRITE_ROLES } from "@/lib/roles";

type ReviewRow = {
  id: number | bigint;
  dueDate: string;
  trigger: string;
  status: string;
  planType: string;
  planId: number | bigint;
  hasReport?: boolean;
  isLocked?: boolean;
  completedBy?: string | null;
  client?: { id: number | bigint; firstName: string; lastName: string; clientRef: string };
};

function bucket(r: ReviewRow, today: string): "overdue" | "due" | "in_progress" | "completed" {
  if (r.status === "completed") return "completed";
  if (r.status === "in_progress") return "in_progress";
  if (r.status === "overdue" || r.dueDate < today) return "overdue";
  return "due";
}

export default function PlanReviews() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const meQ = trpc.core.me.useQuery();
  const canWrite = roleAllowed(meQ.data?.role, CQC_PLAN_WRITE_ROLES);
  const q = trpc.cqc.reviews.useQuery();
  const plansQ = trpc.cqc.plans.useQuery({});
  const [startOpen, setStartOpen] = useState(false);
  const [planId, setPlanId] = useState("");
  const [trigger, setTrigger] = useState("annual");

  const startExisting = trpc.cqc.startReview.useMutation({
    onSuccess: (r) => {
      utils.cqc.reviews.invalidate();
      toast.success("Review started");
      navigate(`/cqc/plan-reviews/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const startFromPlan = trpc.cqc.startReviewFromPlan.useMutation({
    onSuccess: (r) => {
      utils.cqc.reviews.invalidate();
      setStartOpen(false);
      toast.success(r.created ? "Review started" : "Opened existing review");
      navigate(`/cqc/plan-reviews/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const today = new Date().toISOString().slice(0, 10);
  const groups = useMemo(() => {
    const rows = (q.data ?? []) as ReviewRow[];
    const overdue: ReviewRow[] = [];
    const due: ReviewRow[] = [];
    const inProgress: ReviewRow[] = [];
    const completed: ReviewRow[] = [];
    for (const r of rows) {
      const b = bucket(r, today);
      if (b === "overdue") overdue.push(r);
      else if (b === "due") due.push(r);
      else if (b === "in_progress") inProgress.push(r);
      else completed.push(r);
    }
    return { overdue, due, inProgress, completed };
  }, [q.data, today]);

  const approvedPlans = useMemo(
    () => (plansQ.data ?? []).filter((p) => p.status === "approved" && p.planType === "care"),
    [plansQ.data],
  );

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  const total = (q.data ?? []).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Plan reviews"
        subtitle="Paper review form workflow — due, overdue, in progress and completed, linked to the plan under review"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/cqc/plans">Care & support plans</Link>
            </Button>
            {canWrite && (
              <Button onClick={() => { setPlanId(""); setTrigger("annual"); setStartOpen(true); }}>
                Start review from plan
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Overdue" value={groups.overdue.length} icon={AlertTriangle} tone={groups.overdue.length ? "bad" : "good"} />
        <StatCard label="Due" value={groups.due.length} icon={Clock} tone={groups.due.length ? "warn" : "default"} />
        <StatCard label="In progress" value={groups.inProgress.length} icon={PlayCircle} tone="default" />
        <StatCard label="Completed" value={groups.completed.length} icon={CheckCircle2} tone="good" />
      </div>

      {total === 0 ? (
        <EmptyState
          icon={CalendarCheck2}
          title="No reviews scheduled"
          hint="Start a review from an approved care plan, or wait for annual / change-event scheduling."
          action={canWrite ? <Button onClick={() => setStartOpen(true)}>Start review from plan</Button> : undefined}
        />
      ) : (
        <>
          <Section
            title="Overdue"
            rows={groups.overdue}
            onStart={canWrite ? (id) => startExisting.mutate({ id }) : undefined}
            pending={startExisting.isPending}
          />
          <Section
            title="Due"
            rows={groups.due}
            onStart={canWrite ? (id) => startExisting.mutate({ id }) : undefined}
            pending={startExisting.isPending}
          />
          <Section title="In progress" rows={groups.inProgress} />
          <Section title="Completed" rows={groups.completed.slice(0, 40)} />
        </>
      )}

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start review from approved plan</DialogTitle>
            <DialogDescription>
              Opens the paper review form for the selected care plan. Trigger sets why the review is happening.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Approved care plan</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger><SelectValue placeholder="Select plan…" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {approvedPlans.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.client?.firstName} {p.client?.lastName} ({p.client?.clientRef}) · v{p.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Trigger</Label>
              <Select value={trigger} onValueChange={setTrigger}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REVIEW_TRIGGERS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartOpen(false)}>Cancel</Button>
            <Button
              disabled={!planId || startFromPlan.isPending}
              onClick={() => startFromPlan.mutate({
                planId: Number(planId),
                trigger: trigger as "annual" | "change_in_needs" | "hospital_discharge" | "incident" | "request",
              })}
            >
              {startFromPlan.isPending ? "Starting…" : "Start review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({
  title, rows, onStart, pending,
}: {
  title: string;
  rows: ReviewRow[];
  onStart?: (id: number) => void;
  pending?: boolean;
}) {
  const navigate = useNavigate();
  if (rows.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section>
      <h2 className="uc-label mb-2">{title} ({rows.length})</h2>
      <div className="uc-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
              <th className="px-4 py-2.5 font-medium">Client</th>
              <th className="px-4 py-2.5 font-medium">Plan</th>
              <th className="px-4 py-2.5 font-medium">Trigger</th>
              <th className="px-4 py-2.5 font-medium">Due</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium text-right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const b = bucket(r, today);
              return (
                <tr key={r.id} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{r.client?.firstName} {r.client?.lastName}</span>
                    <span className="block text-xs text-muted-foreground">{r.client?.clientRef}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link to={`/cqc/plans/${r.planId}`} className="text-[--brand-600] hover:underline text-xs capitalize">
                      {r.planType} plan
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{r.trigger.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className={b === "overdue" ? "text-red-700 font-semibold" : ""}>
                      {fmtDate(r.dueDate)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Chip value={b === "overdue" ? "overdue" : r.status} />
                    {r.completedBy && (
                      <span className="block text-[10px] text-muted-foreground mt-0.5">{r.completedBy}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      {onStart && r.status !== "in_progress" && r.status !== "completed" && (
                        <Button size="sm" variant="outline" className="h-7" disabled={pending} onClick={() => onStart(Number(r.id))}>
                          Start
                        </Button>
                      )}
                      <Button size="sm" className="h-7" onClick={() => navigate(`/cqc/plan-reviews/${r.id}`)}>
                        {r.status === "completed" ? "View" : "Open report"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
