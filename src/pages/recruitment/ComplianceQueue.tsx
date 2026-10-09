import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileCheck2 } from "lucide-react";
import { toast } from "sonner";

export default function ComplianceQueue() {
  const utils = trpc.useUtils();
  const q = trpc.hr2.complianceQueue.useQuery();
  const verify = trpc.hr2.verifyDocument.useMutation({
    onSuccess: () => { utils.hr2.complianceQueue.invalidate(); toast.success("Verified"); },
    onError: (e) => toast.error(e.message),
  });
  const reject = trpc.hr2.rejectDocument.useMutation({
    onSuccess: () => { utils.hr2.complianceQueue.invalidate(); toast.success("Rejected"); },
    onError: (e) => toast.error(e.message),
  });
  const [expiry, setExpiry] = useState<Record<number, string>>({});
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const docs = q.data ?? [];

  return (
    <div>
      <PageHeader title="Compliance queue" subtitle="Documents awaiting verification — candidates and staff" />
      {docs.length === 0 ? (
        <EmptyState icon={FileCheck2} title="Queue clear" hint="Everything uploaded has been verified. Nice work." />
      ) : (
        <div className="uc-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
                <th className="px-4 py-2.5 font-medium">Person</th>
                <th className="px-4 py-2.5 font-medium">Document</th>
                <th className="px-4 py-2.5 font-medium">File</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Received</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{d.ownerName}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">({d.ownerType})</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {d.requirement?.label ?? d.requirementKey.replace(/_/g, " ")}
                    {d.requirement?.required && <span className="ml-1 text-[10px] text-red-700 font-semibold">REQUIRED</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{d.fileName ?? "—"}</td>
                  <td className="px-4 py-2.5"><Chip value={d.status} /></td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDateTime(d.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    {d.status === "uploaded" && (
                      <div className="flex items-center justify-end gap-1.5">
                        <Input type="date" className="h-7 w-32 text-xs" aria-label="Expiry date"
                          value={expiry[Number(d.id)] ?? ""}
                          onChange={(e) => setExpiry((s) => ({ ...s, [Number(d.id)]: e.target.value }))} />
                        <Button size="sm" className="h-7" disabled={verify.isPending}
                          onClick={() => verify.mutate({ id: Number(d.id), expiresAt: expiry[Number(d.id)] || undefined })}>
                          Verify
                        </Button>
                        <Button size="sm" variant="outline" className="h-7" onClick={() => setRejectId(Number(d.id))}>Reject</Button>
                      </div>
                    )}
                    {d.status !== "uploaded" && d.status === "rejected" && d.rejectionReason && (
                      <span className="block text-right text-xs text-red-700">{d.rejectionReason}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={rejectId !== null} onOpenChange={(o) => !o && setRejectId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject document</DialogTitle></DialogHeader>
          <Label htmlFor="q-rej">Reason</Label>
          <Input id="q-rej" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={reason.length < 3 || reject.isPending}
              onClick={() => { reject.mutate({ id: rejectId!, reason }); setRejectId(null); setReason(""); }}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Verifying the final required document for a candidate automatically completes compliance and generates their offer letter.
      </p>
    </div>
  );
}
