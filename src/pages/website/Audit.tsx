import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, EmptyState, fmtDateTime } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pager, rowStyle, thClass } from "./shared";

const ENTITY_TYPES = ["enquiry", "review", "application", "subscriber", "newsletter", "post", "backlink", "seo"];
const LIMIT = 50;

/** details is JSON text written by the portal; show it as "key: value" pairs when possible. */
function summarise(details: string | null): string {
  if (!details) return "—";
  try {
    const obj = JSON.parse(details) as Record<string, unknown>;
    return Object.entries(obj).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ");
  } catch {
    return details;
  }
}

export default function WebsiteAudit() {
  const [entityType, setEntityType] = useState("all");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const query = trpc.website.audit.list.useQuery(
    { entityType: entityType === "all" ? undefined : entityType, q: q.trim() || undefined, limit: LIMIT, offset },
    { placeholderData: keepPreviousData },
  );
  const items = query.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Website audit log"
        subtitle="Changes made to website content and submissions from the staff portal."
        actions={
          <>
            <Input
              value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }}
              placeholder="Search…" aria-label="Search audit log" className="h-9 w-48 text-sm"
            />
            <Select value={entityType} onValueChange={(v) => { setEntityType(v); setOffset(0); }}>
              <SelectTrigger className="w-44" aria-label="Record type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All record types</SelectItem>
                {ENTITY_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        }
      />

      {query.isLoading ? <Loading rows={10} />
        : query.error ? <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
        : items.length === 0 ? <EmptyState title="No audit entries" hint="Nothing matches this filter yet." />
        : (
          <>
            <div className="uc-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground" style={rowStyle}>
                    <th className={thClass}>When</th>
                    <th className={thClass}>Action</th>
                    <th className={thClass}>Record</th>
                    <th className={thClass}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id} className="border-b last:border-0" style={rowStyle}>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDateTime(a.createdAt)}</td>
                      <td className="px-4 py-2 text-xs font-medium">{a.label}</td>
                      <td className="px-4 py-2 text-xs capitalize text-muted-foreground">{a.entityType}{a.entityId ? ` #${a.entityId.slice(0, 8)}` : ""}</td>
                      <td className="max-w-96 truncate px-4 py-2 text-xs text-muted-foreground" title={a.details ?? ""}>{summarise(a.details)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager offset={offset} limit={LIMIT} total={query.data?.total ?? 0} onChange={setOffset} />
          </>
        )}
    </div>
  );
}
