import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/** Search + status-tab + paging state shared by every website list page. */
export function useListParams(limit = 25) {
  const [status, setStatusState] = useState("all");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput.trim()); setOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  return {
    status, qInput, setQInput, offset, setOffset, limit,
    setStatus: (s: string) => { setStatusState(s); setOffset(0); },
    input: { status: status === "all" ? undefined : status, q: q || undefined, limit, offset },
    exportInput: { status: status === "all" ? undefined : status, q: q || undefined },
  };
}

export type ListParams = ReturnType<typeof useListParams>;

export function FilterBar({
  params, statuses, counts, placeholder = "Search…", actions,
}: {
  params: ListParams;
  statuses: readonly string[];
  counts?: Record<string, number>;
  placeholder?: string;
  actions?: ReactNode;
}) {
  const tabs = ["all", ...statuses];
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter by status">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={params.status === t}
            onClick={() => params.setStatus(t)}
            className={cn(
              "uc-focus rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
              params.status === t
                ? "border-[--brand-500] bg-[--brand-50] text-[--brand-900]"
                : "border-[--card-line] bg-white text-[--ink-500] hover:text-[--brand-900]",
            )}
          >
            {t}
            {counts && <span className="ml-1.5 tabular-nums text-muted-foreground">{counts[t] ?? 0}</span>}
          </button>
        ))}
      </div>
      <div className="relative ml-auto w-full sm:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={params.qInput}
          onChange={(e) => params.setQInput(e.target.value)}
          placeholder={placeholder}
          aria-label="Search"
          className="h-9 pl-8 text-sm"
        />
      </div>
      {actions}
    </div>
  );
}

export function Pager({
  offset, limit, total, onChange,
}: { offset: number; limit: number; total: number; onChange: (offset: number) => void }) {
  if (total <= limit) return <p className="mt-3 text-xs text-muted-foreground">{total} {total === 1 ? "item" : "items"}</p>;
  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
      <span>{from}–{to} of {total}</span>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))} aria-label="Previous page">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)} aria-label="Next page">
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ConfirmDelete({
  open, onOpenChange, title, description, confirmLabel = "Delete", busy, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {busy ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportButton({ busy, onClick }: { busy?: boolean; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={busy}>
      <Download className="mr-1.5 h-3.5 w-3.5" /> {busy ? "Exporting…" : "Export CSV"}
    </Button>
  );
}

export const thClass = "px-4 py-2.5 font-medium";
export const rowStyle = { borderColor: "var(--line)" } as const;
