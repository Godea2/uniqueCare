import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, RagDot, AvatarDot, fmtDate } from "@/components/common";

export default function ComplianceMatrix() {
  const q = trpc.hr2.complianceMatrix.useQuery();

  if (q.isLoading) return <Loading rows={8} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const d = q.data!;

  return (
    <div>
      <PageHeader
        title="Compliance matrix"
        subtitle="RAG status per staff member — red = missing/expired, amber = expires within 30 days"
      />
      <div className="uc-card overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
              <th className="px-3 py-2.5 font-medium sticky left-0 bg-white min-w-44">Staff member</th>
              {d.requirements.map((r) => (
                <th key={r.key} className="px-3 py-2.5 font-medium whitespace-nowrap">{r.label}</th>
              ))}
              {d.courses.map((c) => (
                <th key={c.id} className="px-3 py-2.5 font-medium whitespace-nowrap">{c.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.rows.map((row) => (
              <tr key={row.staff.id} className="border-b last:border-0 hover:bg-[--brand-50]/60" style={{ borderColor: "var(--line)" }}>
                <td className="px-3 py-2 sticky left-0 bg-white">
                  <span className="flex items-center gap-2">
                    <AvatarDot name={row.staff.fullName} color={row.staff.avatarColor} />
                    <span className="text-[13px] font-medium whitespace-nowrap">{row.staff.fullName}</span>
                  </span>
                </td>
                {row.docs.map((cell) => (
                  <td key={cell.key} className="px-3 py-2">
                    <span className="flex items-center gap-1.5" title={`${cell.status}${cell.expiresAt ? ` — expires ${fmtDate(cell.expiresAt)}` : ""}`}>
                      <RagDot rag={cell.rag as "green" | "amber" | "red"} />
                      {cell.expiresAt && <span className="text-[10px] text-muted-foreground">{fmtDate(cell.expiresAt)}</span>}
                    </span>
                  </td>
                ))}
                {row.training.map((cell) => (
                  <td key={cell.courseId} className="px-3 py-2">
                    <span className="flex items-center gap-1.5" title={cell.status}>
                      <RagDot rag={cell.rag as "green" | "amber" | "red"} />
                      {cell.expiresAt && <span className="text-[10px] text-muted-foreground">{fmtDate(cell.expiresAt)}</span>}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><RagDot rag="green" /> In date</span>
        <span className="flex items-center gap-1.5"><RagDot rag="amber" /> Expiring within 30 days</span>
        <span className="flex items-center gap-1.5"><RagDot rag="red" /> Missing or expired</span>
      </div>
    </div>
  );
}
