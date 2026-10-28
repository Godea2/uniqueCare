"use client";

import { useState } from "react";
import { Check, ChevronDown, Eye, Loader2, Trash2, X } from "lucide-react";
import { adminFetch, buildQuery, errorMessage, fmtDateTime } from "@/lib/admin/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { useRefreshAdminBadges } from "@/components/admin/AdminShell";
import { useAdminList } from "@/components/admin/useAdminList";
import {
  ConfirmDialog, EmptyState, ErrorBlock, ExportButton, LoadingBlock, PageHeader, SearchBox,
  ShowMore, StatusBadge, Tabs, btnDangerGhost, btnGhost, btnPrimary, btnSm, card,
} from "@/components/admin/ui";

type Status = "new" | "reviewing" | "shortlisted" | "rejected";
type Application = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  jobSlug: string;
  jobTitle: string;
  coverLetter: string;
  rightToWork: boolean;
  drivingLicence: boolean;
  status: Status;
  createdAt: string;
  relative: string;
};

export default function ApplicationsPage() {
  const toast = useAdminToast();
  const refreshBadges = useRefreshAdminBadges();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const list = useAdminList<Application>("/api/admin/applications", { status: tab, q });
  const [openId, setOpenId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<Application | null>(null);

  const after = async () => {
    await list.reload();
    refreshBadges();
  };

  async function setStatus(a: Application, status: Status, silent = false) {
    setBusyId(a.id);
    try {
      await adminFetch(`/api/admin/applications/${a.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      if (!silent) toast.push("ok", `Marked as ${status}`);
      await after();
    } catch (err) {
      toast.push("err", errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function toggle(a: Application) {
    const opening = openId !== a.id;
    setOpenId(opening ? a.id : null);
    if (opening && a.status === "new") void setStatus(a, "reviewing", true);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    try {
      await adminFetch(`/api/admin/applications/${toDelete.id}`, { method: "DELETE" });
      toast.push("ok", "Application deleted");
      setToDelete(null);
      await after();
    } catch (err) {
      toast.push("err", errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const c = list.counts;

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Job applications submitted through the website form. Applications made through the job portal are managed in the portal."
        actions={<ExportButton href={`/api/admin/applications/export${buildQuery({ status: tab, q })}`} />}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "all", label: "All", count: c.all },
            { key: "new", label: "New", count: c.new },
            { key: "reviewing", label: "Reviewing", count: c.reviewing },
            { key: "shortlisted", label: "Shortlisted", count: c.shortlisted },
            { key: "rejected", label: "Rejected", count: c.rejected },
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search name, email, job" />
      </div>

      {list.error && <div className="mb-4"><ErrorBlock message={list.error} onRetry={() => list.reload()} /></div>}
      {list.loading && list.items.length === 0 ? (
        <LoadingBlock />
      ) : list.items.length === 0 && !list.error ? (
        <EmptyState
          title={q ? "No applications match your search" : "No applications yet"}
          description="Applications submitted on the website will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {list.items.map((a) => {
            const open = openId === a.id;
            const busy = busyId === a.id;
            return (
              <li key={a.id} className={`${card} overflow-hidden ${a.status === "new" ? "border-l-4 border-l-brand-primary" : ""}`}>
                <button
                  type="button"
                  onClick={() => toggle(a)}
                  aria-expanded={open}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{a.name}</span>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{a.jobTitle}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                    <span>{a.relative}</span>
                    <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {open && (
                  <div className="border-t border-slate-100 px-4 py-4 dark:border-slate-800">
                    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt className="admin-label">Email</dt>
                        <dd><a className="text-brand-primary hover:underline" href={`mailto:${a.email}`}>{a.email}</a></dd>
                      </div>
                      <div>
                        <dt className="admin-label">Phone</dt>
                        <dd>{a.phone ? <a className="text-brand-primary hover:underline" href={`tel:${a.phone.replace(/\s/g, "")}`}>{a.phone}</a> : "—"}</dd>
                      </div>
                      <div>
                        <dt className="admin-label">Right to work (UK)</dt>
                        <dd>{a.rightToWork ? "Yes" : "No"}</dd>
                      </div>
                      <div>
                        <dt className="admin-label">Driving licence</dt>
                        <dd>{a.drivingLicence ? "Yes" : "No"}</dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-xs text-slate-500">Applied {fmtDateTime(a.createdAt)} · Job: {a.jobSlug}</p>
                    {a.coverLetter ? (
                      <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed dark:bg-slate-800/60">{a.coverLetter}</p>
                    ) : (
                      <p className="mt-3 text-sm italic text-slate-400">No cover letter provided.</p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {a.status !== "reviewing" && (
                        <button type="button" disabled={busy} className={`${btnGhost} ${btnSm}`} onClick={() => setStatus(a, "reviewing")}>
                          <Eye className="h-3.5 w-3.5" /> Reviewing
                        </button>
                      )}
                      {a.status !== "shortlisted" && (
                        <button type="button" disabled={busy} className={`${btnPrimary} ${btnSm}`} onClick={() => setStatus(a, "shortlisted")}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Shortlist
                        </button>
                      )}
                      {a.status !== "rejected" && (
                        <button type="button" disabled={busy} className={`${btnGhost} ${btnSm}`} onClick={() => setStatus(a, "rejected")}>
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                      )}
                      <button type="button" disabled={busy} className={`${btnDangerGhost} ${btnSm} ml-auto`} onClick={() => setToDelete(a)}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ShowMore hasMore={list.hasMore} loading={list.loadingMore} shown={list.items.length} total={list.total} onClick={list.loadMore} />

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this application?"
        message={<>The application from <strong>{toDelete?.name}</strong> for {toDelete?.jobTitle} will be permanently deleted.</>}
        busy={!!toDelete && busyId === toDelete.id}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
