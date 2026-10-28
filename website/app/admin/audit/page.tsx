"use client";

import { useState } from "react";
import { fmtDateTime } from "@/lib/admin/client";
import { useAdminList } from "@/components/admin/useAdminList";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, SearchBox, ShowMore, card } from "@/components/admin/ui";

type Entry = {
  id: number;
  action: string;
  label: string;
  entityType: string;
  entityId: string | null;
  details: unknown;
  createdAt: string;
  relative: string;
};

const ENTITIES = ["all", "enquiry", "review", "application", "subscriber", "newsletter", "post", "backlink", "admin_user"];

function summarise(details: unknown): string {
  if (details == null || details === "") return "";
  if (typeof details === "string") return details;
  if (typeof details === "object") {
    return Object.entries(details as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join(" · ");
  }
  return String(details);
}

export default function AuditPage() {
  const [entity, setEntity] = useState("all");
  const [q, setQ] = useState("");
  // The audit endpoint filters by ?entity=, so it is baked into the endpoint URL.
  const list = useAdminList<Entry>(`/api/admin/audit?entity=${entity}`, { q, pageSize: 30 });

  return (
    <div>
      <PageHeader title="Audit log" description="A record of every change made in the admin panel." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <label htmlFor="audit-entity" className="sr-only">Filter by type</label>
          <select id="audit-entity" className="admin-input !w-auto" value={entity} onChange={(e) => setEntity(e.target.value)}>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>{e === "all" ? "All activity" : e.replace("_", " ")}</option>
            ))}
          </select>
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="Search activity" />
      </div>

      {list.error && <div className="mb-4"><ErrorBlock message={list.error} onRetry={() => list.reload()} /></div>}
      {list.loading && list.items.length === 0 ? (
        <LoadingBlock />
      ) : list.items.length === 0 && !list.error ? (
        <EmptyState title="No activity recorded" description="Changes you make in the admin panel will be logged here." />
      ) : (
        <ul className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
          {list.items.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{e.label}</p>
                <p className="mt-0.5 break-words text-xs text-slate-500 dark:text-slate-400">
                  {e.entityType.replace("_", " ")}
                  {e.entityId ? ` #${e.entityId.length > 12 ? e.entityId.slice(0, 8) + "…" : e.entityId}` : ""}
                  {summarise(e.details) && ` — ${summarise(e.details)}`}
                </p>
              </div>
              <time dateTime={e.createdAt} title={fmtDateTime(e.createdAt)} className="shrink-0 text-xs text-slate-400">
                {fmtDateTime(e.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}

      <ShowMore hasMore={list.hasMore} loading={list.loadingMore} shown={list.items.length} total={list.total} onClick={list.loadMore} />
    </div>
  );
}
