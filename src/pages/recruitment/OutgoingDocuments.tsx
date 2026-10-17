import { useMemo, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileOutput, Search } from "lucide-react";
import { toast } from "sonner";

const KINDS = [
  { value: "all", label: "All types" },
  { value: "offer_letter", label: "Offer letters" },
  { value: "training_certificate", label: "Training certificates" },
  { value: "training_outcome", label: "Training outcome letters" },
] as const;

export default function OutgoingDocuments() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const listQ = trpc.hr2.outgoingDocuments.useQuery({
    q: q.trim() || undefined,
    kind: kind === "all" ? undefined : kind as "offer_letter" | "training_certificate" | "training_outcome",
    from: from || undefined,
    to: to || undefined,
  });

  const download = trpc.hr2.outgoingDocumentUrl.useMutation({
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (e) => toast.error(e.message),
  });

  const rows = listQ.data ?? [];
  const counts = useMemo(() => {
    const all = listQ.data ?? [];
    return {
      offer: all.filter((r) => r.kind === "offer_letter").length,
      cert: all.filter((r) => r.kind === "training_certificate").length,
      outcome: all.filter((r) => r.kind === "training_outcome").length,
    };
  }, [listQ.data]);

  if (listQ.isLoading) return <Loading rows={6} />;
  if (listQ.error) {
    return <ErrorState message={listQ.error.message} onRetry={() => listQ.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outgoing documents"
        subtitle="Offer letters, certificates and outcome letters we issued — separate from candidate uploads"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-lg border bg-white px-3 py-1.5" style={{ borderColor: "var(--line)" }}>
          {rows.length} shown
        </span>
        <span className="text-muted-foreground self-center">
          {counts.offer} offers · {counts.cert} certificates · {counts.outcome} outcomes
        </span>
      </div>

      <div className="uc-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="od-q">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input id="od-q" className="pl-8" placeholder="Name, title, file…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Type</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="od-from">From</Label>
            <Input id="od-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="od-to">To</Label>
            <Input id="od-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileOutput}
          title="No outgoing documents yet"
          hint="Offer letters and training certificates appear here when they are issued to candidates."
        />
      ) : (
        <div className="uc-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
                <th className="px-4 py-2.5 font-medium">Document</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Candidate</th>
                <th className="px-4 py-2.5 font-medium">Issued</th>
                <th className="px-4 py-2.5 font-medium">By</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-[--brand-900]">{r.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate max-w-xs">{r.fileName}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <Chip
                      value={r.kind === "offer_letter" ? "offer_sent" : r.kind === "training_certificate" ? "available" : "rejected"}
                      label={r.kindLabel}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    {r.applicationId && r.candidateName ? (
                      <Link to={`/recruitment/pipeline/${r.applicationId}`} className="font-medium text-[--brand-700] hover:underline">
                        {r.candidateName}
                      </Link>
                    ) : (r.candidateName ?? "—")}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDateTime(r.issuedAt)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.issuedBy ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button size="sm" variant="outline" className="h-7" disabled={download.isPending}
                      onClick={() => download.mutate({ id: Number(r.id) })}>
                      <Download className="h-3.5 w-3.5 mr-1" /> Download
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
