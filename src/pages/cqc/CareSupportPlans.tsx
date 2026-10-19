import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtDate } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { roleAllowed, CQC_PLAN_WRITE_ROLES } from "@/lib/roles";

type PlanKind = "care" | "support";

/**
 * CQC workspace — create and manage care + support plans.
 */
export default function CareSupportPlans() {
  const navigate = useNavigate();
  const meQ = trpc.core.me.useQuery();
  const canWrite = roleAllowed(meQ.data?.role, CQC_PLAN_WRITE_ROLES);
  const q = trpc.cqc.plans.useQuery({});
  const clientsQ = trpc.rota.clients.useQuery();
  const [tab, setTab] = useState<PlanKind>("care");
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [createKind, setCreateKind] = useState<PlanKind>("care");
  const [clientFilter, setClientFilter] = useState("");

  const versionQ = trpc.cqc.nextPlanVersion.useQuery(
    { clientId: Number(clientId), planType: createKind },
    { enabled: !!clientId && Number(clientId) > 0 },
  );

  const create = trpc.cqc.createPlan.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.planType === "care" ? "Care" : "Support"} plan v${r.version} created for ${r.clientName}`);
      setOpen(false);
      navigate(`/cqc/plans/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const plans = q.data ?? [];
  const care = useMemo(() => plans.filter((p) => p.planType === "care"), [plans]);
  const support = useMemo(() => plans.filter((p) => p.planType === "support"), [plans]);

  const activeClients = useMemo(() => {
    const rows = (clientsQ.data ?? []).filter((c) => c.status === "active");
    const q = clientFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) =>
      `${c.firstName} ${c.lastName} ${c.clientRef}`.toLowerCase().includes(q),
    );
  }, [clientsQ.data, clientFilter]);

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  function openCreate(kind: PlanKind) {
    setCreateKind(kind);
    setClientId("");
    setClientFilter("");
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Care & support plans"
        subtitle="Care plans = full assessment. Support plans = person-centred. Create in a few clicks — versions number automatically."
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => openCreate("support")}>
                <Plus className="h-4 w-4 mr-1.5" /> New support plan
              </Button>
              <Button onClick={() => openCreate("care")}>
                <Plus className="h-4 w-4 mr-1.5" /> New care plan
              </Button>
            </div>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as PlanKind)}>
        <TabsList>
          <TabsTrigger value="care">Care plans ({care.length})</TabsTrigger>
          <TabsTrigger value="support">Support plans ({support.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="care" className="mt-4">
          <PlanTable
            plans={care}
            emptyTitle="No care plans yet"
            emptyHint="Create a care plan for a client — it opens the full assessment form ready to complete."
            onCreate={() => openCreate("care")}
          />
        </TabsContent>
        <TabsContent value="support" className="mt-4">
          <PlanTable
            plans={support}
            emptyTitle="No support plans yet"
            emptyHint="Create a person-centred support plan — about me, outcomes, how I want to be supported, and more."
            onCreate={() => openCreate("support")}
          />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        Due reviews are managed under{" "}
        <Link to="/cqc/plan-reviews" className="text-[--brand-700] hover:underline">Plan reviews</Link>.
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New {createKind === "care" ? "care" : "support"} plan</DialogTitle>
            <DialogDescription>
              {createKind === "care"
                ? "Opens the full assessment care plan for the selected client."
                : "Opens the person-centred support plan for the selected client."}
              {" "}Version number is assigned automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Plan type</Label>
              <Select value={createKind} onValueChange={(v) => setCreateKind(v as PlanKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="care">Care plan (full assessment)</SelectItem>
                  <SelectItem value="support">Support plan (person-centred)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Find client</Label>
              <Input
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                placeholder="Search name or client ref…"
                className="mb-2"
              />
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {activeClients.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.firstName} {c.lastName} ({c.clientRef})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeClients.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">No active clients match that search.</p>
              )}
            </div>

            {clientId && (
              <p className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
                {versionQ.isLoading
                  ? "Checking version…"
                  : versionQ.data
                    ? <>This will create <strong>version {versionQ.data.nextVersion}</strong>
                      {versionQ.data.existingCount > 0
                        ? ` (${versionQ.data.existingCount} earlier version${versionQ.data.existingCount === 1 ? "" : "s"} on file).`
                        : " (first plan of this type for this client)."}
                    </>
                    : null}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!clientId || create.isPending}
              onClick={() => create.mutate({ clientId: Number(clientId), planType: createKind })}
            >
              {create.isPending ? "Creating…" : `Create ${createKind === "care" ? "care" : "support"} plan`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlanTable({
  plans, emptyTitle, emptyHint, onCreate,
}: {
  plans: {
    id: number | bigint;
    version: number;
    status: string;
    approvedBy: string | null;
    nextReviewDue: string | null;
    client?: { firstName: string; lastName: string; clientRef: string } | null;
  }[];
  emptyTitle: string;
  emptyHint: string;
  onCreate: () => void;
}) {
  if (plans.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={emptyTitle}
        hint={emptyHint}
        action={<Button onClick={onCreate}><Plus className="h-4 w-4 mr-1.5" /> Create one</Button>}
      />
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="uc-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
            <th className="px-4 py-2.5 font-medium">Client</th>
            <th className="px-4 py-2.5 font-medium">Version</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Approved by</th>
            <th className="px-4 py-2.5 font-medium">Next review</th>
            <th className="px-4 py-2.5 font-medium" />
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => {
            const overdue = !!(p.nextReviewDue && p.nextReviewDue < today && p.status === "approved");
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
                    <span className={overdue ? "text-red-700 font-semibold" : ""}>
                      {fmtDate(p.nextReviewDue)}{overdue ? " — overdue" : ""}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link to={`/cqc/plans/${p.id}`}>
                    <Button size="sm" variant="outline" className="h-7">Open</Button>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
