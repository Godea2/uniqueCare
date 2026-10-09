import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, fmtDateTime } from "@/components/common";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ENTITY_TYPES = ["applications", "job_postings", "compliance_documents", "rota_weeks", "visits", "care_plans", "tickets", "crm_contacts", "clients", "incidents", "appraisals", "organisations"];

export default function AuditLog() {
  const [entityType, setEntityType] = useState("all");
  const q = trpc.core.auditLog.useQuery({ entityType: entityType === "all" ? undefined : entityType, limit: 200 });

  if (q.isLoading) return <Loading rows={10} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Every significant action — who, what, when. Required for CQC and UK GDPR accountability."
        actions={
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All record types</SelectItem>
              {ENTITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />
      <div className="uc-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-4 py-2.5 font-medium">Actor</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
              <th className="px-4 py-2.5 font-medium">Record</th>
              <th className="px-4 py-2.5 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((a) => (
              <tr key={a.id} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(a.at)}</td>
                <td className="px-4 py-2 text-xs font-medium">{a.actorName}</td>
                <td className="px-4 py-2 text-xs">{a.action.replace(/_/g, " ")}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{a.entityType.replace(/_/g, " ")}{a.entityId ? ` #${a.entityId}` : ""}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground max-w-72 truncate" title={JSON.stringify(a.detail)}>
                  {a.detail ? JSON.stringify(a.detail) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
