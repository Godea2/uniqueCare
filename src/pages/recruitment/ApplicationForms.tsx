import { useState } from "react";
import { useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, Plus, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { FormBuilder } from "@/components/form-builder/FormBuilder";

export default function ApplicationForms() {
  const [sp] = useSearchParams();
  const jobId = sp.get("job") ? Number(sp.get("job")) : null;
  return jobId ? <JobFormTab jobId={jobId} /> : <TemplatesList />;
}

// ── Templates list ──────────────────────────────────────────────────────────
function TemplatesList() {
  const utils = trpc.useUtils();
  const q = trpc.forms.templates.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [editTemplateId, setEditTemplateId] = useState<number | null>(null);
  const create = trpc.forms.createTemplate.useMutation({
    onSuccess: () => { utils.forms.templates.invalidate(); setCreateOpen(false); setName(""); toast.success("Template created"); },
    onError: (e) => toast.error(e.message),
  });
  const archive = trpc.forms.updateTemplate.useMutation({
    onSuccess: () => utils.forms.templates.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  if (editTemplateId) return <TemplateEditor templateId={editTemplateId} onBack={() => setEditTemplateId(null)} />;

  if (q.isLoading) return <Loading rows={3} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const tpls = q.data ?? [];

  return (
    <div>
      <PageHeader
        title="Application forms"
        subtitle="Reusable application form templates — assign one to each job, then tailor it per vacancy"
        actions={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New template</Button>}
      />
      {tpls.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title="No templates yet" hint="Create a template to reuse across vacancies." />
      ) : (
        <div className="space-y-3">
          {tpls.map((t) => (
            <div key={t.id} className="uc-card p-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[--brand-600]" aria-hidden />
                  <h2 className="font-semibold text-[--brand-900]">{t.name}</h2>
                  <Chip value={t.status} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Used by {t.jobsUsing} job{t.jobsUsing === 1 ? "" : "s"}
                  {t.jobTitles.length > 0 ? ` — ${t.jobTitles.join(", ")}` : ""}
                  {" · "}Last edited {fmtDateTime(t.updatedAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditTemplateId(Number(t.id))}>Edit template</Button>
                {t.status === "active" ? (
                  <Button size="sm" variant="ghost" onClick={() => archive.mutate({ id: Number(t.id), status: "archived" })}>Archive</Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => archive.mutate({ id: Number(t.id), status: "active" })}>Restore</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New form template</DialogTitle></DialogHeader>
          <Label htmlFor="tpl-name">Template name</Label>
          <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior Care Worker" />
          <p className="text-xs text-muted-foreground">Starts from the standard care worker form — you can change everything except the locked core fields.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={name.trim().length < 3 || create.isPending}
              onClick={() => create.mutate({ name: name.trim() })}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Template editor (edits the template schema itself) ─────────────────────
function TemplateEditor({ templateId, onBack }: { templateId: number; onBack: () => void }) {
  const utils = trpc.useUtils();
  const q = trpc.forms.templateDetail.useQuery({ id: templateId });
  const save = trpc.forms.updateTemplate.useMutation({
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <Loading rows={3} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const tpl = q.data!;

  return (
    <FormBuilder
      key={tpl.id}
      title={`Template: ${tpl.name}`}
      schema={tpl.schemaJson as never}
      backLabel="All templates"
      onBack={onBack}
      onSave={async (schema) => {
        await save.mutateAsync({ id: templateId, schemaJson: schema });
        utils.forms.templateDetail.invalidate({ id: templateId });
      }}
      publishLabel="Save template"
    />
  );
}

// ── Per-job form tab ────────────────────────────────────────────────────────
function JobFormTab({ jobId }: { jobId: number }) {
  const utils = trpc.useUtils();
  const q = trpc.forms.jobForm.useQuery({ jobId });
  const jobsQ = trpc.hr.jobs.useQuery();
  const tplsQ = trpc.forms.templates.useQuery();
  const saveDraft = trpc.forms.saveDraft.useMutation({ onError: (e) => toast.error(e.message) });
  const publish = trpc.forms.publishForm.useMutation({
    onSuccess: (r) => { utils.forms.jobForm.invalidate({ jobId }); toast.success(`Form published as version ${r.version} — the public link now uses it.`); },
    onError: (e) => toast.error(e.message),
  });
  const assign = trpc.forms.assignTemplate.useMutation({
    onSuccess: () => { utils.forms.jobForm.invalidate({ jobId }); toast.success("Template copied to this job — edit it freely, the template itself is unchanged."); },
    onError: (e) => toast.error(e.message),
  });
  const saveAs = trpc.forms.saveAsTemplate.useMutation({
    onSuccess: () => { utils.forms.templates.invalidate(); toast.success("Saved as a new template"); },
    onError: (e) => toast.error(e.message),
  });
  const suggest = trpc.forms.suggestQuestions.useMutation({ onError: (e) => toast.error(e.message) });
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [tplName, setTplName] = useState("");

  if (q.isLoading || jobsQ.isLoading) return <Loading rows={3} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const job = (jobsQ.data ?? []).find((j) => j.id === jobId);
  const data = q.data;

  return (
    <div>
      <PageHeader
        title={`Application form — ${job?.title ?? ""}`}
        subtitle="Customise what applicants answer when they follow this job's application link"
      />
      {!data ? (
        <div className="uc-card p-6">
          <p className="text-sm text-muted-foreground mb-3">Pick a template to attach to this job — the system copies it, and you can then tailor it for this vacancy.</p>
          <div className="flex gap-2 max-w-md">
            <Select onValueChange={(v) => assign.mutate({ jobId, templateId: Number(v) })}>
              <SelectTrigger><SelectValue placeholder="Choose a template…" /></SelectTrigger>
              <SelectContent>
                {(tplsQ.data ?? []).filter((t) => t.status === "active").map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>Based on template: <strong>{data.form.name}</strong></span>
            <span>·</span>
            <span>
              {data.published ? `Published: v${data.published.version} (${fmtDateTime(data.published.createdAt)})` : "Not published yet"}
            </span>
            <span>·</span>
            <span>{data.applicationCount} application{data.applicationCount === 1 ? "" : "s"} received
              {data.applicationCount > 0 ? " — publishing creates a new version; existing applications keep the form they answered" : ""}
            </span>
            <span>·</span>
            <div className="flex items-center gap-1">
              <span>Switch template:</span>
              <Select onValueChange={(v) => assign.mutate({ jobId, templateId: Number(v) })}>
                <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {(tplsQ.data ?? []).filter((t) => t.status === "active").map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <FormBuilder
            key={data.form.id}
            title=""
            schema={(data.form.draftSchema ?? data.published?.schemaJson) as never}
            backLabel={null}
            onBack={null}
            onSave={async (schema) => { await saveDraft.mutateAsync({ formId: Number(data.form.id), schemaJson: schema }); }}
            onPublish={async (schema) => {
              await saveDraft.mutateAsync({ formId: Number(data.form.id), schemaJson: schema });
              await publish.mutateAsync({ formId: Number(data.form.id) });
            }}
            onSuggest={async () => {
              const r = await suggest.mutateAsync({ jobId });
              return r.questions;
            }}
            publishLabel="Publish form changes"
            extraActions={<Button size="sm" variant="outline" onClick={() => setSaveAsOpen(true)}>Save as new template</Button>}
            versions={data.versions}
          />
        </>
      )}

      <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save as new template</DialogTitle></DialogHeader>
          <Label htmlFor="saveas-name">Template name</Label>
          <Input id="saveas-name" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Evening Care Worker" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsOpen(false)}>Cancel</Button>
            <Button disabled={tplName.trim().length < 3 || saveAs.isPending}
              onClick={async () => { await saveAs.mutateAsync({ formId: Number(data!.form.id), name: tplName.trim() }); setSaveAsOpen(false); setTplName(""); }}>
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
