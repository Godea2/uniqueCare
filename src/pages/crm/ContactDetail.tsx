import { useState } from "react";
import { useParams, Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, fmtDateTime, AiError } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, PhoneCall, Sparkles, Mail, Phone, MessageSquare, FileText, StickyNote } from "lucide-react";
import { toast } from "sonner";

const TYPE_ICONS: Record<string, React.ElementType> = {
  inbound_call: PhoneCall, outbound_call: PhoneCall, missed_call: PhoneCall, voicemail: Phone,
  email_in: Mail, email_out: Mail, sms_in: MessageSquare, sms_out: MessageSquare,
  meeting: Phone, note: StickyNote, letter: FileText, web_form: FileText,
};

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const contactId = Number(id);
  const utils = trpc.useUtils();
  const q = trpc.crm.contactDetail.useQuery({ id: contactId });
  const inv = () => utils.crm.contactDetail.invalidate({ id: contactId });
  const [logOpen, setLogOpen] = useState(false);
  const summarise = trpc.crm.summariseContact.useMutation();

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const c = d.contact;

  return (
    <div className="space-y-5">
      <Link to="/crm/contacts" className="inline-flex items-center gap-1 text-sm text-[--brand-600] hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Contacts
      </Link>
      <PageHeader
        title={`${c.firstName} ${c.lastName}`}
        subtitle={`${c.contactType.replace(/_/g, " ")}${d.organisation ? ` · ${d.organisation.name}` : ""}${c.jobTitle ? ` · ${c.jobTitle}` : ""}`}
        actions={
          <>
            <Button variant="outline" size="sm" disabled={summarise.isPending} onClick={() => summarise.mutate({ contactId })}>
              <Sparkles className="h-3.5 w-3.5 mr-1" /> {summarise.isPending ? "Summarising…" : "AI summary"}
            </Button>
            <Button size="sm" onClick={() => setLogOpen(true)}>Log interaction</Button>
          </>
        }
      />

      {summarise.error && <AiError error={summarise.error} onRetry={() => summarise.mutate({ contactId })} />}
      {summarise.data && (
        <div className="uc-card border-l-4 border-l-violet-400 p-4">
          <p className="uc-label mb-1 text-violet-800">AI summary — last interactions</p>
          <p className="text-sm">{summarise.data.summary}</p>
          {summarise.data.openIssues.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-sm">
              {summarise.data.openIssues.map((i, x) => <li key={x}>{i}</li>)}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Suggested follow-up: {summarise.data.suggestedFollowUp}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <section className="uc-card p-5" aria-label="Timeline">
            <h2 className="uc-label mb-3">Timeline</h2>
            {d.timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">No interactions recorded yet.</p>
            ) : (
              <ol className="relative border-l pl-6 space-y-4" style={{ borderColor: "var(--line)" }}>
                {d.timeline.map((i) => {
                  const Icon = TYPE_ICONS[i.type] ?? StickyNote;
                  return (
                    <li key={i.id} className="relative">
                      <span className="absolute -left-[31px] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-[--brand-100] border" style={{ borderColor: "var(--line)" }}>
                        <Icon className="h-3 w-3 text-[--brand-700]" aria-hidden />
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{i.subject}</p>
                        <Chip value={i.direction === "inbound" ? "applied" : i.direction === "outbound" ? "offer_sent" : "draft"} label={i.direction} />
                        {i.ticketId && d.ticketMap[i.ticketId as unknown as number] && (
                          <Link to={`/crm/tickets/${i.ticketId}`} className="text-xs text-[--brand-600] hover:underline font-mono">
                            {d.ticketMap[i.ticketId as unknown as number]}
                          </Link>
                        )}
                      </div>
                      {i.body && <p className="mt-0.5 text-sm text-muted-foreground whitespace-pre-wrap">{i.body}</p>}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {i.type.replace(/_/g, " ")} · {i.loggedBy} · {fmtDateTime(i.occurredAt)}
                        {i.durationSeconds ? ` · ${Math.round(i.durationSeconds / 60)} min` : ""}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="uc-card p-4">
            <h2 className="uc-label mb-2">Contact</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-xs text-muted-foreground">Phone</dt><dd className="text-xs font-mono">{c.phone ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-xs text-muted-foreground">Email</dt><dd className="text-xs">{c.email ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-xs text-muted-foreground">Preferred</dt><dd className="text-xs">{c.preferredChannel}</dd></div>
              {d.linkedClient && (
                <div className="flex justify-between">
                  <dt className="text-xs text-muted-foreground">Linked client</dt>
                  <dd className="text-xs">
                    <Link to={`/clients/${d.linkedClient.id}`} className="text-[--brand-600] hover:underline">
                      {d.linkedClient.firstName} {d.linkedClient.lastName}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
            {c.communicationNotes && (
              <p className="mt-2 rounded bg-[--brand-50] border p-2 text-xs" style={{ borderColor: "var(--line)" }}>{c.communicationNotes}</p>
            )}
          </section>

          {d.related.length > 0 && (
            <section className="uc-card p-4">
              <h2 className="uc-label mb-2">Relationships</h2>
              <ul className="space-y-1.5 text-sm">
                {d.related.map((r) => (
                  <li key={r.id}>
                    <Link to={`/crm/contacts/${r.other?.id}`} className="text-[--brand-600] hover:underline">
                      {r.other?.firstName} {r.other?.lastName}
                    </Link>
                    <span className="text-xs text-muted-foreground"> — {(r.relationship ?? "").replace(/_/g, " ")}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="uc-card p-4">
            <h2 className="uc-label mb-2">Open tickets ({d.openTickets.length})</h2>
            {d.openTickets.length === 0 ? <p className="text-xs text-muted-foreground">None open.</p> : (
              <ul className="space-y-1.5">
                {d.openTickets.map((t) => (
                  <li key={t.id}>
                    <Link to={`/crm/tickets/${t.id}`} className="uc-focus text-sm">
                      <span className="font-mono text-xs text-[--brand-600]">{t.ticketNo}</span>{" "}
                      <span className="text-[--brand-900]">{t.subject}</span>
                    </Link>
                    <Chip value={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {d.tasks.length > 0 && (
            <section className="uc-card p-4">
              <h2 className="uc-label mb-2">Open tasks</h2>
              <ul className="space-y-1.5 text-sm">
                {d.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between">
                    <span>{t.title}</span>
                    {t.dueAt && <span className="text-xs text-muted-foreground">{new Date(t.dueAt).toLocaleDateString("en-GB")}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <LogInteractionDialog open={logOpen} onClose={() => setLogOpen(false)} contactId={contactId} onDone={inv} />
    </div>
  );
}

function LogInteractionDialog({ open, onClose, contactId, onDone }: {
  open: boolean; onClose: () => void; contactId: number; onDone: () => void;
}) {
  const [f, setF] = useState({ type: "outbound_call", subject: "", body: "", followUp: "none" });
  const log = trpc.crm.logInteraction.useMutation({
    onSuccess: () => { toast.success("Logged"); onDone(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Log interaction</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={f.type} onValueChange={(v) => setF((s) => ({ ...s, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["inbound_call", "outbound_call", "missed_call", "voicemail", "email_in", "email_out", "sms_in", "sms_out", "meeting", "note", "letter"].map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Follow-up</Label>
              <Select value={f.followUp} onValueChange={(v) => setF((s) => ({ ...s, followUp: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="tomorrow">Tomorrow</SelectItem>
                  <SelectItem value="3days">In 3 days</SelectItem>
                  <SelectItem value="week">In a week</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label htmlFor="li-sub">Subject</Label><Input id="li-sub" value={f.subject} onChange={(e) => setF((s) => ({ ...s, subject: e.target.value }))} /></div>
          <div><Label htmlFor="li-body">Notes</Label><Textarea id="li-body" rows={3} value={f.body} onChange={(e) => setF((s) => ({ ...s, body: e.target.value }))} /></div>
          {(f.type === "missed_call" || f.type === "voicemail") && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
              A return-call task is created automatically for missed calls and voicemails.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={f.subject.length < 2 || log.isPending}
            onClick={() => log.mutate({ type: f.type as never, contactId, subject: f.subject, body: f.body || undefined, createFollowUp: f.followUp as never })}>
            Log
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
