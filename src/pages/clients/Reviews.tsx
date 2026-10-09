import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtDate } from "@/components/common";
import { Button } from "@/components/ui/button";
import { CalendarCheck2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router";

export default function Reviews() {
  const utils = trpc.useUtils();
  const q = trpc.cqc.reviews.useQuery();
  const complete = trpc.cqc.completeReview.useMutation({
    onSuccess: () => { utils.cqc.reviews.invalidate(); toast.success("Review completed"); },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  const rows = q.data ?? [];
  const open = rows.filter((r) => r.status !== "completed");
  const done = rows.filter((r) => r.status === "completed");

  return (
    <div>
      <PageHeader title="Plan reviews" subtitle="Annual reviews plus reviews triggered by change events" />
      {rows.length === 0 ? (
        <EmptyState icon={CalendarCheck2} title="No reviews scheduled" hint="Reviews appear when plans are approved or change events are logged." />
      ) : (
        <>
          <ReviewTable rows={open} onComplete={(id) => complete.mutate({ id })} pending={complete.isPending} />
          {done.length > 0 && (
            <>
              <h2 className="uc-label mt-6 mb-2">Completed</h2>
              <ReviewTable rows={done.slice(0, 10)} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function ReviewTable({ rows, onComplete, pending }: {
  rows: {
    id: number | bigint; dueDate: string; trigger: string; status: string; planType: string; planId: number | bigint;
    client?: { id: number | bigint; firstName: string; lastName: string; clientRef: string };
  }[];
  onComplete?: (id: number) => void; pending?: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="uc-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
            <th className="px-4 py-2.5 font-medium">Client</th>
            <th className="px-4 py-2.5 font-medium">Plan</th>
            <th className="px-4 py-2.5 font-medium">Trigger</th>
            <th className="px-4 py-2.5 font-medium">Due</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            {onComplete && <th className="px-4 py-2.5 font-medium text-right"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
              <td className="px-4 py-2.5">
                <span className="font-medium">{r.client?.firstName} {r.client?.lastName}</span>
                <span className="block text-xs text-muted-foreground">{r.client?.clientRef}</span>
              </td>
              <td className="px-4 py-2.5">
                <Link to={`/clients/plans/${r.planId}`} className="text-[--brand-600] hover:underline text-xs">
                  {r.planType} plan
                </Link>
              </td>
              <td className="px-4 py-2.5 text-xs">{r.trigger.replace(/_/g, " ")}</td>
              <td className="px-4 py-2.5 text-xs">
                <span className={r.dueDate < today && r.status !== "completed" ? "text-red-700 font-semibold" : ""}>
                  {fmtDate(r.dueDate)}
                </span>
              </td>
              <td className="px-4 py-2.5"><Chip value={r.status === "completed" ? "completed" : r.dueDate < today ? "overdue" : "due"} /></td>
              {onComplete && (
                <td className="px-4 py-2.5 text-right">
                  {r.status !== "completed" && (
                    <Button size="sm" variant="outline" className="h-7" disabled={pending} onClick={() => onComplete(Number(r.id))}>
                      Mark complete
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
