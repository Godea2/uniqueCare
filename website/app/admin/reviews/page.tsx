"use client";

import { useState } from "react";
import { Check, Loader2, RotateCcw, Trash2, X } from "lucide-react";
import { adminFetch, buildQuery, errorMessage, fmtDate } from "@/lib/admin/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { useRefreshAdminBadges } from "@/components/admin/AdminShell";
import { useAdminList } from "@/components/admin/useAdminList";
import {
  ConfirmDialog, EmptyState, ErrorBlock, ExportButton, LoadingBlock, PageHeader, SearchBox,
  ShowMore, Stars, StatusBadge, Tabs, btnDangerGhost, btnGhost, btnPrimary, btnSm, card,
} from "@/components/admin/ui";

type Review = {
  id: string;
  name: string;
  relationship: string;
  rating: number;
  title: string;
  body: string;
  status: "pending" | "approved" | "rejected";
  approvedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  relative: string;
};

export default function ReviewsPage() {
  const toast = useAdminToast();
  const refreshBadges = useRefreshAdminBadges();
  const [tab, setTab] = useState("pending");
  const [q, setQ] = useState("");
  const list = useAdminList<Review>("/api/admin/reviews", { status: tab, q });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Review | null>(null);

  const after = async () => {
    await list.reload();
    refreshBadges();
  };

  async function setStatus(r: Review, status: Review["status"]) {
    setBusyId(r.id);
    try {
      await adminFetch(`/api/admin/reviews/${r.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast.push("ok", status === "approved" ? "Review approved and published" : status === "rejected" ? "Review rejected" : "Review moved back to pending");
      await after();
    } catch (err) {
      toast.push("err", errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    try {
      await adminFetch(`/api/admin/reviews/${toDelete.id}`, { method: "DELETE" });
      toast.push("ok", "Review deleted");
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
        title="Reviews"
        description="Approve reviews to publish them on the website. Rejected reviews are never shown publicly."
        actions={<ExportButton href={`/api/admin/reviews/export${buildQuery({ status: tab, q })}`} />}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "pending", label: "Pending", count: c.pending },
            { key: "approved", label: "Approved", count: c.approved },
            { key: "rejected", label: "Rejected", count: c.rejected },
            { key: "all", label: "All", count: c.all },
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search name, title, review" />
      </div>

      {list.error && <div className="mb-4"><ErrorBlock message={list.error} onRetry={() => list.reload()} /></div>}
      {list.loading && list.items.length === 0 ? (
        <LoadingBlock />
      ) : list.items.length === 0 && !list.error ? (
        <EmptyState
          title={q ? "No reviews match your search" : tab === "pending" ? "Nothing waiting for moderation" : "No reviews here yet"}
          description="Reviews submitted on the website will appear here for approval."
        />
      ) : (
        <ul className="space-y-3">
          {list.items.map((r) => {
            const busy = busyId === r.id;
            return (
              <li key={r.id} className={`${card} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Stars rating={r.rating} />
                      <StatusBadge status={r.status} />
                    </div>
                    <h3 className="mt-1.5 font-semibold">{r.title}</h3>
                  </div>
                  <span className="text-xs text-slate-400">{r.relative}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">{r.body}</p>
                <p className="mt-3 text-xs text-slate-500">
                  <strong className="text-slate-700 dark:text-slate-200">{r.name}</strong> · {r.relationship} · Submitted {fmtDate(r.createdAt)}
                  {r.reviewedAt && <> · Reviewed {fmtDate(r.reviewedAt)}</>}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.status !== "approved" && (
                    <button type="button" disabled={busy} className={`${btnPrimary} ${btnSm}`} onClick={() => setStatus(r, "approved")}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
                    </button>
                  )}
                  {r.status !== "rejected" && (
                    <button type="button" disabled={busy} className={`${btnGhost} ${btnSm}`} onClick={() => setStatus(r, "rejected")}>
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  )}
                  {r.status !== "pending" && (
                    <button type="button" disabled={busy} className={`${btnGhost} ${btnSm}`} onClick={() => setStatus(r, "pending")}>
                      <RotateCcw className="h-3.5 w-3.5" /> Back to pending
                    </button>
                  )}
                  <button type="button" disabled={busy} className={`${btnDangerGhost} ${btnSm} ml-auto`} onClick={() => setToDelete(r)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ShowMore hasMore={list.hasMore} loading={list.loadingMore} shown={list.items.length} total={list.total} onClick={list.loadMore} />

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this review?"
        message={<>The review &ldquo;{toDelete?.title}&rdquo; by <strong>{toDelete?.name}</strong> will be permanently deleted{toDelete?.status === "approved" ? " and removed from the website" : ""}.</>}
        busy={!!toDelete && busyId === toDelete.id}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
