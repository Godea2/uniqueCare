"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Eye, Loader2, Save, Send } from "lucide-react";
import Link from "next/link";
import { adminFetch, errorMessage, fmtDateTime } from "@/lib/admin/client";
import { useAdminToast } from "./AdminToast";
import { ConfirmDialog, ErrorBlock, LoadingBlock, PageHeader, StatusBadge, btnGhost, btnPrimary, card } from "./ui";

type Newsletter = {
  id: number;
  subject: string;
  content: string;
  recipientsCount: number | null;
  status: "draft" | "sent";
  sentAt: string | null;
};

export default function NewsletterEditor({ id }: { id?: string }) {
  const router = useRouter();
  const toast = useAdminToast();
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nl, setNl] = useState<Newsletter | null>(null);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [preview, setPreview] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [subs, existing] = await Promise.all([
          adminFetch<{ counts: Record<string, number> }>("/api/admin/subscribers?limit=1"),
          id ? adminFetch<Newsletter>(`/api/admin/newsletters/${id}`) : Promise.resolve(null),
        ]);
        if (!alive) return;
        setActive(subs.counts.active ?? 0);
        if (existing) {
          setNl(existing);
          setSubject(existing.subject);
          setContent(existing.content);
        }
      } catch (e) {
        if (alive) setLoadError(errorMessage(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const readOnly = nl?.status === "sent";
  const valid = subject.trim().length > 0 && content.trim().length > 0;

  /** Saves (creating if new) and returns the newsletter id. */
  async function save(silent = false): Promise<number | null> {
    if (!valid) {
      toast.push("err", "Add a subject and some content first");
      return null;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({ subject, content });
      const saved = nl
        ? await adminFetch<Newsletter>(`/api/admin/newsletters/${nl.id}`, { method: "PATCH", body })
        : await adminFetch<Newsletter>("/api/admin/newsletters", { method: "POST", body });
      setNl(saved);
      if (!silent) toast.push("ok", "Draft saved");
      if (!nl) router.replace(`/admin/newsletters/${saved.id}`);
      return saved.id;
    } catch (e) {
      toast.push("err", errorMessage(e));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function send() {
    setSending(true);
    try {
      const nid = await save(true);
      if (nid == null) return;
      const r = await adminFetch<{ delivered: number; failed: number; newsletter: Newsletter }>(
        `/api/admin/newsletters/${nid}/send`,
        { method: "POST" },
      );
      setNl(r.newsletter);
      toast.push("ok", `Sent to ${r.delivered} subscriber${r.delivered === 1 ? "" : "s"}${r.failed ? ` (${r.failed} failed)` : ""}`);
      router.push("/admin/newsletters");
    } catch (e) {
      toast.push("err", errorMessage(e));
    } finally {
      setSending(false);
      setConfirmSend(false);
    }
  }

  if (loading) return <LoadingBlock />;
  if (loadError) return <ErrorBlock message={loadError} />;

  return (
    <div>
      <Link href="/admin/newsletters" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-primary">
        <ArrowLeft className="h-4 w-4" /> All newsletters
      </Link>
      <PageHeader
        title={readOnly ? "Sent newsletter" : id ? "Edit newsletter" : "Compose newsletter"}
        description={
          readOnly
            ? `Sent ${fmtDateTime(nl?.sentAt)} to ${nl?.recipientsCount ?? 0} subscribers. Sent newsletters can't be edited.`
            : `Will be emailed to ${active ?? 0} active subscriber${active === 1 ? "" : "s"}.`
        }
        actions={nl && <StatusBadge status={nl.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${card} space-y-4 p-5`}>
          <div>
            <label htmlFor="nl-subject" className="admin-label">Subject</label>
            <input
              id="nl-subject"
              className="admin-input"
              value={subject}
              maxLength={200}
              disabled={readOnly}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Winter care tips from Unique Care UK"
            />
          </div>
          <div>
            <label htmlFor="nl-content" className="admin-label">Content</label>
            <textarea
              id="nl-content"
              rows={16}
              className="admin-input font-mono"
              value={content}
              disabled={readOnly}
              onChange={(e) => setContent(e.target.value)}
              placeholder={"Write your message here.\n\nLeave a blank line between paragraphs. Web addresses become links automatically."}
            />
            <p className="mt-1 text-xs text-slate-500">Plain text. An unsubscribe link is added to every email automatically.</p>
          </div>
          {!readOnly && (
            <div className="flex flex-wrap justify-between gap-2">
              <button type="button" className={`${btnGhost} lg:hidden`} onClick={() => setPreview((p) => !p)}>
                <Eye className="h-4 w-4" /> {preview ? "Hide" : "Show"} preview
              </button>
              <div className="ml-auto flex gap-2">
                <button type="button" className={btnGhost} onClick={() => save()} disabled={saving || sending || !valid}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
                </button>
                <button type="button" className={btnPrimary} onClick={() => setConfirmSend(true)} disabled={saving || sending || !valid || !active}>
                  <Send className="h-4 w-4" /> Send…
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={`${preview ? "" : "hidden"} lg:block`}>
          <p className="admin-label">Preview</p>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800">
            <div className="bg-[#124b99] px-5 py-4 font-semibold text-white">Unique Care UK</div>
            <div className="bg-white p-5 text-[15px] text-slate-800">
              <h2 className="mb-3 text-xl font-semibold">{subject || "Subject line"}</h2>
              {content.trim() ? (
                content
                  .split(/\n{2,}/)
                  .filter((b) => b.trim())
                  .map((b, i) => (
                    <p key={i} className="mb-4 whitespace-pre-line leading-relaxed">
                      {b.trim()}
                    </p>
                  ))
              ) : (
                <p className="text-slate-400">Your content will appear here.</p>
              )}
            </div>
            <p className="bg-slate-50 px-5 py-3 text-center text-xs text-slate-500">Unsubscribe link added automatically</p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSend}
        title="Send this newsletter?"
        message={<>&ldquo;{subject}&rdquo; will be emailed to <strong>{active}</strong> active subscriber{active === 1 ? "" : "s"} straight away. This can&apos;t be undone.</>}
        confirmLabel="Send now"
        danger={false}
        busy={sending}
        onConfirm={send}
        onCancel={() => setConfirmSend(false)}
      />
    </div>
  );
}
