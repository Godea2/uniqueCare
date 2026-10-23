import { useMemo, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import type { RouterOutputs } from "@/lib/router-types";
import { PageHeader, Loading, ErrorState, RagDot, AvatarDot, fmtDate } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

type Matrix = NonNullable<RouterOutputs["hr2"]["complianceMatrix"]>;
type Requirement = Matrix["requirements"][number];
type RenewableDoc = NonNullable<RouterOutputs["cqc"]["renewableStaffDocuments"]>[number];

const OFFICE_ROLES = ["super_admin", "admin", "care_coordinator"];

type Bucket = "all" | "valid" | "expiring" | "expired";

export default function ComplianceMatrix() {
  const q = trpc.hr2.complianceMatrix.useQuery();

  if (q.isLoading) return <Loading rows={8} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  return <MatrixView data={q.data!} />;
}

function MatrixView({ data }: { data: Matrix }) {
  const utils = trpc.useUtils();
  const meQ = trpc.core.me.useQuery();
  const office = OFFICE_ROLES.includes(meQ.data?.role ?? "");
  const renewableQ = trpc.cqc.renewableStaffDocuments.useQuery(undefined, { enabled: office });

  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState("all");
  const [bucket, setBucket] = useState<Bucket>("all");
  const [renewTarget, setRenewTarget] = useState<{
    staffName: string; requirement: Requirement; doc: RenewableDoc;
  } | null>(null);

  const renewableByStaffKey = useMemo(() => {
    const m = new Map<string, RenewableDoc>();
    for (const d of renewableQ.data ?? []) m.set(`${d.ownerId}:${d.requirementKey}`, d);
    return m;
  }, [renewableQ.data]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (term && !row.staff.fullName.toLowerCase().includes(term)) return false;
      const cells = docType === "all"
        ? [...row.docs.map((c) => c.rag), ...row.training.map((c) => c.rag)]
        : row.docs.filter((c) => c.key === docType).map((c) => c.rag);
      const rowBucket: "valid" | "expiring" | "expired" =
        cells.some((r) => r === "red") ? "expired"
        : cells.some((r) => r === "amber") ? "expiring"
        : "valid";
      return bucket === "all" || rowBucket === bucket;
    });
  }, [data.rows, search, docType, bucket]);

  const renew = trpc.cqc.renewStaffDocument.useMutation({
    onSuccess: () => {
      utils.hr2.complianceMatrix.invalidate();
      utils.cqc.renewableStaffDocuments.invalidate();
      utils.hr2.expiryDashboard.invalidate();
      setRenewTarget(null);
      toast.success("Document renewed");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Compliance matrix"
        subtitle="RAG status per staff member — red = missing/expired, amber = expires within 30 days"
      />
      <div className="uc-card p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <Label htmlFor="cm-search">Search staff</Label>
          <Input id="cm-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type a name…" />
        </div>
        <div className="w-52">
          <Label>Document type</Label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All documents</SelectItem>
              {data.requirements.map((r) => (
                <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-52">
          <Label>Status</Label>
          <Select value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="valid">Valid</SelectItem>
              <SelectItem value="expiring">Expiring ≤ 30 days</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground pb-2">{rows.length} of {data.rows.length} staff</span>
      </div>
      <div className="uc-card overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
              <th className="px-3 py-2.5 font-medium sticky left-0 bg-white min-w-44">Staff member</th>
              {data.requirements.map((r) => (
                <th key={r.key} className="px-3 py-2.5 font-medium whitespace-nowrap">{r.label}</th>
              ))}
              {data.courses.map((c) => (
                <th key={c.id} className="px-3 py-2.5 font-medium whitespace-nowrap">{c.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.staff.id} className="border-b last:border-0 hover:bg-[--brand-50]/60" style={{ borderColor: "var(--line)" }}>
                <td className="px-3 py-2 sticky left-0 bg-white">
                  <Link to={`/staff/${row.staff.id}`} className="uc-focus flex items-center gap-2 hover:text-[--brand-700]">
                    <AvatarDot name={row.staff.fullName} color={row.staff.avatarColor} />
                    <span className="text-[13px] font-medium whitespace-nowrap">{row.staff.fullName}</span>
                  </Link>
                </td>
                {row.docs.map((cell) => {
                  const doc = renewableByStaffKey.get(`${row.staff.id}:${cell.key}`);
                  const canRenew = office && !!doc && (cell.rag === "amber" || cell.rag === "red");
                  return (
                    <td key={cell.key} className="px-3 py-2 align-top">
                      <span className="flex items-center gap-1.5" title={`${cell.status}${cell.expiresAt ? ` — expires ${fmtDate(cell.expiresAt)}` : ""}`}>
                        <RagDot rag={cell.rag as "green" | "amber" | "red"} />
                        {cell.expiresAt && <span className="text-[10px] text-muted-foreground">{fmtDate(cell.expiresAt)}</span>}
                      </span>
                      {canRenew && doc && (
                        <Button size="sm" variant="outline" className="h-6 mt-1 px-2 text-[11px]"
                          onClick={() => setRenewTarget({
                            staffName: row.staff.fullName,
                            requirement: data.requirements.find((r) => r.key === cell.key)!,
                            doc,
                          })}>
                          Renew
                        </Button>
                      )}
                    </td>
                  );
                })}
                {row.training.map((cell) => (
                  <td key={cell.courseId} className="px-3 py-2">
                    <span className="flex items-center gap-1.5" title={cell.status}>
                      <RagDot rag={cell.rag as "green" | "amber" | "red"} />
                      {cell.expiresAt && <span className="text-[10px] text-muted-foreground">{fmtDate(cell.expiresAt)}</span>}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={1 + data.requirements.length + data.courses.length} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No staff match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><RagDot rag="green" /> In date</span>
        <span className="flex items-center gap-1.5"><RagDot rag="amber" /> Expiring within 30 days</span>
        <span className="flex items-center gap-1.5"><RagDot rag="red" /> Missing or expired</span>
      </div>
      {renewTarget && (
        <RenewDialog
          target={renewTarget}
          pending={renew.isPending}
          onClose={() => setRenewTarget(null)}
          onSave={(input) => renew.mutate(input)}
        />
      )}
    </div>
  );
}

function RenewDialog({ target, pending, onClose, onSave }: {
  target: { staffName: string; requirement: Requirement; doc: RenewableDoc };
  pending: boolean;
  onClose: () => void;
  onSave: (input: { documentId: number; newExpiresAt: string; fileName?: string; textValue?: string }) => void;
}) {
  const { requirement, doc, staffName } = target;
  const defaultExpiry = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  const [expiry, setExpiry] = useState(doc.expiresAt && doc.expiresAt >= new Date().toISOString().slice(0, 10)
    ? doc.expiresAt : defaultExpiry);
  const [fileName, setFileName] = useState(doc.fileName ?? "");
  const [textValue, setTextValue] = useState(doc.textValue ?? "");
  const capture = (requirement as { capture?: string }).capture ?? "upload";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Renew {requirement.label} — {staffName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {doc.expiresAt && (
            <p className="text-xs text-muted-foreground">
              Current expiry: {fmtDate(doc.expiresAt)} · status: {doc.status}
            </p>
          )}
          <div>
            <Label htmlFor="rn-expiry">New expiry date</Label>
            <Input id="rn-expiry" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </div>
          {capture === "text" ? (
            <div>
              <Label htmlFor="rn-text">{requirement.label} value</Label>
              <Input id="rn-text" value={textValue} onChange={(e) => setTextValue(e.target.value)}
                placeholder="e.g. share code / reference number (leave blank to keep current)" />
            </div>
          ) : (
            <div>
              <Label htmlFor="rn-file">Replacement file name</Label>
              <Input id="rn-file" value={fileName} onChange={(e) => setFileName(e.target.value)}
                placeholder="Leave blank to keep the current file" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || !expiry}
            onClick={() => onSave({
              documentId: doc.id, newExpiresAt: expiry,
              ...(capture === "text"
                ? (textValue.trim() ? { textValue: textValue.trim() } : {})
                : (fileName.trim() ? { fileName: fileName.trim() } : {})),
            })}>
            {pending ? "Saving…" : "Renew document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
