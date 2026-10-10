import { useMemo, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, fmtDate } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UserX, Table2, LayoutGrid, Download, Layers } from "lucide-react";
import { toast } from "sonner";
import type { RouterOutputs } from "@/lib/router-types";

type PipelineRow = RouterOutputs["hr"]["pipeline"][number];

/** Flatten an answer value for display / CSV. */
function fmtAnswer(v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.map(fmtAnswer).join("; ");
  if (typeof v === "object") {
    // availability grid { mon: ["mornings"], ... } or file ref
    if ("fileName" in (v as object)) return String((v as { fileName: string }).fileName);
    return Object.entries(v as Record<string, string[]>)
      .map(([k, slots]) => `${k}: ${slots.join("+")}`).join("; ");
  }
  return String(v);
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
}

const KANBAN_TINTS = ["#efebfd", "#e8f3fb", "#fdf2df", "#fdeef5", "#e7f7ee", "#e6f7f6", "#edf0f6", "#fdecec"];
const KANBAN_DEEP = ["#6d5bd0", "#2f7fc4", "#b45309", "#c2507f", "#15803d", "#0f766e", "#526078", "#b91c1c"];

const STAGE_GROUPS: { label: string; stages: string[] }[] = [
  { label: "Applied", stages: ["applied", "review"] },
  { label: "Screened in", stages: ["shortlisted", "pre_interview_forms_sent", "pre_interview_forms_complete"] },
  { label: "Interview", stages: ["interview_booked", "interviewed"] },
  { label: "Decision", stages: ["approved", "rejected"] },
  { label: "Compliance", stages: ["compliance_docs_requested", "compliance_docs_complete"] },
  { label: "Offer", stages: ["offer_sent", "offer_accepted"] },
  { label: "Training", stages: ["training_booked", "online_training_in_progress", "dbs_verified", "training_complete"] },
  { label: "Outcome", stages: ["hired", "screened_out", "withdrawn"] },
];

