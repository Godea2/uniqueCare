import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, EmptyState, Chip, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import type { RouterOutputs } from "@/lib/router-types";
import { ConfirmDelete, FilterBar, Pager, rowStyle, thClass, useListParams } from "./shared";

type Newsletter = RouterOutputs["website"]["newsletters"]["list"]["items"][number];
const STATUSES = ["draft", "sent"] as const;

export default function Newsletters() {
  const utils = trpc.useUtils();
  const params = useListParams();
  const q = trpc.website.newsletters.list.useQuery(params.input, { placeholderData: keepPreviousData });
  const subs = trpc.website.subscribers.list.useQuery({ status: "active", limit: 1 });
  const [editing, setEditing] = useState<Newsletter | "new" | null>(null);
  const [viewing, setViewing] = useState<Newsletter | null>(null);
  const [sending, setSending] = useState<Newsletter | null>(null);
  const [deleting, setDeleting] = useState<Newsletter | null>(null);

  const refresh = () => { void utils.website.newsletters.list.invalidate(); void utils.website.dashboard.invalidate(); };
  const send = trpc.website.newsletters.send.useMutation({
    onSuccess: (r) => {
      refresh(); setSending(null);
      toast.success(`Sent to ${r.delivered} subscriber${r.delivered === 1 ? "" : "s"}${r.failed ? ` (${r.failed} failed)` : ""}`);
    },
    onError: (e) => { setSending(null); toast.error(e.message); },
  });
  const del = trpc.website.newsletters.delete.useMutation({
    onSuccess: () => { refresh(); setDeleting(null); toast.success("Newsletter deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const items = q.data?.items ?? [];
  const activeSubs = subs.data?.total ?? 0;

  return (
    <div>
      <PageHeader
        title="Newsletters"
        subtitle="Write and send updates to active website subscribers."
        actions={<Button onClick={() => setEditing("new")}><Plus className="mr-1.5 h-4 w-4" />New newsletter</Button>}
      />
      <FilterBar params={params} statuses={STATUSES} counts={q.data?.counts} placeholder="Search subject…" />

      {q.isLoading ? <Loading rows={5} />
        : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : items.length === 0 ? <EmptyState title="No newsletters" hint="Create a draft to get started." />
        : (
          <>
            <div className="uc-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground" style={rowStyle}>
                    <th className={thClass}>Subject</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>Recipients</th>
                    <th className={thClass}>Created</th>
                    <th className={thClass}>Sent</th>
                    <th className={`${thClass} text-right`}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((n) => (
                    <tr key={n.id} className="border-b last:border-0" style={rowStyle}>
                      <td className="max-w-80 truncate px-4 py-2 font-medium" title={n.subject}>{n.subject || "(no subject)"}</td>
                      <td className="px-4 py-2"><Chip value={n.status} /></td>
                      <td className="px-4 py-2 text-xs tabular-nums">{n.recipientsCount ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDateTime(n.sentAt)}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          {n.status === "draft" ? (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setEditing(n)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                              <Button size="sm" onClick={() => setSending(n)}><Send className="mr-1 h-3.5 w-3.5" />Send</Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setViewing(n)}><Eye className="mr-1 h-3.5 w-3.5" />View</Button>
                          )}
                          <Button size="sm" variant="ghost" aria-label={`Delete newsletter ${n.subject}`} onClick={() => setDeleting(n)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager offset={params.offset} limit={params.limit} total={q.data?.total ?? 0} onChange={params.setOffset} />
          </>
        )}

      {editing && (
        <NewsletterEditor
          key={editing === "new" ? "new" : editing.id}
          newsletter={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { refresh(); setEditing(null); }}
        />
      )}

      <Dialog open={!!viewing} onOpenChange={(v) => { if (!v) setViewing(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>{viewing.subject}</DialogTitle>
                <DialogDescription>Sent {fmtDateTime(viewing.sentAt)} to {viewing.recipientsCount ?? 0} subscribers</DialogDescription>
              </DialogHeader>
              <p className="whitespace-pre-wrap rounded-xl border bg-white/70 p-3 text-sm leading-relaxed" style={rowStyle}>{viewing.content}</p>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDelete
        open={!!sending}
        onOpenChange={(v) => { if (!v && !send.isPending) setSending(null); }}
        title="Send this newsletter now?"
        description={<>“{sending?.subject}” will be emailed to {activeSubs} active subscriber{activeSubs === 1 ? "" : "s"}. This cannot be undone and the newsletter can’t be edited afterwards.</>}
        confirmLabel={`Send to ${activeSubs}`}
        busy={send.isPending}
        onConfirm={() => sending && send.mutate({ id: sending.id })}
      />

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        title="Delete this newsletter?"
        description={<>“{deleting?.subject}” will be permanently removed{deleting?.status === "sent" ? " from the sent history" : ""}.</>}
        busy={del.isPending}
        onConfirm={() => deleting && del.mutate({ id: deleting.id })}
      />
    </div>
  );
}

function NewsletterEditor({
  newsletter, onClose, onSaved,
}: { newsletter: Newsletter | null; onClose: () => void; onSaved: () => void }) {
  const [subject, setSubject] = useState(newsletter?.subject ?? "");
  const [content, setContent] = useState(newsletter?.content ?? "");
  const opts = {
    onSuccess: () => { toast.success(newsletter ? "Draft saved" : "Draft created"); onSaved(); },
    onError: (e: { message: string }) => toast.error(e.message),
  };
  const create = trpc.website.newsletters.create.useMutation(opts);
  const update = trpc.website.newsletters.update.useMutation(opts);
  const busy = create.isPending || update.isPending;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{newsletter ? "Edit draft" : "New newsletter"}</DialogTitle>
          <DialogDescription>Leave a blank line between paragraphs. Links are made clickable automatically; an unsubscribe link is added to every email.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (newsletter) update.mutate({ id: newsletter.id, subject, content });
            else create.mutate({ subject, content });
          }}
        >
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-label="Subject" maxLength={200} />
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={12} placeholder="Write your newsletter…" aria-label="Content" maxLength={50000} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || !subject.trim() || !content.trim()}>{busy ? "Saving…" : "Save draft"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
