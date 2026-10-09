import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { ClipboardList, Check } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router";

export default function Tasks() {
  const utils = trpc.useUtils();
  const q = trpc.crm.myTasks.useQuery();
  const complete = trpc.crm.completeTask.useMutation({
    onSuccess: () => { utils.crm.myTasks.invalidate(); toast.success("Task done"); },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  const groups = q.data ?? { overdue: [], today: [], upcoming: [], done: [] };
  const { overdue, today, upcoming, done } = groups;
  const total = overdue.length + today.length + upcoming.length + done.length;

  return (
    <div className="max-w-3xl">
      <PageHeader title="My tasks" subtitle="Return calls, follow-ups and review tasks assigned to you" />
      {total === 0 ? (
        <EmptyState icon={ClipboardList} title="No tasks" hint="Tasks are created from missed calls, follow-ups, and plan review triggers." />
      ) : (
        <div className="space-y-5">
          {[
            { label: `Overdue (${overdue.length})`, rows: overdue, danger: true },
            { label: `Due today (${today.length})`, rows: today, danger: false },
            { label: `Upcoming (${upcoming.length})`, rows: upcoming, danger: false },
          ].map((g) => g.rows.length > 0 && (
            <section key={g.label}>
              <h2 className={`uc-label mb-2 ${g.danger ? "text-red-800" : ""}`}>{g.label}</h2>
              <div className="space-y-2">
                {g.rows.map((t) => (
                  <div key={t.id} className={`uc-card p-4 flex items-center justify-between gap-3 ${g.danger ? "border-red-300" : ""}`}>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-[--brand-900]">{t.title}</p>
                      {t.description && <p className="text-xs text-muted-foreground line-clamp-1">{t.description}</p>}
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {t.dueAt ? `Due ${fmtDateTime(t.dueAt)}` : "No due date"}
                        {t.createdByName ? ` · from ${t.createdByName}` : ""}
                        {t.relatedType === "ticket" && t.relatedId ? (
                          <> · <Link to={`/crm/tickets/${t.relatedId}`} className="text-[--brand-600] hover:underline">ticket</Link></>
                        ) : t.relatedType === "contact" && t.relatedId ? (
                          <> · <Link to={`/crm/contacts/${t.relatedId}`} className="text-[--brand-600] hover:underline">contact</Link></>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {t.priority === "high" || t.priority === "urgent" ? <Chip value={t.priority} /> : null}
                      <Button size="sm" variant="outline" className="h-7" disabled={complete.isPending}
                        onClick={() => complete.mutate({ id: Number(t.id) })}>
                        <Check className="h-3.5 w-3.5 mr-1" /> Done
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {done.length > 0 && (
            <section>
              <h2 className="uc-label mb-2">Completed recently</h2>
              <div className="space-y-1">
                {done.slice(0, 8).map((t) => (
                  <p key={t.id} className="text-sm text-muted-foreground line-through">{t.title}</p>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
