import { useMemo, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, RagDot, StatCard, fmtDate } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, Clock, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function ExpiryDashboard() {
  const [staffId, setStaffId] = useState<string>("all");
  const [documentType, setDocumentType] = useState<string>("all");
  const [rag, setRag] = useState<string>("all");
  const [maxDays, setMaxDays] = useState<string>("all");

  const filters = useMemo(() => ({
    staffId: staffId === "all" ? undefined : Number(staffId),
    documentType: documentType === "all" ? undefined : documentType,
    rag: rag === "all" ? undefined : rag as "green" | "amber" | "red",
    maxDaysToExpiry: maxDays === "all" ? undefined : Number(maxDays),
  }), [staffId, documentType, rag, maxDays]);

  const q = trpc.hr2.expiryDashboard.useQuery(filters);
  const staffQ = trpc.core.staffList.useQuery();
  const utils = trpc.useUtils();
  const run = trpc.hr2.runExpiryReminders.useMutation({
    onSuccess: (r) => {
      toast.success(
        `Reminders sent — docs ${r.complianceReminders}, training ${r.trainingReminders}, plans ${r.planReminders}`,
      );
      utils.hr2.expiryDashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <Loading rows={8} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const d = q.data!;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Document expiry tracker"
        subtitle="Traffic-light board for staff documents, training and care/support plan reviews"
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={run.isPending}
            onClick={() => run.mutate()}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${run.isPending ? "animate-spin" : ""}`} />
            Run reminders now
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Valid" value={d.counts.green} icon={CheckCircle2} tone="good" />
        <StatCard label="Expiring soon" value={d.counts.amber} icon={Clock} tone="warn" />
        <StatCard label="Expired / missing" value={d.counts.red} icon={ShieldAlert} tone="bad" />
        <StatCard label="Showing" value={d.counts.total} icon={Clock} tone="default" />
      </div>

      <div className="uc-card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <Label>Staff member</Label>
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger><SelectValue placeholder="All staff" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff</SelectItem>
              {(staffQ.data ?? []).map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Document type</Label>
          <Select value={documentType} onValueChange={setDocumentType}>
            <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {d.documentTypes.map((t) => (
                <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={rag} onValueChange={setRag}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="green">Valid</SelectItem>
              <SelectItem value="amber">Expiring soon</SelectItem>
              <SelectItem value="red">Expired / missing</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Days to expiry</Label>
          <Select value={maxDays} onValueChange={setMaxDays}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any</SelectItem>
              <SelectItem value="60">Within 60 days</SelectItem>
              <SelectItem value="30">Within 30 days</SelectItem>
              <SelectItem value="7">Within 7 days</SelectItem>
              <SelectItem value="0">Expired only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="uc-card overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Document</th>
              <th className="px-3 py-2.5 font-medium">Person / client</th>
              <th className="px-3 py-2.5 font-medium">Expiry / due</th>
              <th className="px-3 py-2.5 font-medium">Days</th>
              <th className="px-3 py-2.5 font-medium">Record</th>
            </tr>
          </thead>
          <tbody>
            {d.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No documents match these filters.
                </td>
              </tr>
            )}
            {d.items.map((row) => (
              <tr key={row.id} className="border-b last:border-0 hover:bg-[--brand-50]/60" style={{ borderColor: "var(--line)" }}>
                <td className="px-3 py-2"><RagDot rag={row.rag} /></td>
                <td className="px-3 py-2">
                  <div className="font-medium">{row.label}</div>
                  <div className="text-[11px] text-muted-foreground capitalize">{row.status.replaceAll("_", " ")}</div>
                </td>
                <td className="px-3 py-2">
                  {row.staffId != null ? (
                    <Link to={`/staff/${row.staffId}`} className="text-[--brand-700] hover:underline">
                      {row.staffName}
                    </Link>
                  ) : row.clientId != null ? (
                    <Link to={`/clients/${row.clientId}`} className="text-[--brand-700] hover:underline">
                      {row.clientName}
                    </Link>
                  ) : "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(row.expiresAt)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {row.daysToExpiry <= -999 ? "—"
                    : row.daysToExpiry < 0 ? `${Math.abs(row.daysToExpiry)}d overdue`
                      : `${row.daysToExpiry}d`}
                </td>
                <td className="px-3 py-2">
                  {row.subjectType === "plan_review" ? (
                    <Link to="/clients/reviews" className="text-xs text-[--brand-700] hover:underline">Reviews</Link>
                  ) : row.staffId != null ? (
                    <Link to={`/staff/${row.staffId}`} className="text-xs text-[--brand-700] hover:underline">Renew</Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><RagDot rag="green" /> Valid (&gt;30 days)</span>
        <span className="flex items-center gap-1.5"><RagDot rag="amber" /> Expiring within 30 days</span>
        <span className="flex items-center gap-1.5"><RagDot rag="red" /> Expired or missing</span>
        <Link to="/staff/compliance" className="text-[--brand-700] hover:underline ml-auto">Open compliance matrix</Link>
      </div>
    </div>
  );
}
