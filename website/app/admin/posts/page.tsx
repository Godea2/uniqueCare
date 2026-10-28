"use client";

import Link from "next/link";
import { useState } from "react";
import { Archive, ExternalLink, Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { adminFetch, errorMessage, fmtDate } from "@/lib/admin/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { useAdminList } from "@/components/admin/useAdminList";
import {
  ConfirmDialog, EmptyState, ErrorBlock, LoadingBlock, PageHeader, SearchBox, ShowMore, StatusBadge, Tabs,
  btnDangerGhost, btnGhost, btnPrimary, btnSm, card,
} from "@/components/admin/ui";

type Post = {
  id: number;
  title: string;
  slug: string;
  category: string;
  imageUrl: string | null;
  excerpt: string;
  status: "draft" | "published" | "archived";
  createdAt: string;
  updatedAt: string;
};

export default function PostsPage() {
  const toast = useAdminToast();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const list = useAdminList<Post>("/api/admin/posts", { status: tab, q });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<Post | null>(null);

  async function setStatus(p: Post, status: Post["status"]) {
    setBusyId(p.id);
    try {
      await adminFetch(`/api/admin/posts/${p.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast.push("ok", status === "published" ? "Post published" : status === "archived" ? "Post archived" : "Post moved to drafts");
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
      await adminFetch(`/api/admin/posts/${toDelete.id}`, { method: "DELETE" });
      toast.push("ok", "Post deleted");
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
        title="Blog posts"
        description="Create and publish articles. Built-in articles continue to show on the blog alongside posts published here."
        actions={
          <Link href="/admin/posts/new" className={btnPrimary}>
            <Plus className="h-4 w-4" /> New post
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "all", label: "All", count: c.all },
            { key: "published", label: "Published", count: c.published },
            { key: "draft", label: "Drafts", count: c.draft },
            { key: "archived", label: "Archived", count: c.archived },
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search title or address" />
      </div>

      {list.error && <div className="mb-4"><ErrorBlock message={list.error} onRetry={() => list.reload()} /></div>}
      {list.loading && list.items.length === 0 ? (
        <LoadingBlock />
      ) : list.items.length === 0 && !list.error ? (
        <EmptyState
          title={q ? "No posts match your search" : "No posts yet"}
          description="Write your first article to share care advice and company news."
          action={<Link href="/admin/posts/new" className={btnPrimary}><Plus className="h-4 w-4" /> New post</Link>}
        />
      ) : (
        <ul className="space-y-3">
          {list.items.map((p) => {
            const busy = busyId === p.id;
            return (
              <li key={p.id} className={`${card} flex flex-wrap items-center gap-4 p-4`}>
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="hidden h-16 w-24 shrink-0 rounded-lg object-cover sm:block" />
                ) : (
                  <div className="hidden h-16 w-24 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 sm:block" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/posts/${p.id}/edit`} className="font-semibold hover:text-brand-primary">{p.title}</Link>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {p.category} · /blog/{p.slug} · Updated {fmtDate(p.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/posts/${p.id}/edit`} className={`${btnGhost} ${btnSm}`}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Link>
                  {p.status === "published" && (
                    <Link href={`/blog/${p.slug}`} target="_blank" className={`${btnGhost} ${btnSm}`}>
                      <ExternalLink className="h-3.5 w-3.5" /> View
                    </Link>
                  )}
                  {p.status !== "published" && (
                    <button type="button" disabled={busy} className={`${btnPrimary} ${btnSm}`} onClick={() => setStatus(p, "published")}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Publish
                    </button>
                  )}
                  {p.status === "published" && (
                    <button type="button" disabled={busy} className={`${btnGhost} ${btnSm}`} onClick={() => setStatus(p, "archived")}>
                      <Archive className="h-3.5 w-3.5" /> Archive
                    </button>
                  )}
                  <button type="button" disabled={busy} className={`${btnDangerGhost} ${btnSm}`} onClick={() => setToDelete(p)} aria-label={`Delete ${p.title}`}>
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
        title="Delete this post?"
        message={<>&ldquo;{toDelete?.title}&rdquo; will be permanently deleted{toDelete?.status === "published" ? " and removed from the blog" : ""}.</>}
        busy={!!toDelete && busyId === toDelete.id}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
