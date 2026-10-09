import { useRef, useState } from "react";
import { useParams, Link } from "react-router";
import { trpc } from "@/providers/trpc";
import type { RouterOutputs } from "@/lib/router-types";
import { PageHeader, Chip, Loading, ErrorState, fmtDateTime, AvatarDot, AiError } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Eye, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["new", "open", "in_progress", "waiting_on_customer", "waiting_on_internal", "escalated", "resolved", "closed", "reopened"];

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const ticketId = Number(id);
  const utils = trpc.useUtils();
  const q = trpc.crm.ticketDetail.useQuery({ id: ticketId });
  const inv = () => { utils.crm.ticketDetail.invalidate({ id: ticketId }); utils.crm.tickets.invalidate(); };

  const [resolveOpen, setResolveOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);

  const update = trpc.crm.updateTicket.useMutation({
    onSuccess: () => { inv(); toast.success("Ticket updated"); },
    onError: (e) => toast.error(e.message),
  });
  const follow = trpc.crm.followTicket.useMutation({
    onSuccess: () => { inv(); toast.success("You're now following this ticket"); },
  });

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const t = d.ticket;

  return (
    <div className="space-y-4">
      <Link to="/crm/tickets" className="inline-flex items-center gap-1 text-sm text-[--brand-600] hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Tickets
      </Link>
      <PageHeader
        title={t.subject}
        subtitle={`${t.ticketNo} · created ${fmtDateTime(t.createdAt)} via ${t.channel.replace(/_/g, " ")}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Chip value={t.priority} />
            <Chip value={t.status} />
            {t.category === "safeguarding_concern" && <Chip value="escalated" label="safeguarding — restricted" />}
            <Button size="sm" variant="ghost" onClick={() => follow.mutate({ ticketId })}>
              <Eye className="h-3.5 w-3.5 mr-1" /> Follow
            </Button>
            {!["resolved", "closed"].includes(t.status) && (
              <>
                <Button size="sm" variant="outline" onClick={() => setEscalateOpen(true)}>
                  <ArrowUpRight className="h-3.5 w-3.5 mr-1" /> Escalate
                </Button>
                <Button size="sm" onClick={() => setResolveOpen(true)}>Resolve</Button>
              </>
            )}
            {t.status === "resolved" && (
              <Button size="sm" variant="outline" onClick={() => update.mutate({ id: ticketId, status: "closed" })}>Close</Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          {t.description && (
            <section className="uc-card p-5">
              <h2 className="uc-label mb-2">Description</h2>
              <p className="text-sm whitespace-pre-wrap">{t.description}</p>
            </section>
          )}

          {t.resolutionSummary && (
            <section className="uc-card p-5 border-l-4 border-l-green-500">
              <h2 className="uc-label mb-2 text-green-800">Resolution</h2>
              <p className="text-sm whitespace-pre-wrap">{t.resolutionSummary}</p>
              {t.resolutionCode && <p className="mt-1 text-xs text-muted-foreground">Code: {t.resolutionCode}</p>}
            </section>
          )}

          <Comments ticketId={ticketId} comments={d.comments} allStaff={d.allStaff} onDone={inv} />

          <section className="uc-card p-5">
            <h2 className="uc-label mb-2">Activity</h2>
            <ol className="relative border-l pl-4 space-y-2.5" style={{ borderColor: "var(--line)" }}>
              {d.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-[--brand-400]" aria-hidden />
                  <p className="text-xs">
                    <span className="font-medium">{e.actorName ?? "System"}</span>{" "}
                    <span className="text-muted-foreground">
                      {e.event.replace(/_/g, " ")}{e.fromValue ? ` (${e.fromValue} → ${e.toValue})` : ""}
                      {" · "}{fmtDateTime(e.at)}
                    </span>
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="uc-card p-4">
            <h2 className="uc-label mb-2">Details</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-xs text-muted-foreground">Requester</dt>
                <dd className="text-right text-xs">
                  {d.requester ? (
                    <Link to={`/crm/contacts/${d.requester.id}`} className="text-[--brand-600] hover:underline">
                      {d.requester.firstName} {d.requester.lastName}
                    </Link>
                  ) : "—"}
                </dd>
              </div>
              {d.client && (
                <div className="flex justify-between gap-2">
                  <dt className="text-xs text-muted-foreground">Client</dt>
                  <dd className="text-xs"><Link to={`/clients/${d.client.id}`} className="text-[--brand-600] hover:underline">{d.client.firstName} {d.client.lastName}</Link></dd>
                </div>
              )}
              <div className="flex justify-between gap-2 items-center">
                <dt className="text-xs text-muted-foreground">Assignee</dt>
                <dd>
                  <Select
                    value={d.assignee ? String(d.assignee.id) : "none"}
                    onValueChange={(v) => update.mutate({ id: ticketId, assigneeId: v === "none" ? null : Number(v) })}
                  >
                    <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {d.allStaff.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.fullName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </dd>
              </div>
              <div className="flex justify-between gap-2 items-center">
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd>
                  <Select value={t.status} onValueChange={(v) => {
                    if (v === "resolved") { setResolveOpen(true); return; }
                    update.mutate({ id: ticketId, status: v as never });
                  }}>
                    <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-xs text-muted-foreground">Team</dt>
                <dd className="text-xs">{d.team?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-xs text-muted-foreground">Escalation</dt>
                <dd className="text-xs">Level {t.escalationLevel ?? 0}</dd>
              </div>
            </dl>
          </section>

          <section className="uc-card p-4">
            <h2 className="uc-label mb-2">SLA</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-xs text-muted-foreground">First response due</dt>
                <dd className={`text-xs ${t.firstResponseDueAt && !t.firstRespondedAt && new Date(t.firstResponseDueAt) < new Date() ? "text-red-700 font-semibold" : ""}`}>
                  {t.firstResponseDueAt ? fmtDateTime(t.firstResponseDueAt) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-xs text-muted-foreground">Resolution due</dt>
                <dd className={`text-xs ${t.dueAt && !t.resolvedAt && new Date(t.dueAt) < new Date() ? "text-red-700 font-semibold" : ""}`}>
                  {t.dueAt ? fmtDateTime(t.dueAt) : "—"}
                </dd>
              </div>
              {t.firstRespondedAt && (
                <div className="flex justify-between gap-2">
                  <dt className="text-xs text-muted-foreground">First responded</dt>
                  <dd className="text-xs">{fmtDateTime(t.firstRespondedAt)}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="uc-card p-4">
            <h2 className="uc-label mb-2">Watchers</h2>
            {d.watchers.length === 0 ? <p className="text-xs text-muted-foreground">Nobody watching.</p> : (
              <ul className="space-y-1.5">
                {d.watchers.map((w) => (
                  <li key={w.id} className="flex items-center gap-2 text-xs">
                    <AvatarDot name={w.staff?.fullName ?? "?"} />
                    {w.staff?.fullName}
                    <span className="text-muted-foreground">({w.reason.replace(/_/g, " ")})</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <ResolveDialog open={resolveOpen} onClose={() => setResolveOpen(false)}
        onConfirm={(summary, code) => { update.mutate({ id: ticketId, status: "resolved", resolutionSummary: summary, resolutionCode: code || undefined }); setResolveOpen(false); }} />
      <EscalateDialog open={escalateOpen} onClose={() => setEscalateOpen(false)} allStaff={d.allStaff}
        ticketId={ticketId} onDone={inv} />
    </div>
  );
}

function Comments({ ticketId, comments, allStaff, onDone }: {
  ticketId: number;
  comments: NonNullable<RouterOutputs["crm"]["ticketDetail"]>["comments"];
  allStaff: { id: number | bigint; fullName: string; role: string }[];
  onDone: () => void;
}) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"internal" | "public">("internal");
  const [mentioned, setMentioned] = useState<number[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const draft = trpc.crm.draftReply.useMutation({
    onSuccess: (r) => { setBody(r.draft); setVisibility("public"); toast.success("AI draft inserted — edit before sending"); },
  });
  const add = trpc.crm.addComment.useMutation({
    onSuccess: () => { setBody(""); setMentioned([]); onDone(); toast.success("Comment added"); },
    onError: (e) => toast.error(e.message),
  });

  const insertMention = (id: number, name: string) => {
    setMentioned((m) => (m.includes(id) ? m : [...m, id]));
    setBody((b) => `${b}@${name.split(" ")[0]} `);
    setMentionOpen(false);
    taRef.current?.focus();
  };

  return (
    <section className="uc-card p-5" aria-label="Comments">
      <div className="flex items-center justify-between mb-3">
        <h2 className="uc-label">Conversation</h2>
        <Button size="sm" variant="outline" disabled={draft.isPending} onClick={() => draft.mutate({ ticketId })}>
          {draft.isPending ? "Drafting…" : "Draft reply with AI"}
        </Button>
      </div>
      {draft.error && <div className="mb-3"><AiError error={draft.error} onRetry={() => draft.mutate({ ticketId })} /></div>}

      <div className="space-y-3 mb-4">
        {comments.map((c) => (
          <div key={c.id} className={`rounded-lg border p-3 ${c.visibility === "internal" ? "bg-amber-50/50 border-amber-200" : "bg-[--brand-50] border-[--line]"}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{c.authorName}</span>
              <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
                {c.visibility === "internal" ? "Internal note" : "Public reply"}
                {fmtDateTime(c.createdAt)}
              </span>
            </div>
            <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}
        {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      </div>

      <div className="relative">
        <Textarea
          ref={taRef}
          rows={3}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            const m = e.target.value.match(/@(\w*)$/);
            if (m) { setMentionOpen(true); setMentionFilter(m[1]); } else setMentionOpen(false);
          }}
          placeholder="Write a comment… type @ to mention a colleague"
          aria-label="Comment"
        />
        {mentionOpen && (
          <div className="absolute bottom-full mb-1 left-0 w-64 rounded-lg border bg-white shadow-lg z-10 max-h-44 overflow-y-auto" style={{ borderColor: "var(--line)" }}>
            {allStaff.filter((s) => s.fullName.toLowerCase().includes(mentionFilter.toLowerCase())).slice(0, 8).map((s) => (
              <button key={s.id} type="button" onClick={() => insertMention(Number(s.id), s.fullName)}
                className="uc-focus flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[--brand-50]">
                <AvatarDot name={s.fullName} /> {s.fullName}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={visibility} onValueChange={(v) => setVisibility(v as never)}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="internal">Internal note</SelectItem>
              <SelectItem value="public">Public reply (email)</SelectItem>
            </SelectContent>
          </Select>
          {mentioned.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              Mentioning: {mentioned.map((id) => allStaff.find((s) => Number(s.id) === id)?.fullName.split(" ")[0]).join(", ")}
            </span>
          )}
        </div>
        <Button size="sm" disabled={!body.trim() || add.isPending}
          onClick={() => add.mutate({ ticketId, body, visibility, mentionedStaffIds: mentioned })}>
          Post
        </Button>
      </div>
      {visibility === "public" && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Public replies are emailed to the requester. A reply to a resolved ticket within 7 days automatically re-opens it.
        </p>
      )}
    </section>
  );
}

function ResolveDialog({ open, onClose, onConfirm }: {
  open: boolean; onClose: () => void; onConfirm: (summary: string, code: string) => void;
}) {
  const [summary, setSummary] = useState("");
  const [code, setCode] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Resolve ticket</DialogTitle></DialogHeader>
        <Label htmlFor="res-sum">Resolution summary (required)</Label>
        <Textarea id="res-sum" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)}
          placeholder="What was done to resolve this?" />
        <Label htmlFor="res-code" className="mt-2">Resolution code (optional)</Label>
        <Select value={code} onValueChange={setCode}>
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            {["resolved_by_phone", "visit_completed", "rota_amended", "refund_issued", "apology_given", "no_action_needed", "referred_to_safeguarding"].map((c) => (
              <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={summary.length < 5} onClick={() => { onConfirm(summary, code); setSummary(""); setCode(""); }}>
            Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EscalateDialog({ open, onClose, allStaff, ticketId, onDone }: {
  open: boolean; onClose: () => void;
  allStaff: { id: number | bigint; fullName: string; role: string }[];
  ticketId: number; onDone: () => void;
}) {
  const [toStaff, setToStaff] = useState("");
  const [reason, setReason] = useState("");
  const escalate = trpc.crm.escalateTicket.useMutation({
    onSuccess: () => { toast.success("Escalated"); onDone(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Escalate ticket</DialogTitle></DialogHeader>
        <Label>Escalate to</Label>
        <Select value={toStaff} onValueChange={setToStaff}>
          <SelectTrigger><SelectValue placeholder="Select staff member…" /></SelectTrigger>
          <SelectContent className="max-h-56">
            {allStaff.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.fullName} — {s.role.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Label htmlFor="esc-r" className="mt-2">Reason (required)</Label>
        <Textarea id="esc-r" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!toStaff || reason.length < 5 || escalate.isPending}
            onClick={() => escalate.mutate({ id: ticketId, toStaffId: Number(toStaff), reason })}>
            Escalate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