export default function Pipeline() {
  const utils = trpc.useUtils();
  const jobsQ = trpc.hr.jobs.useQuery();
  const [jobId, setJobId] = useState<number | undefined>(undefined);
  const q = trpc.hr.pipeline.useQuery({ jobId });
  const [selected, setSelected] = useState<number[]>([]);
  const [screenOutOpen, setScreenOutOpen] = useState(false);
  const [reason, setReason] = useState("");
  const screen = trpc.hr.runScreening.useMutation({
    onSuccess: (r) => { utils.hr.pipeline.invalidate(); toast.success(`Screened — score ${r.score}`); },
    onError: (e) => toast.error(e.message),
  });
  const bulk = trpc.hr.bulkScreenOut.useMutation({
    onSuccess: (r) => { utils.hr.pipeline.invalidate(); toast.success(`${r.count} candidate(s) screened out`); setScreenOutOpen(false); setSelected([]); setReason(""); },
    onError: (e) => toast.error(e.message),
  });

  const groups = useMemo(() => {
    const apps = q.data ?? [];
    return STAGE_GROUPS.map((g) => ({
      ...g,
      apps: apps.filter((a) => g.stages.includes(a.stage)),
    }));
  }, [q.data]);

  const screenableSelected = (q.data ?? []).filter((a) => selected.includes(Number(a.id)) && a.aiScore !== null && a.aiScore < 60 && a.stage === "applied");

  // ── Table view: any form field as a column, filter by answers, CSV export ──
  const [view, setView] = useState<"board" | "table">("board");
  const [answerFilter, setAnswerFilter] = useState("");
  const allAnswerKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const a of q.data ?? []) {
      for (const k of Object.keys((a.answers as Record<string, unknown> | null) ?? {})) keys.add(k);
    }
    return [...keys].sort();
  }, [q.data]);
  const [columns, setColumns] = useState<string[]>(["years_experience", "right_to_work", "driving_licence"]);
  const shownColumns = columns.filter((c) => allAnswerKeys.includes(c));
  const tableRows = useMemo(() => {
    const apps = (q.data ?? []) as PipelineRow[];
    if (!answerFilter.trim()) return apps;
    const needle = answerFilter.trim().toLowerCase();
    return apps.filter((a) =>
      Object.values((a.answers as Record<string, unknown> | null) ?? {})
        .some((v) => fmtAnswer(v).toLowerCase().includes(needle)));
  }, [q.data, answerFilter]);

  const exportCsv = () => {
    const header = ["Name", "Email", "Phone", "Job", "Stage", "AI score", "Source", "Applied", ...shownColumns];
    const rows = tableRows.map((a) => {
      const ans = (a.answers as Record<string, unknown> | null) ?? {};
      return [
        `${a.candidate?.firstName ?? ""} ${a.candidate?.lastName ?? ""}`.trim(),
        a.candidate?.email ?? "", a.candidate?.phone ?? "",
        a.job?.title ?? "", a.stage, a.aiScore === null ? "" : String(a.aiScore),
        a.sourceChannel ?? "direct", fmtDate(a.createdAt),
        ...shownColumns.map((c) => fmtAnswer(ans[c])),
      ];
    });
    const blob = new Blob(["\uFEFF" + toCsv([header, ...rows])], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `applications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (q.isLoading) return <Loading rows={5} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;

  return (
    <div>
      <PageHeader
        title="Recruitment pipeline"
        subtitle="Every application, by stage. AI scores assist — humans decide."
        actions={
          <>
            <Select value={jobId ? String(jobId) : "all"} onValueChange={(v) => setJobId(v === "all" ? undefined : Number(v))}>
              <SelectTrigger className="w-56"><SelectValue placeholder="All jobs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All jobs</SelectItem>
                {(jobsQ.data ?? []).map((j) => <SelectItem key={j.id} value={String(j.id)}>{j.title}</SelectItem>)}
              </SelectContent>
            </Select>
            {selected.length > 0 && (
              <Button
                variant="destructive" size="sm"
                disabled={screenableSelected.length === 0}
                onClick={() => setScreenOutOpen(true)}
                title={screenableSelected.length === 0 ? "Only applied-stage candidates with an AI score below 60 can be screened out" : undefined}
              >
                <UserX className="h-3.5 w-3.5 mr-1" /> Screen out ({screenableSelected.length})
              </Button>
            )}
            <div className="flex rounded-full border bg-white p-1" style={{ borderColor: "var(--card-line)" }}>
              <button className={`rounded-full px-3 py-1 text-xs flex items-center gap-1 ${view === "board" ? "bg-[--brand-600] text-white" : ""}`}
                onClick={() => setView("board")}><LayoutGrid className="h-3 w-3" /> Board</button>
              <button className={`rounded-full px-3 py-1 text-xs flex items-center gap-1 ${view === "table" ? "bg-[--brand-600] text-white" : ""}`}
                onClick={() => setView("table")}><Table2 className="h-3 w-3" /> Table</button>
            </div>
          </>
        }
      />

      {view === "table" && (
        <div className="mb-4 uc-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="pl-af" className="text-xs whitespace-nowrap">Filter by any answer:</Label>
              <Input id="pl-af" value={answerFilter} onChange={(e) => setAnswerFilter(e.target.value)}
                placeholder="e.g. dementia, yes, 3_5…" className="h-8 w-56 text-xs" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Answer columns:</Label>
              <div className="flex flex-wrap gap-1">
                {allAnswerKeys.map((k) => (
                  <button key={k}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${columns.includes(k) ? "bg-[--brand-600] text-white border-[--brand-600]" : "bg-white"}`}
                    style={columns.includes(k) ? undefined : { borderColor: "var(--card-line)" }}
                    onClick={() => setColumns((c) => c.includes(k) ? c.filter((x) => x !== k) : [...c, k])}
                    aria-pressed={columns.includes(k)}>
                    {k.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV ({tableRows.length})
            </Button>
          </div>
        </div>
      )}

      {view === "table" ? (
        <div className="uc-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b" style={{ borderColor: "var(--line)" }}>
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Job</th>
                <th className="p-3 font-medium">Stage</th>
                <th className="p-3 font-medium">AI</th>
                <th className="p-3 font-medium">Source</th>
                <th className="p-3 font-medium">Applied</th>
                {shownColumns.map((c) => <th key={c} className="p-3 font-medium">{c.replace(/_/g, " ")}</th>)}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((a) => {
                const ans = (a.answers as Record<string, unknown> | null) ?? {};
                return (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-slate-50/60" style={{ borderColor: "var(--line)" }}>
                    <td className="p-3">
                      <Link to={`/recruitment/pipeline/${a.id}`} className="font-medium text-[--brand-700] hover:underline">
                        {a.candidate?.firstName} {a.candidate?.lastName}
                      </Link>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{a.job?.title}</td>
                    <td className="p-3"><Chip value={a.stage} /></td>
                    <td className="p-3 text-xs font-semibold">{a.aiScore ?? "—"}</td>
                    <td className="p-3 text-xs">{a.sourceChannel ?? "direct"}</td>
                    <td className="p-3 text-xs">{fmtDate(a.createdAt)}</td>
                    {shownColumns.map((c) => <td key={c} className="p-3 text-xs max-w-48 truncate" title={fmtAnswer(ans[c])}>{fmtAnswer(ans[c]) || "—"}</td>)}
                  </tr>
                );
              })}
              {tableRows.length === 0 && (
                <tr><td colSpan={6 + shownColumns.length} className="p-8 text-center text-sm text-muted-foreground">No applications match the filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
      <div className="flex gap-3 overflow-x-auto pb-4" data-tour="pipeline-board">
        {groups.map((g, gi) => (
          <div key={g.label} className="w-64 shrink-0 uc-kanban-col" style={{ background: KANBAN_TINTS[gi % KANBAN_TINTS.length] }}>
            <p className="mb-2.5 flex items-center justify-between px-1.5 pt-1 text-[13px] font-semibold" style={{ color: KANBAN_DEEP[gi % KANBAN_DEEP.length] }}>
              {g.label}
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold shadow-sm" style={{ color: KANBAN_DEEP[gi % KANBAN_DEEP.length] }}>{g.apps.length}</span>
            </p>
            <div className="space-y-2">
              {g.apps.map((a) => {
                const checked = selected.includes(Number(a.id));
                const canScreenOut = a.aiScore !== null && a.aiScore < 60 && a.stage === "applied";
                return (
                  <div key={a.id} className="uc-card uc-kanban-card p-3">
                    <div className="flex items-start gap-2">
                      {canScreenOut && (
                        <input
                          type="checkbox" checked={checked} aria-label={`Select ${a.candidate?.firstName}`}
                          onChange={(e) => setSelected((s) => e.target.checked ? [...s, Number(a.id)] : s.filter((x) => x !== Number(a.id)))}
                          className="mt-1 accent-[--brand-600]"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <Link to={`/recruitment/pipeline/${a.id}`} className="uc-focus font-medium text-sm text-[--brand-900] hover:text-[--brand-600] line-clamp-1">
                          {a.candidate?.firstName} {a.candidate?.lastName}
                        </Link>
                        <p className="text-[11px] text-muted-foreground line-clamp-1">{a.job?.title}</p>
                        {a.otherOpenJobs.length > 0 && (
                          <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-[--brand-700] line-clamp-1"
                            title={`Also applying for: ${a.otherOpenJobs.join(", ")}`}>
                            <Layers className="h-3 w-3 shrink-0" aria-hidden />
                            Also applying: {a.otherOpenJobs.join(", ")}
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          <Chip value={a.stage} />
                          {a.aiScore !== null && (
                            <span className={`text-[11px] font-semibold ${a.aiScore >= 85 ? "text-green-700" : a.aiScore >= 60 ? "text-amber-700" : "text-red-700"}`}>
                              AI {a.aiScore}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">{fmtDate(a.createdAt)}</span>
                          {a.stage === "applied" && a.aiScore === null && (
                            <Button
                              size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-[--brand-600]"
                              disabled={screen.isPending}
                              onClick={() => screen.mutate({ applicationId: Number(a.id) })}
                            >
                              Screen
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {g.apps.length === 0 && <div className="rounded-2xl border border-dashed py-6 text-center text-xs" style={{ borderColor: `${KANBAN_DEEP[gi % KANBAN_DEEP.length]}55`, color: `${KANBAN_DEEP[gi % KANBAN_DEEP.length]}99` }}>Empty</div>}
            </div>
          </div>
        ))}
      </div>
      )}

      <Dialog open={screenOutOpen} onOpenChange={setScreenOutOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm screen-out</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            You are screening out {screenableSelected.length} candidate{screenableSelected.length === 1 ? "" : "s"} whose AI score was below 60.
            Candidates are never rejected automatically — this is your decision.
          </p>
          <div className="mt-2">
            <Label htmlFor="so-reason">Reason (recorded on the application)</Label>
            <Input id="so-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Does not meet essential criteria" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScreenOutOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={reason.length < 3 || bulk.isPending}
              onClick={() => bulk.mutate({ applicationIds: screenableSelected.map((a) => Number(a.id)), reason })}>
              Confirm screen-out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
