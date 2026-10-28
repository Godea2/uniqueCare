import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, EmptyState, Chip, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { RouterOutputs } from "@/lib/router-types";
import {
  ConfirmDelete, ExportButton, FilterBar, Pager, downloadCsv, rowStyle, thClass, useListParams,
} from "./shared";

type Application = RouterOutputs["website"]["applications"]["list"]["items"][number];
const STATUSES = ["new", "reviewing", "shortlisted", "rejected"] as const;

export default function Applications() {
  const utils = trpc.useUtils();
  const params = useListParams();
  const q = trpc.website.applications.list.useQuery(params.input, { placeholderData: keepPreviousData });
  const [open, setOpen] = useState<Application | null>(null);
  const [deleting, setDeleting] = useState<Application | null>(null);
  const [exporting, setExporting] = useState(false);

  const refresh = () => { void utils.website.applications.list.invalidate(); void utils.website.dashboard.invalidate(); };
  const patch = trpc.website.applications.patch.useMutation({
    onSuccess: (row) => { refresh(); setOpen((o) => (o && o.id === row.id ? row : o)); toast.success("Application updated"); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.website.applications.delete.useMutation({
    onSuccess: () => { refresh(); setDeleting(null); setOpen(null); toast.success("Application deleted"); },
    onError: (e) => toast.error(e.message),
  });

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await utils.website.applications.exportCsv.fetch(params.exportInput);
      downloadCsv(res.filename, res.csv);
      toast.success(`Exported ${res.count} applications`);
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
        title="Website applications"
        subtitle="Quick applications submitted on the public website. Formal job applications are handled in Recruitment → Pipeline."
        actions={<ExportButton busy={exporting} onClick={exportCsv} />}
      />
      <FilterBar params={params} statuses={STATUSES} counts={q.data?.counts} placeholder="Search name, email, job…" />

      {q.isLoading ? <Loading rows={6} />
        : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : items.length === 0 ? <EmptyState title="No applications" hint="Nothing matches this filter yet." />
        : (
          <>
            <div className="uc-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground" style={rowStyle}>
                    <th className={thClass}>Received</th>
                    <th className={thClass}>Applicant</th>
                    <th className={thClass}>Role</th>
                    <th className={thClass}>Checks</th>
                    <th className={thClass}>Status</th>
                    <th className={`${thClass} text-right`}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id} className="cursor-pointer border-b last:border-0 hover:bg-[--brand-50]/50" style={rowStyle} onClick={() => setOpen(a)}>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDateTime(a.createdAt)}</td>
                      <td className="px-4 py-2">
                        <p className="font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.email}{a.phone ? ` · ${a.phone}` : ""}</p>
                      </td>
                      <td className="px-4 py-2 text-xs">{a.jobTitle}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        Right to work: {a.rightToWork ? "Yes" : "No"}<br />Driving licence: {a.drivingLicence ? "Yes" : "No"}
                      </td>
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        <Select value={a.status} onValueChange={(status) => patch.mutate({ id: a.id, status: status as (typeof STATUSES)[number] })}>
                          <SelectTrigger className="h-8 w-36 text-xs" aria-label={`Status for ${a.name}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" variant="ghost" aria-label={`Delete application from ${a.name}`} onClick={(ev) => { ev.stopPropagation(); setDeleting(a); }}>
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

      <Dialog open={!!open} onOpenChange={(v) => { if (!v) setOpen(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">{open.name} <Chip value={open.status} /></DialogTitle>
                <DialogDescription>{open.jobTitle} · received {fmtDateTime(open.createdAt)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  <a className="hover:underline" href={`mailto:${open.email}`}>{open.email}</a>
                  {open.phone && <> · <a className="hover:underline" href={`tel:${open.phone}`}>{open.phone}</a></>}
                  <br />Right to work: {open.rightToWork ? "Yes" : "No"} · Driving licence: {open.drivingLicence ? "Yes" : "No"}
                </p>
                <p className="whitespace-pre-wrap rounded-xl border bg-white/70 p-3 leading-relaxed" style={rowStyle}>
                  {open.coverLetter || "No cover letter provided."}
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        title="Delete this application?"
        description={<>The application from {deleting?.name} will be permanently removed. This cannot be undone.</>}
        busy={del.isPending}
        onConfirm={() => deleting && del.mutate({ id: deleting.id })}
      />
    </div>
  );
}
