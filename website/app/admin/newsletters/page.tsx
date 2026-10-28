"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Pencil, PenSquare, Send, Trash2 } from "lucide-react";
import { adminFetch, errorMessage, fmtDateTime } from "@/lib/admin/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { useAdminList } from "@/components/admin/useAdminList";
import {
  ConfirmDialog, EmptyState, ErrorBlock, LoadingBlock, PageHeader, ShowMore, StatusBadge, Tabs,
  btnDangerGhost, btnGhost, btnPrimary, btnSm, card,
} from "@/components/admin/ui";

type Newsletter = {
  id: number;
  subject: string;
  content: string;
  recipientsCount: number | null;
  status: "draft" | "sent";
  sentAt: string | null;
  createdAt: string;
};

export default function NewslettersPage() {
  const toast = useAdminToast();
  const [tab, setTab] = useState("all");
  const list = useAdminList<Newsletter, { activeSubscribers: number }>("/api/admin/newsletters", { status: tab });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<Newsletter | null>(null);
  const [toSend, setToSend] = useState<Newsletter | null>(null);

  const active = list.extra.activeSubscribers ?? 0;

  async function confirmDelete() {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    try {
      await adminFetch(`/api/admin/newsletters/${toDelete.id}`, { method: "DELETE" });
      toast.push("ok", "Newsletter deleted");
      setToDelete(null);
      await list.reload();
    } catch (err) {
      toast.push("err", errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmSend() {
    if (!toSend) return;
    setBusyId(toSend.id);
    try {
      const r = await adminFetch<{ delivered: number; failed: number }>(`/api/admin/newsletters/${toSend.id}/send`, { method: "POST" });
      toast.push("ok", `Sent to ${r.delivered} subscriber${r.delivered === 1 ? "" : "s"}${r.failed ? ` (${r.failed} failed)` : ""}`);
      setToSend(null);
      await list.reload();
    } catch (err) {
      toast.push("err", errorMessage(err));
      setToSend(null);
    } finally {
      setBusyId(null);
    }
  }

  const c = list.counts;

  return (
    <div>
      <PageHeader
        title="Newsletters"
        description={`Compose and send updates to your ${active} active subscriber${active === 1 ? "" : "s"}.`}
        actions={
          <Link href="/admin/newsletters/compose" className={btnPrimary}>
            <PenSquare className="h-4 w-4" /> Compose
          </Link>
        }
      />

      <div className="mb-4">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "all", label: "All", count: c.all },
            { key: "draft", label: "Drafts", count: c.draft },
            { key: "sent", label: "Sent", count: c.sent },
          ]}
        />
      </div>

      {list.error && <div className="mb-4"><ErrorBlock message={list.error} onRetry={() => list.reload()} /></div>}
      {list.loading && list.items.length === 0 ? (
        <LoadingBlock />
      ) : list.items.length === 0 && !list.error ? (
        <EmptyState
          title="No newsletters yet"
          description="Write your first newsletter to share care advice and news with subscribers."
          action={<Link href="/admin/newsletters/compose" className={btnPrimary}><PenSquare className="h-4 w-4" /> Compose newsletter</Link>}
        />
      ) : (
        <ul className="space-y-3">
          {list.items.map((n) => {
            const busy = busyId === n.id;
            return (
              <li key={n.id} className={`${card} flex flex-wrap items-center gap-3 p-4`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/newsletters/${n.id}`} className="truncate font-semibold hover:text-brand-primary">
                      {n.subject || "(no subject)"}
                    </Link>
                    <StatusBadge status={n.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {n.status === "sent"
                      ? `Sent ${fmtDateTime(n.sentAt)} to ${n.recipientsCount ?? 0} subscribers`
                      : `Created ${fmtDateTime(n.createdAt)}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/admin/newsletters/${n.id}`} className={`${btnGhost} ${btnSm}`}>
                    <Pencil className="h-3.5 w-3.5" /> {n.status === "draft" ? "Edit" : "View"}
                  </Link>
                  {n.status === "draft" && (
                    <button type="button" disabled={busy || active === 0} className={`${btnPrimary} ${btnSm}`} onClick={() => setToSend(n)}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send
                    </button>
                  )}
                  <button type="button" disabled={busy} className={`${btnDangerGhost} ${btnSm}`} onClick={() => setToDelete(n)} aria-label={`Delete ${n.subject}`}>
                    <Trash2 className="h-3.5 w-3.5" />
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
        title="Delete this newsletter?"
        message={<>&ldquo;{toDelete?.subject}&rdquo; will be permanently deleted. Emails already sent are not recalled.</>}
        busy={!!toDelete && busyId === toDelete.id}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
      <ConfirmDialog
        open={!!toSend}
        title="Send this newsletter?"
        message={<>&ldquo;{toSend?.subject}&rdquo; will be emailed to <strong>{active}</strong> active subscriber{active === 1 ? "" : "s"} now. This can&apos;t be undone.</>}
        confirmLabel="Send now"
        danger={false}
        busy={!!toSend && busyId === toSend.id}
        onConfirm={confirmSend}
        onCancel={() => setToSend(null)}
      />
    </div>
  );
}
