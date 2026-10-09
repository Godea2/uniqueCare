import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtDate } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, Plus } from "lucide-react";
import { toast } from "sonner";

export default function Plans({ kind }: { kind: "care" | "support" }) {
  const navigate = useNavigate();
  const q = trpc.cqc.plans.useQuery({ planType: kind });
  const clientsQ = trpc.rota.clients.useQuery();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const create = trpc.cqc.createPlan.useMutation({
    onSuccess: (r) => { toast.success("Plan created"); navigate(`/clients/plans/${r.id}`); },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const plans = q.data ?? [];
  const title = kind === "care" ? "Care plans" : "Support plans";

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={kind === "care"
          ? "Person-centred care plans — AI drafts, human approves, annual review cycle"
          : "Support plans — day-to-day routines, preferences and communication"}
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New plan</Button>}
      />
      {plans.length === 0 ? (
        <EmptyState icon={FileText} title={`No ${title.toLowerCase()} yet`} hint="Create a plan, then generate a first draft with AI from the assessor's notes." />
      ) : (
        <div className="uc-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Version</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Approved by</th>
                <th className="px-4 py-2.5 font-medium">Next review</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => {
                const overdue = p.nextReviewDue && p.nextReviewDue < new Date().toISOString().slice(0, 10) && p.status === "approved";
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-[--brand-50]/60" style={{ borderColor: "var(--line)" }}>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-[--brand-900]">{p.client?.firstName} {p.client?.lastName}</span>
                      <span className="block text-xs text-muted-foreground">{p.client?.clientRef}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs">v{p.version}</td>
                    <td className="px-4 py-2.5"><Chip value={p.status} /></td>
                    <td className="px-4 py-2.5 text-xs">{p.approvedBy ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {p.nextReviewDue ? (
                        <span className={overdue ? "text-red-700 font-semibold" : ""}>{fmtDate(p.nextReviewDue)}{overdue ? " — overdue" : ""}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link to={`/clients/plans/${p.id}`}>
                        <Button size="sm" variant="outline" className="h-7">Open</Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New {kind === "care" ? "care" : "support"} plan</DialogTitle></DialogHeader>
          <Label>Client</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
            <SelectContent className="max-h-64">
              {(clientsQ.data ?? []).filter((c) => c.status === "active").map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.firstName} {c.lastName} ({c.clientRef})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!clientId || create.isPending}
              onClick={() => create.mutate({ clientId: Number(clientId), planType: kind })}>
              Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
