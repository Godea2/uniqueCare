import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, EmptyState, Chip, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import type { RouterOutputs } from "@/lib/router-types";
import {
  ConfirmDelete, ExportButton, FilterBar, Pager, downloadCsv, rowStyle, thClass, useListParams,
} from "./shared";

type Subscriber = RouterOutputs["website"]["subscribers"]["list"]["items"][number];
const STATUSES = ["active", "unsubscribed"] as const;

export default function Subscribers() {
  const utils = trpc.useUtils();
  const params = useListParams(50);
  const q = trpc.website.subscribers.list.useQuery(params.input, { placeholderData: keepPreviousData });
  const [deleting, setDeleting] = useState<Subscriber | null>(null);
  const [exporting, setExporting] = useState(false);

  const refresh = () => { void utils.website.subscribers.list.invalidate(); void utils.website.dashboard.invalidate(); };
  const patch = trpc.website.subscribers.patch.useMutation({
    onSuccess: (s) => { refresh(); toast.success(s.status === "active" ? "Subscriber re-activated" : "Subscriber unsubscribed"); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.website.subscribers.delete.useMutation({
    onSuccess: () => { refresh(); setDeleting(null); toast.success("Subscriber deleted"); },
    onError: (e) => toast.error(e.message),
  });

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await utils.website.subscribers.exportCsv.fetch(params.exportInput);
      downloadCsv(res.filename, res.csv);
      toast.success(`Exported ${res.count} subscribers`);
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
        title="Newsletter subscribers"
        subtitle="People who signed up for updates on the public website."
        actions={<ExportButton busy={exporting} onClick={exportCsv} />}
      />
      <FilterBar params={params} statuses={STATUSES} counts={q.data?.counts} placeholder="Search email…" />

      {q.isLoading ? <Loading rows={6} />
        : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : items.length === 0 ? <EmptyState title="No subscribers" hint="Nothing matches this filter yet." />
        : (
          <>
            <div className="uc-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground" style={rowStyle}>
                    <th className={thClass}>Email</th>
                    <th className={thClass}>Subscribed</th>
                    <th className={thClass}>Status</th>
                    <th className={`${thClass} text-right`}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s.id} className="border-b last:border-0" style={rowStyle}>
                      <td className="px-4 py-2 font-medium">{s.email}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDateTime(s.createdAt)}</td>
                      <td className="px-4 py-2"><Chip value={s.status} /></td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm" variant="outline" disabled={patch.isPending}
                            onClick={() => patch.mutate({ id: s.id, status: s.status === "active" ? "unsubscribed" : "active" })}
                          >
                            {s.status === "active" ? "Unsubscribe" : "Re-activate"}
                          </Button>
                          <Button size="sm" variant="ghost" aria-label={`Delete ${s.email}`} onClick={() => setDeleting(s)}>
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

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        title="Delete this subscriber?"
        description={<>{deleting?.email} will be permanently removed from the mailing list. Use “Unsubscribe” instead to keep a record.</>}
        busy={del.isPending}
        onConfirm={() => deleting && del.mutate({ id: deleting.id })}
      />
    </div>
  );
}
