import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, RotateCcw, Star, Trash2, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, EmptyState, Chip, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import type { RouterOutputs } from "@/lib/router-types";
import { ConfirmDelete, ExportButton, FilterBar, Pager, downloadCsv, useListParams } from "./shared";

type Review = RouterOutputs["website"]["reviews"]["list"]["items"][number];
const STATUSES = ["pending", "approved", "rejected"] as const;

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3.5 w-3.5 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} aria-hidden />
      ))}
    </span>
  );
}

export default function Reviews() {
  const utils = trpc.useUtils();
  const params = useListParams(20);
  const q = trpc.website.reviews.list.useQuery(params.input, { placeholderData: keepPreviousData });
  const [deleting, setDeleting] = useState<Review | null>(null);
  const [exporting, setExporting] = useState(false);

  const refresh = () => { void utils.website.reviews.list.invalidate(); void utils.website.dashboard.invalidate(); };
  const patch = trpc.website.reviews.patch.useMutation({
    onSuccess: (r) => { refresh(); toast.success(r.status === "approved" ? "Review approved and published" : r.status === "rejected" ? "Review rejected" : "Review returned to pending"); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.website.reviews.delete.useMutation({
    onSuccess: () => { refresh(); setDeleting(null); toast.success("Review deleted"); },
    onError: (e) => toast.error(e.message),
  });

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await utils.website.reviews.exportCsv.fetch(params.exportInput);
      downloadCsv(res.filename, res.csv);
      toast.success(`Exported ${res.count} reviews`);
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
        title="Website reviews"
        subtitle="Approve reviews before they appear on the public website."
        actions={<ExportButton busy={exporting} onClick={exportCsv} />}
      />
      <FilterBar params={params} statuses={STATUSES} counts={q.data?.counts} placeholder="Search name, title, review…" />

      {q.isLoading ? <Loading rows={5} />
        : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : items.length === 0 ? <EmptyState title="No reviews" hint="Nothing matches this filter yet." />
        : (
          <>
            <div className="space-y-3">
              {items.map((r) => (
                <div key={r.id} className="uc-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Stars rating={r.rating} />
                        <Chip value={r.status} />
                        <span className="text-xs text-muted-foreground">{fmtDateTime(r.createdAt)}</span>
                      </div>
                      <p className="mt-1.5 font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{r.name} · {r.relationship}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {r.status !== "approved" && (
                        <Button size="sm" disabled={patch.isPending} onClick={() => patch.mutate({ id: r.id, status: "approved" })}>
                          <Check className="mr-1 h-3.5 w-3.5" />Approve
                        </Button>
                      )}
                      {r.status !== "rejected" && (
                        <Button size="sm" variant="outline" disabled={patch.isPending} onClick={() => patch.mutate({ id: r.id, status: "rejected" })}>
                          <X className="mr-1 h-3.5 w-3.5" />Reject
                        </Button>
                      )}
                      {r.status !== "pending" && (
                        <Button size="sm" variant="outline" disabled={patch.isPending} onClick={() => patch.mutate({ id: r.id, status: "pending" })}>
                          <RotateCcw className="mr-1 h-3.5 w-3.5" />Reopen
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" aria-label={`Delete review by ${r.name}`} onClick={() => setDeleting(r)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[--ink-900]">{r.body}</p>
                </div>
              ))}
            </div>
            <Pager offset={params.offset} limit={params.limit} total={q.data?.total ?? 0} onChange={params.setOffset} />
          </>
        )}

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        title="Delete this review?"
        description={<>The review “{deleting?.title}” by {deleting?.name} will be permanently removed{deleting?.status === "approved" ? " and disappear from the public website" : ""}.</>}
        busy={del.isPending}
        onConfirm={() => deleting && del.mutate({ id: deleting.id })}
      />
    </div>
  );
}
