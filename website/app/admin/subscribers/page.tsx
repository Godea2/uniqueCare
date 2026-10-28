"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Mail, Trash2, UserMinus, UserPlus, UserCheck } from "lucide-react";
import { adminFetch, buildQuery, errorMessage, fmtDate } from "@/lib/admin/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { useAdminList } from "@/components/admin/useAdminList";
import {
  ConfirmDialog, EmptyState, ErrorBlock, ExportButton, LoadingBlock, PageHeader, SearchBox,
  ShowMore, StatusBadge, Tabs, btnDangerGhost, btnGhost, btnPrimary, btnSm, card,
} from "@/components/admin/ui";

type Subscriber = {
  id: number;
  email: string;
  status: "active" | "unsubscribed";
  createdAt: string;
  relative: string;
};

export default function SubscribersPage() {
  const toast = useAdminToast();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const list = useAdminList<Subscriber>("/api/admin/subscribers", { status: tab, q });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<Subscriber | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setAdding(true);
    try {
      await adminFetch("/api/admin/subscribers", { method: "POST", body: JSON.stringify({ email: newEmail }) });
      toast.push("ok", "Subscriber added");
      setNewEmail("");
      await list.reload();
    } catch (err) {
      toast.push("err", errorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  async function setStatus(s: Subscriber, status: Subscriber["status"]) {
    setBusyId(s.id);
    try {
      await adminFetch(`/api/admin/subscribers/${s.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast.push("ok", status === "active" ? "Subscriber re-activated" : "Subscriber unsubscribed");
      await list.reload();
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
      await adminFetch(`/api/admin/subscribers/${toDelete.id}`, { method: "DELETE" });
      toast.push("ok", "Subscriber deleted");
      setToDelete(null);
      await list.reload();
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
        title="Subscribers"
        description="People who signed up for news and care advice from the website footer."
        actions={
          <>
            <Link href="/admin/newsletters/compose" className={btnPrimary}>
              <Mail className="h-4 w-4" /> Compose newsletter
            </Link>
            <ExportButton href={`/api/admin/subscribers/export${buildQuery({ status: tab, q })}`} />
          </>
        }
      />

      <form onSubmit={add} className={`${card} mb-4 flex flex-wrap items-end gap-3 p-4`}>
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="add-sub" className="admin-label">Add a subscriber</label>
          <input
            id="add-sub"
            type="email"
            required
            placeholder="name@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="admin-input"
          />
        </div>
        <button type="submit" disabled={adding} className={btnGhost}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add
        </button>
      </form>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "all", label: "All", count: c.all },
            { key: "active", label: "Active", count: c.active },
            { key: "unsubscribed", label: "Unsubscribed", count: c.unsubscribed },
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search email" />
      </div>

      {list.error && <div className="mb-4"><ErrorBlock message={list.error} onRetry={() => list.reload()} /></div>}
      {list.loading && list.items.length === 0 ? (
        <LoadingBlock />
      ) : list.items.length === 0 && !list.error ? (
        <EmptyState
          title={q ? "No subscribers match your search" : "No subscribers yet"}
          description="Sign-ups from the website footer will appear here."
        />
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">Subscribed</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.items.map((s) => {
                const busy = busyId === s.id;
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-medium">{s.email}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">{fmtDate(s.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {s.status === "active" ? (
                          <button type="button" disabled={busy} className={`${btnGhost} ${btnSm}`} onClick={() => setStatus(s, "unsubscribed")}>
                            <UserMinus className="h-3.5 w-3.5" /> Unsubscribe
                          </button>
                        ) : (
                          <button type="button" disabled={busy} className={`${btnGhost} ${btnSm}`} onClick={() => setStatus(s, "active")}>
                            <UserCheck className="h-3.5 w-3.5" /> Re-activate
                          </button>
                        )}
                        <button type="button" disabled={busy} className={`${btnDangerGhost} ${btnSm}`} onClick={() => setToDelete(s)} aria-label={`Delete ${s.email}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ShowMore hasMore={list.hasMore} loading={list.loadingMore} shown={list.items.length} total={list.total} onClick={list.loadMore} />

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this subscriber?"
        message={<><strong>{toDelete?.email}</strong> will be permanently removed from the list.</>}
        busy={!!toDelete && busyId === toDelete.id}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
