"use client";

import { useState } from "react";
import { ChevronDown, Loader2, Mail, MailCheck, MailOpen, Phone, Reply, Trash2 } from "lucide-react";
import { adminFetch, buildQuery, errorMessage, fmtDateTime } from "@/lib/admin/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { useRefreshAdminBadges } from "@/components/admin/AdminShell";
import { useAdminList } from "@/components/admin/useAdminList";
import {
  ConfirmDialog, EmptyState, ErrorBlock, ExportButton, LoadingBlock, Modal, PageHeader, SearchBox,
  ShowMore, StatusBadge, Tabs, btnDangerGhost, btnGhost, btnPrimary, btnSm, card,
} from "@/components/admin/ui";

type Enquiry = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  enquiryType: string;
  careType: string | null;
  message: string;
  status: "new" | "read" | "replied";
  createdAt: string;
  relative: string;
};

export default function EnquiriesPage() {
  const toast = useAdminToast();
  const refreshBadges = useRefreshAdminBadges();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const list = useAdminList<Enquiry>("/api/admin/enquiries", { status: tab, q });

  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Enquiry | null>(null);
  const [replyTo, setReplyTo] = useState<Enquiry | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const after = async () => {
    await list.reload();
    refreshBadges();
  };

  async function setStatus(e: Enquiry, status: Enquiry["status"], silent = false) {
    setBusyId(e.id);
    try {
      await adminFetch(`/api/admin/enquiries/${e.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      if (!silent) toast.push("ok", `Marked as ${status}`);
      await after();
    } catch (err) {
      toast.push("err", errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function toggle(e: Enquiry) {
    const opening = openId !== e.id;
    setOpenId(opening ? e.id : null);
    if (opening && e.status === "new") void setStatus(e, "read", true);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    try {
      await adminFetch(`/api/admin/enquiries/${toDelete.id}`, { method: "DELETE" });
      toast.push("ok", "Enquiry deleted");
      setToDelete(null);
      await after();
    } catch (err) {
      toast.push("err", errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function startReply(e: Enquiry) {
    setReplyTo(e);
    setSubject("Re: Your enquiry to Unique Care UK");
    setMessage("");
  }

  async function sendReply() {
    if (!replyTo) return;
    setSending(true);
    try {
      await adminFetch(`/api/admin/enquiries/${replyTo.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ subject, message }),
      });
      toast.push("ok", `Reply sent to ${replyTo.email}`);
      setReplyTo(null);
      await after();
    } catch (err) {
      toast.push("err", errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  const c = list.counts;
  const exportHref = `/api/admin/enquiries/export${buildQuery({ status: tab, q })}`;

  return (
    <div>
      <PageHeader
        title="Enquiries"
        description="Messages sent through the website contact form."
        actions={<ExportButton href={exportHref} />}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "all", label: "All", count: c.all },
            { key: "new", label: "New", count: c.new },
            { key: "read", label: "Read", count: c.read },
            { key: "replied", label: "Replied", count: c.replied },
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search name, email, message" />
      </div>

      {list.error && <div className="mb-4"><ErrorBlock message={list.error} onRetry={() => list.reload()} /></div>}
      {list.loading && list.items.length === 0 ? (
        <LoadingBlock />
      ) : list.items.length === 0 && !list.error ? (
        <EmptyState
          title={q ? "No enquiries match your search" : tab === "all" ? "No enquiries yet" : `No ${tab} enquiries`}
          description="New messages from the contact form will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {list.items.map((e) => {
            const open = openId === e.id;
            const busy = busyId === e.id;
            return (
              <li key={e.id} className={`${card} overflow-hidden ${e.status === "new" ? "border-l-4 border-l-brand-primary" : ""}`}>
                <button
                  type="button"
                  onClick={() => toggle(e)}
                  aria-expanded={open}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{e.name}</span>
                      <StatusBadge status={e.status} />
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {e.enquiryType}
                      </span>
                    </div>
                    <p className={`mt-1 text-sm text-slate-500 dark:text-slate-400 ${open ? "" : "line-clamp-1"}`}>{e.message}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                    <span>{e.relative}</span>
                    <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {open && (
                  <div className="border-t border-slate-100 px-4 py-4 dark:border-slate-800">
                    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt className="admin-label">Email</dt>
                        <dd><a className="text-brand-primary hover:underline" href={`mailto:${e.email}`}>{e.email}</a></dd>
                      </div>
                      <div>
                        <dt className="admin-label">Phone</dt>
                        <dd>
                          {e.phone ? (
                            <a className="inline-flex items-center gap-1 text-brand-primary hover:underline" href={`tel:${e.phone.replace(/\s/g, "")}`}>
                              <Phone className="h-3.5 w-3.5" /> {e.phone}
                            </a>
                          ) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="admin-label">Type of care</dt>
                        <dd>{e.careType || "—"}</dd>
                      </div>
                      <div>
                        <dt className="admin-label">Received</dt>
                        <dd>{fmtDateTime(e.createdAt)}</dd>
                      </div>
                    </dl>
                    <p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed dark:bg-slate-800/60">
                      {e.message}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" className={`${btnPrimary} ${btnSm}`} onClick={() => startReply(e)}>
                        <Reply className="h-3.5 w-3.5" /> Reply
                      </button>
                      {e.status !== "read" && (
                        <button type="button" disabled={busy} className={`${btnGhost} ${btnSm}`} onClick={() => setStatus(e, "read")}>
                          <MailOpen className="h-3.5 w-3.5" /> Mark read
                        </button>
                      )}
                      {e.status !== "new" && (
                        <button type="button" disabled={busy} className={`${btnGhost} ${btnSm}`} onClick={() => setStatus(e, "new")}>
                          <Mail className="h-3.5 w-3.5" /> Mark unread
                        </button>
                      )}
                      {e.status !== "replied" && (
                        <button type="button" disabled={busy} className={`${btnGhost} ${btnSm}`} onClick={() => setStatus(e, "replied")}>
                          <MailCheck className="h-3.5 w-3.5" /> Mark replied
                        </button>
                      )}
                      <button type="button" disabled={busy} className={`${btnDangerGhost} ${btnSm} ml-auto`} onClick={() => setToDelete(e)}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
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
        title="Delete this enquiry?"
        message={<>The enquiry from <strong>{toDelete?.name}</strong> will be permanently deleted. This can&apos;t be undone.</>}
        busy={!!toDelete && busyId === toDelete.id}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />

      <Modal open={!!replyTo} title={`Reply to ${replyTo?.name ?? ""}`} onClose={() => !sending && setReplyTo(null)} wide>
        {replyTo && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Sending to <strong className="text-slate-800 dark:text-slate-100">{replyTo.email}</strong>. The enquiry will be marked as replied.
            </p>
            <div>
              <label htmlFor="reply-subject" className="admin-label">Subject</label>
              <input id="reply-subject" className="admin-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <label htmlFor="reply-message" className="admin-label">Message</label>
              <textarea id="reply-message" rows={8} className="admin-input" value={message} onChange={(e) => setMessage(e.target.value)} autoFocus />
            </div>
            <details className="text-sm text-slate-500">
              <summary className="cursor-pointer">Original message</summary>
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">{replyTo.message}</p>
            </details>
            <div className="flex justify-end gap-2">
              <button type="button" className={btnGhost} onClick={() => setReplyTo(null)} disabled={sending}>Cancel</button>
              <button type="button" className={btnPrimary} onClick={sendReply} disabled={sending || !subject.trim() || !message.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Reply className="h-4 w-4" />} Send reply
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
