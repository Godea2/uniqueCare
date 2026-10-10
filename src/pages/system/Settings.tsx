import { useState } from "react";
import { trpc } from "@/providers/trpc";
import type { RouterOutputs } from "@/lib/router-types";
import { PageHeader, Chip, Loading, ErrorState, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AiError } from "@/components/common";

export default function Settings() {
  const orgQ = trpc.core.organisation.useQuery();
  const tplQ = trpc.cqc.templates.useQuery();
  const rulesQ = trpc.core.automationRules.useQuery();
  const utils = trpc.useUtils();

  if (orgQ.isLoading) return <Loading rows={5} />;
  if (orgQ.error) return <ErrorState message={orgQ.error.message} onRetry={() => orgQ.refetch()} />;

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Settings" subtitle="Organisation, document templates and automation rules" />
      <OrgSection org={orgQ.data ?? null} />
      <TemplatesSection templates={tplQ.data ?? []} onChanged={() => utils.cqc.templates.invalidate()} />
      <AutomationsSection rules={rulesQ.data ?? []} />
    </div>
  );
}

function OrgSection({ org }: { org: RouterOutputs["core"]["organisation"] }) {
  const utils = trpc.useUtils();
  const settings = (org?.settings ?? null) as { screeningThreshold?: number; signatoryName?: string; signatoryTitle?: string } | null;
  const [f, setF] = useState({
    name: org?.name ?? "Unique Care UK", address: org?.address ?? "", cqcLocationId: org?.cqcLocationId ?? "",
    screeningThreshold: settings?.screeningThreshold ?? 85,
    signatoryName: settings?.signatoryName ?? "", signatoryTitle: settings?.signatoryTitle ?? "",
  });
  const save = trpc.core.updateOrganisation.useMutation({
    onSuccess: () => { utils.core.organisation.invalidate(); toast.success("Saved"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <section className="uc-card p-5" aria-label="Organisation">
      <h2 className="uc-label mb-3">Organisation</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><Label htmlFor="o-name">Registered name</Label><Input id="o-name" value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} /></div>
        <div><Label htmlFor="o-cqc">CQC location ID</Label><Input id="o-cqc" value={f.cqcLocationId} onChange={(e) => setF((s) => ({ ...s, cqcLocationId: e.target.value }))} placeholder="1-123456789" /></div>
        <div className="md:col-span-2"><Label htmlFor="o-addr">Registered address</Label><Input id="o-addr" value={f.address} onChange={(e) => setF((s) => ({ ...s, address: e.target.value }))} /></div>
        <div>
          <Label htmlFor="o-th">Default AI shortlist threshold ({f.screeningThreshold})</Label>
          <input id="o-th" type="range" min={60} max={100} value={f.screeningThreshold}
            onChange={(e) => setF((s) => ({ ...s, screeningThreshold: Number(e.target.value) }))}
            className="w-full accent-[--brand-600]" />
          <p className="text-[11px] text-muted-foreground">Used when a job doesn't set its own threshold. Candidates are never auto-rejected at any threshold.</p>
        </div>
        <div />
        <div>
          <Label htmlFor="o-sig">Letters and emails signed by</Label>
          <Input id="o-sig" value={f.signatoryName} placeholder="Registered Manager's name"
            onChange={(e) => setF((s) => ({ ...s, signatoryName: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="o-sigt">Their job title</Label>
          <Input id="o-sigt" value={f.signatoryTitle} placeholder="Registered Manager"
            onChange={(e) => setF((s) => ({ ...s, signatoryTitle: e.target.value }))} />
        </div>
      </div>
      {!org && <p className="mt-3 text-xs text-amber-700">No organisation is saved yet. Saving creates it.</p>}
      <Button className="mt-3" size="sm" disabled={save.isPending || f.name.trim().length < 2}
        onClick={() => save.mutate({
          name: f.name.trim(), address: f.address || undefined, cqcLocationId: f.cqcLocationId || undefined,
          screeningThreshold: f.screeningThreshold, signatoryName: f.signatoryName, signatoryTitle: f.signatoryTitle,
        })}>
        Save organisation
      </Button>
    </section>
  );
}

type Tpl = NonNullable<RouterOutputs["cqc"]["templates"]>[number];

function TemplatesSection({ templates, onChanged }: { templates: Tpl[]; onChanged: () => void }) {
  const [editId, setEditId] = useState<number | null>(null);
  const [extractOpen, setExtractOpen] = useState(false);
  const activate = trpc.cqc.activateTemplate.useMutation({
    onSuccess: () => { onChanged(); toast.success("Template activated"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <section className="uc-card p-5" aria-label="Document templates">
      <div className="flex items-center justify-between mb-3">
        <h2 className="uc-label">Document templates</h2>
        <Button size="sm" variant="outline" onClick={() => setExtractOpen(true)}>
          Import from document (AI)
        </Button>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
        {templates.map((t) => (
          <li key={t.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                {t.name} <span className="text-xs text-muted-foreground">v{t.version} · {t.kind.replace(/_/g, " ")}</span>
              </p>
              <p className="text-xs text-muted-foreground">{((t.structure as unknown[]) ?? []).length} sections</p>
            </div>
            <div className="flex items-center gap-2">
              {t.active ? <Chip value="active" label="active" /> : (
                <Button size="sm" variant="outline" className="h-7" onClick={() => activate.mutate({ id: Number(t.id) })}>Activate</Button>
              )}
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditId(Number(t.id))}>Edit sections</Button>
            </div>
          </li>
        ))}
      </ul>
      {editId !== null && (
        <EditTemplateDialog tpl={templates.find((t) => Number(t.id) === editId)!} onClose={() => setEditId(null)} onChanged={onChanged} />
      )}
      <ExtractDialog open={extractOpen} onClose={() => setExtractOpen(false)} onChanged={onChanged} />
    </section>
  );
}

function EditTemplateDialog({ tpl, onClose, onChanged }: { tpl: Tpl; onClose: () => void; onChanged: () => void }) {
  const [sections, setSections] = useState<{ key: string; title: string; guidance?: string }[]>(
    (tpl.structure as { key: string; title: string; guidance?: string }[]) ?? []);
  const save = trpc.cqc.updateTemplateStructure.useMutation({
    onSuccess: () => { onChanged(); onClose(); toast.success("Template saved"); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{tpl.name} — sections</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {sections.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr] gap-2">
              <Input value={s.title} aria-label={`Section ${i + 1} title`}
                onChange={(e) => setSections((ss) => ss.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
              <Input value={s.guidance ?? ""} placeholder="Guidance (optional)" aria-label={`Section ${i + 1} guidance`}
                onChange={(e) => setSections((ss) => ss.map((x, j) => j === i ? { ...x, guidance: e.target.value } : x))} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate({ id: Number(tpl.id), structure: sections })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExtractDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [kind, setKind] = useState("care_plan");
  const [text, setText] = useState("");
  const extract = trpc.cqc.extractTemplateStructure.useMutation({
    onSuccess: (r) => { onChanged(); onClose(); toast.success(`Template "${r.name}" imported as inactive draft — review and activate`); },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Import template structure with AI</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Paste the text of an existing Word/PDF template. The AI extracts its section headings; you review before activating.</p>
        <Label>Template kind</Label>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["care_plan", "support_plan", "supervisor_note", "offer_letter", "appraisal"].map((k) => (
              <SelectItem key={k} value={k}>{k.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label htmlFor="ex-text" className="mt-2">Document text</Label>
        <Textarea id="ex-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the full template text…" />
        {extract.error && <AiError error={extract.error} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={text.length < 20 || extract.isPending}
            onClick={() => extract.mutate({ text, kind: kind as never })}>
            {extract.isPending ? "Extracting…" : "Extract structure"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AutomationsSection({ rules }: { rules: NonNullable<RouterOutputs["core"]["automationRules"]> }) {
  const utils = trpc.useUtils();
  const toggle = trpc.core.toggleAutomation.useMutation({
    onSuccess: () => utils.core.automationRules.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  return (
    <section className="uc-card p-5" aria-label="Automation rules">
      <h2 className="uc-label mb-3">Automation rules</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Automations assist — they never reject a candidate, never approve a plan, and never close a safeguarding concern.
      </p>
      <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
        {rules.map((r) => (
          <li key={r.id} className="py-2.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{r.label}</p>
              <p className="text-xs text-muted-foreground">{r.description}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Last run: {r.lastRunAt ? fmtDateTime(r.lastRunAt) : "never"}</p>
            </div>
            <Switch checked={r.enabled ?? false} onCheckedChange={(v) => toggle.mutate({ id: Number(r.id), enabled: v })}
              aria-label={`${r.enabled ? "Disable" : "Enable"} ${r.label}`} />
          </li>
        ))}
      </ul>
    </section>
  );
}
