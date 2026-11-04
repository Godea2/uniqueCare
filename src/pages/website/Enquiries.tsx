import { useEffect, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Mail, Phone, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, EmptyState, Chip, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import type { RouterOutputs } from "@/lib/router-types";
import {
  ConfirmDelete, ExportButton, FilterBar, Pager, downloadCsv, enquiryStatusLabel, ENQUIRY_STATUS_LABELS, rowStyle, thClass, useListParams,
} from "./shared";

type Enquiry = RouterOutputs["website"]["enquiries"]["list"]["items"][number];
const STATUSES = ["new", "read", "replied", "closed"] as const;
const WEBSITE_URL = (import.meta.env.VITE_WEBSITE_URL as string | undefined)?.replace(/\/$/, "") || "https://uniquecareuk.com";

function formatType(type: string) {
  return type.replace(/_/g, " ");
}

export default function Enquiries() {
  const utils = trpc.useUtils();
  const params = useListParams();
  const q = trpc.website.enquiries.list.useQuery(params.input, { placeholderData: keepPreviousData });
  const [open, setOpen] = useState<Enquiry | null>(null);
  const [deleting, setDeleting] = useState<Enquiry | null>(null);
  const [exporting, setExporting] = useState(false);

  const refresh = () => { void utils.website.enquiries.list.invalidate(); void utils.website.dashboard.invalidate(); };
  const patch = trpc.website.enquiries.patch.useMutation({
    onSuccess: (row) => { refresh(); setOpen((o) => (o && o.id === row.id ? row : o)); toast.success("Enquiry updated"); },
    onError: (e) => toast.error(e.message),
  });
  const markRead = trpc.website.enquiries.patch.useMutation({
    onSuccess: (row) => {
      void utils.website.enquiries.list.invalidate();
      void utils.website.dashboard.invalidate();
      setOpen((o) => (o && o.id === row.id ? row : o));
    },
  });
  const del = trpc.website.enquiries.delete.useMutation({
    onSuccess: () => { refresh(); setDeleting(null); setOpen(null); toast.success("Enquiry deleted"); },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (open?.status === "new") markRead.mutate({ id: open.id, status: "read" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a different enquiry is opened
  }, [open?.id]);

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await utils.website.enquiries.exportCsv.fetch(params.exportInput);
      downloadCsv(res.filename, res.csv);
      toast.success(`Exported ${res.count} enquiries`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const items = q.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Website enquiries"
        subtitle="Messages from the public contact form. Open a row to reply by email from the portal mailbox."
        actions={<ExportButton busy={exporting} onClick={exportCsv} />}
      />
      <FilterBar params={params} statuses={STATUSES} counts={q.data?.counts} labels={ENQUIRY_STATUS_LABELS} placeholder="Search name, email, message..." />

      {q.isLoading ? <Loading rows={6} />
        : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : items.length === 0 ? <EmptyState title="No enquiries" hint="Nothing matches this filter yet." />
        : (
          <>
            <div className="uc-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground" style={rowStyle}>
                    <th className={thClass}>Received</th>
                    <th className={thClass}>From</th>
                    <th className={thClass}>Type</th>
                    <th className={thClass}>Message</th>
                    <th className={thClass}>Status</th>
                    <th className={`${thClass} text-right`}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e) => (
                    <tr
                      key={e.id}
                      className="cursor-pointer border-b last:border-0 hover:bg-[--brand-50]/50"
                      style={rowStyle}
                      onClick={() => setOpen(e)}
                    >
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</td>
                      <td className="px-4 py-2">
                        <p className="font-medium">{e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.email}{e.phone ? ` - ${e.phone}` : ""}</p>
                      </td>
                      <td className="px-4 py-2 text-xs capitalize">
                        {formatType(e.enquiryType)}
                        {e.careType ? ` - ${formatType(e.careType)}` : ""}
                      </td>
                      <td className="max-w-72 truncate px-4 py-2 text-xs text-muted-foreground" title={e.message}>{e.message}</td>
                      <td className="px-4 py-2" onClick={(ev) => ev.stopPropagation()}>
                        <Select
                          value={e.status}
                          onValueChange={(status) => patch.mutate({ id: e.id, status: status as (typeof STATUSES)[number] })}
                        >
                          <SelectTrigger className="h-8 w-36 text-xs" aria-label={`Status for ${e.name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>{enquiryStatusLabel(s)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete enquiry from ${e.name}`}
                          onClick={(ev) => { ev.stopPropagation(); setDeleting(e); }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager offset={params.offset} limit={params.limit} total={q.data?.total ?? 0} onChange={params.setOffset} />
          </>
        )}

      {open && (
        <EnquiryDialog
          key={open.id}
          enquiry={open}
          onClose={() => setOpen(null)}
          onStatus={(status) => patch.mutate({ id: open.id, status })}
          onDelete={() => setDeleting(open)}
          onReplied={(row) => { refresh(); setOpen(row); }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        title="Delete this enquiry?"
        description={<>The enquiry from {deleting?.name} will be permanently removed. This cannot be undone.</>}
        busy={del.isPending}
        onConfirm={() => deleting && del.mutate({ id: deleting.id })}
      />
    </div>
  );
}

function EnquiryDialog({
  enquiry, onClose, onStatus, onDelete, onReplied,
}: {
  enquiry: Enquiry;
  onClose: () => void;
  onStatus: (s: (typeof STATUSES)[number]) => void;
  onDelete: () => void;
  onReplied: (row: Enquiry) => void;
}) {
  const [subject, setSubject] = useState(`Re: your enquiry to Unique Care UK`);
  const [message, setMessage] = useState("");
  const reply = trpc.website.enquiries.reply.useMutation({
    onSuccess: (res) => { toast.success(`Reply sent to ${enquiry.email}`); setMessage(""); onReplied(res.enquiry); },
    onError: (e) => toast.error(e.message),
  });

  const sourceHref = enquiry.sourcePage
    ? (enquiry.sourcePage.startsWith("http") ? enquiry.sourcePage : `${WEBSITE_URL}${enquiry.sourcePage.startsWith("/") ? "" : "/"}${enquiry.sourcePage}`)
    : null;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {enquiry.name}
            <Chip value={enquiry.status} label={enquiryStatusLabel(enquiry.status)} />
          </DialogTitle>
          <DialogDescription>Received {fmtDateTime(enquiry.createdAt)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <a className="inline-flex items-center gap-1.5 hover:underline" href={`mailto:${enquiry.email}`}>
              <Mail className="h-3.5 w-3.5" />{enquiry.email}
            </a>
            {enquiry.phone && (
              <a className="inline-flex items-center gap-1.5 hover:underline" href={`tel:${enquiry.phone}`}>
                <Phone className="h-3.5 w-3.5" />{enquiry.phone}
              </a>
            )}
          </div>

          <dl className="grid gap-2 rounded-xl border bg-white/70 p-3 text-xs" style={rowStyle}>
            <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
              <dt className="text-muted-foreground">Subject</dt>
              <dd className="capitalize font-medium text-[--ink-900]">{formatType(enquiry.enquiryType)}</dd>
            </div>
            {enquiry.careType && (
              <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
                <dt className="text-muted-foreground">Care type</dt>
                <dd className="capitalize">{formatType(enquiry.careType)}</dd>
              </div>
            )}
            {sourceHref && (
              <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
                <dt className="text-muted-foreground">Source page</dt>
                <dd>
                  <a className="inline-flex items-center gap-1 text-[--brand-600] hover:underline" href={sourceHref} target="_blank" rel="noreferrer">
                    {enquiry.sourcePage}<ExternalLink className="h-3 w-3" />
                  </a>
                </dd>
              </div>
            )}
          </dl>

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Message</p>
            <p className="whitespace-pre-wrap rounded-xl border bg-white/70 p-3 leading-relaxed" style={rowStyle}>{enquiry.message}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Status</span>
            <Select value={enquiry.status} onValueChange={(s) => onStatus(s as (typeof STATUSES)[number])}>
              <SelectTrigger className="h-8 w-40 text-xs" aria-label="Enquiry status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{enquiryStatusLabel(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <form
            className="space-y-2 border-t pt-3"
            style={rowStyle}
            onSubmit={(e) => { e.preventDefault(); reply.mutate({ id: enquiry.id, subject, message }); }}
          >
            <p className="text-sm font-medium">Reply by email</p>
            <div className="space-y-1.5">
              <Label htmlFor="enq-subject">Subject</Label>
              <Input id="enq-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enq-message">Message</Label>
              <Textarea
                id="enq-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="Write your reply..."
                maxLength={10000}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Sent from the portal mailbox to {enquiry.email}. The enquiry is marked Responded once delivery succeeds.
            </p>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="outline" className="text-red-700" onClick={onDelete}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete
              </Button>
              <Button type="submit" disabled={reply.isPending || !subject.trim() || !message.trim()}>
                {reply.isPending ? "Sending..." : "Send reply"}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
