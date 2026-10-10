import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, Chip, Loading, ErrorState, EmptyState, fmtDate } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Briefcase, Plus, Globe, Copy, Check, QrCode, ExternalLink, RefreshCw, Trash2, BarChart3, Link2, FileText, Pencil } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import type { RouterOutputs } from "@/lib/router-types";
import { formSchemaDoc, requirementKeyFromLabel, syncRequirementQuestions } from "@contracts/form-schema";

type JobRow = RouterOutputs["hr"]["jobs"][number];

export default function Jobs() {
  const utils = trpc.useUtils();
  const q = trpc.hr.jobs.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<JobRow | null>(null);
  const setStatus = trpc.hr.setJobStatus.useMutation({
    onSuccess: () => { utils.hr.jobs.invalidate(); toast.success("Job updated"); },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <Loading rows={4} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const jobs = q.data ?? [];

  return (
    <div>
      <PageHeader
        title="Job postings"
        subtitle="Create roles, share the application link, and track where applicants come from"
        actions={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New job</Button>}
      />
      {jobs.length === 0 ? (
        <EmptyState icon={Briefcase} title="No jobs yet" hint="Create your first vacancy to start receiving applications." />
      ) : (
        <div className="space-y-4" data-tour="job-list">
          {jobs.map((j) => (
            <JobCard key={j.id} job={j} onEdit={() => setEditing(j)}
              onSetStatus={(status) => setStatus.mutate({ id: Number(j.id), status })} />
          ))}
        </div>
      )}
      <JobDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <JobDialog open={!!editing} job={editing ?? undefined} onClose={() => setEditing(null)} />
    </div>
  );
}

function applyUrl(slug: string, src?: string) {
  return `${window.location.origin}/apply/${slug}${src ? `?src=${encodeURIComponent(src)}` : ""}`;
}

async function downloadQr(url: string, name: string, format: "png" | "svg") {
  if (format === "png") {
    const dataUrl = await QRCode.toDataURL(url, { width: 640, margin: 2, color: { dark: "#0A2E5C", light: "#ffffff" } });
    const a = document.createElement("a");
    a.href = dataUrl; a.download = `${name}.png`; a.click();
  } else {
    const svg = await QRCode.toString(url, { type: "svg", width: 640, margin: 2 });
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${name}.svg`; a.click();
    URL.revokeObjectURL(a.href);
  }
}

function JobCard({ job: j, onSetStatus, onEdit }: { job: JobRow; onSetStatus: (s: "draft" | "live" | "closed") => void; onEdit: () => void }) {
  const utils = trpc.useUtils();
  const [regenOpen, setRegenOpen] = useState(false);
  const [newSource, setNewSource] = useState("");
  const setEnabled = trpc.hr.setApplyLinkEnabled.useMutation({
    onSuccess: () => utils.hr.jobs.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const regen = trpc.hr.regenerateApplyLink.useMutation({
    onSuccess: () => { utils.hr.jobs.invalidate(); setRegenOpen(false); toast.success("New application link generated — the old link is closed."); },
    onError: (e) => toast.error(e.message),
  });
  const addSource = trpc.hr.addLinkSource.useMutation({
    onSuccess: () => { utils.hr.jobs.invalidate(); setNewSource(""); toast.success("Tracked link added"); },
    onError: (e) => toast.error(e.message),
  });
  const removeSource = trpc.hr.removeLinkSource.useMutation({
    onSuccess: () => utils.hr.jobs.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const slug = j.applySlug ?? j.publicSlug;
  const url = applyUrl(slug);
  const bySource = j.applicationsBySource ?? {};
  const maxCount = Math.max(1, ...Object.values(bySource));
  const sourceRows = [
    { key: "direct", label: "Direct (link shared without tracking)", count: bySource["direct"] ?? 0 },
    ...j.linkSources.map((s) => ({ key: s.slug, label: s.label, count: bySource[s.slug] ?? 0 })),
  ];
  const otherKeys = Object.keys(bySource).filter((k) => k !== "direct" && !j.linkSources.some((s) => s.slug === k));
  for (const k of otherKeys) sourceRows.push({ key: k, label: k, count: bySource[k] });

  return (
    <div className="uc-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-[--brand-900]">{j.title}</h2>
            <Chip value={j.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {j.location}{j.salaryText ? ` · ${j.salaryText}` : ""} · {j.employmentType.replace(/_/g, " ")}
            {j.closesAt ? ` · closes ${fmtDate(j.closesAt)}` : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {j.applicationCount} application{j.applicationCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {j.status === "draft" && (
            <Button size="sm" onClick={() => onSetStatus("live")}>
              <Globe className="h-3.5 w-3.5 mr-1" /> Publish to careers page
            </Button>
          )}
          {j.status === "live" && (
            <Button size="sm" variant="outline" onClick={() => onSetStatus("closed")}>Close</Button>
          )}
          {j.status === "closed" && (
            <Button size="sm" variant="outline" onClick={() => onSetStatus("live")}>Re-open</Button>
          )}
          <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
          <Link to={`/recruitment/forms?job=${j.id}`}>
            <Button size="sm" variant="outline"><FileText className="h-3.5 w-3.5 mr-1" /> Application form</Button>
          </Link>
        </div>
      </div>

      {/* ── Application link card (B1) ── */}
      <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "var(--card-line)", background: "var(--app-bg)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="uc-label flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Application link</p>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs text-muted-foreground">{j.applyLinkEnabled ? "Link active" : "Link disabled"}</span>
            <Switch
              checked={j.applyLinkEnabled}
              onCheckedChange={(v) => setEnabled.mutate({ jobId: Number(j.id), enabled: v })}
              aria-label="Enable or disable application link"
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="flex-1 min-w-0 truncate rounded-xl border bg-white px-3 py-2 text-xs text-[--brand-700]" style={{ borderColor: "var(--card-line)" }}>{url}</code>
          <CopyButton text={url} label="Copy application link" />
          <QrMenu url={url} name={`apply-${slug}`} />
          <a href={url} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Open form</Button>
          </a>
          <Button size="sm" variant="outline" onClick={() => setRegenOpen(true)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Regenerate link
          </Button>
        </div>

        {/* tracked variants */}
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--card-line)" }}>
          <p className="uc-label mb-2">Tracked links</p>
          <div className="space-y-2">
            {j.linkSources.map((s) => {
              const sUrl = applyUrl(slug, s.slug);
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white border px-2.5 py-1 text-xs font-medium" style={{ borderColor: "var(--card-line)" }}>{s.label}</span>
                  <code className="flex-1 min-w-0 truncate text-[11px] text-muted-foreground">{sUrl}</code>
                  <CopyButton text={sUrl} label={`Copy ${s.label} link`} small />
                  <QrMenu url={sUrl} name={`apply-${slug}-${s.slug}`} small />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={`Remove ${s.label}`}
                    onClick={() => removeSource.mutate({ id: Number(s.id) })}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Input value={newSource} onChange={(e) => setNewSource(e.target.value)}
              placeholder="Label, e.g. Facebook group post" className="h-8 max-w-64 text-xs" />
            <Button size="sm" variant="outline" disabled={newSource.trim().length < 2 || addSource.isPending}
              onClick={() => addSource.mutate({ jobId: Number(j.id), label: newSource.trim() })}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add tracked link
            </Button>
          </div>
        </div>

        {/* per-source stats */}
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--card-line)" }}>
          <p className="uc-label mb-2 flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Applications per link</p>
          <div className="space-y-1.5">
            {sourceRows.map((r) => (
              <div key={r.key} className="flex items-center gap-2 text-xs">
                <span className="w-48 truncate text-slate-600">{r.label}</span>
                <div className="flex-1 h-2.5 rounded-full bg-white border overflow-hidden" style={{ borderColor: "var(--card-line)" }}>
                  <div className="h-full rounded-full bg-[--brand-500]" style={{ width: `${(r.count / maxCount) * 100}%` }} />
                </div>
                <span className="w-8 text-right font-medium">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AlertDialog open={regenOpen} onOpenChange={setRegenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate application link?</AlertDialogTitle>
            <AlertDialogDescription>
              The current link for “{j.title}” will stop working immediately — anyone with the old link will see a
              “vacancy closed” page. Existing applications are not affected. Tracked links will use the new URL.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => regen.mutate({ jobId: Number(j.id) })}>Regenerate link</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CopyButton({ text, label, small }: { text: string; label: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm" variant="outline" className={small ? "h-7 px-2 text-xs" : ""}
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); toast.success("Copied"); setTimeout(() => setCopied(false), 1500); }}
      aria-label={label}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      {!small && <span className="ml-1">Copy</span>}
    </Button>
  );
}

function QrMenu({ url, name, small }: { url: string; name: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <Button size="sm" variant="outline" className={small ? "h-7 px-2" : ""} onClick={() => setOpen((o) => !o)} aria-label="Download QR code">
        <QrCode className="h-3.5 w-3.5" />
        {!small && <span className="ml-1">QR</span>}
      </Button>
      {open && (
        <span className="absolute right-0 z-20 mt-1 w-36 rounded-xl border bg-white p-1 shadow-lg" style={{ borderColor: "var(--card-line)" }}>
          <button className="block w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-slate-50"
            onClick={() => { downloadQr(url, name, "png"); setOpen(false); }}>Download PNG</button>
          <button className="block w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-slate-50"
            onClick={() => { downloadQr(url, name, "svg"); setOpen(false); }}>Download SVG</button>
        </span>
      )}
    </span>
  );
}

type Req = { uid: string; key: string; label: string; weight: number; required: boolean };
type EmploymentType = "full_time" | "part_time" | "zero_hours" | "bank";

const EMPTY_JOB = {
  title: "", location: "Birmingham", postcode: "", salaryText: "",
  employmentType: "full_time" as EmploymentType, descriptionMd: "", screeningThreshold: 85, closesAt: "",
};

const CARE_TEMPLATE = "Care Worker — Standard";
let uidSeq = 0;
const uid = () => `r${++uidSeq}`;

function starterRequirements(templateName: string | undefined): Req[] {
  const rtw = { uid: uid(), key: "right_to_work", label: "Right to work in the UK", weight: 20, required: true };
  if (templateName !== CARE_TEMPLATE) return [rtw];
  return [
    rtw,
    { uid: uid(), key: "experience", label: "Care experience (paid or voluntary)", weight: 25, required: false },
    { uid: uid(), key: "values", label: "Person-centred values and communication", weight: 20, required: false },
  ];
}

/** Which question each requirement becomes on the application form (requirement uid → question text). */
function previewQuestions(schemaJson: unknown, reqs: Req[]): Map<string, string> {
  const out = new Map<string, string>();
  const parsed = formSchemaDoc.safeParse(schemaJson);
  if (!parsed.success) return out;
  const taken = new Set(reqs.map((r) => r.key).filter(Boolean));
  const keyed = reqs.map((r) => {
    const key = r.key || requirementKeyFromLabel(r.label, taken);
    taken.add(key);
    return { uid: r.uid, key, label: r.label.trim(), weight: r.weight || 1, type: "scored", required: r.required };
  });
  const doc = syncRequirementQuestions(parsed.data, keyed);
  const fields = doc.sections.flatMap((s) => s.fields);
  for (const r of keyed) {
    const field = fields.find((f) => f.requirementKey === r.key);
    if (field) out.set(r.uid, field.label);
  }
  return out;
}

function jobRequirementsOf(job: JobRow): Req[] {
  const raw = Array.isArray(job.requirements) ? (job.requirements as Partial<Req>[]) : [];
  return raw.map((r) => ({
    uid: uid(), key: String(r.key ?? ""), label: String(r.label ?? ""),
    weight: Number(r.weight ?? 10), required: Boolean(r.required),
  }));
}

function Field({
  label, htmlFor, hint, children, className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `flex flex-col gap-1.5 ${className}` : "flex flex-col gap-1.5"}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function FormSection({ title, lede, children }: { title: string; lede?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[--brand-900]">{title}</h3>
        {lede ? <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{lede}</p> : null}
      </div>
      {children}
    </section>
  );
}

function JobDialog({ open, onClose, job }: { open: boolean; onClose: () => void; job?: JobRow }) {
  const utils = trpc.useUtils();
  const editing = !!job;
  const templatesQ = trpc.forms.templates.useQuery(undefined, { enabled: open });
  const templates = (templatesQ.data ?? []).filter((t) => t.status === "active" || t.id === job?.formTemplateId);
  const [f, setF] = useState(EMPTY_JOB);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [reqsTouched, setReqsTouched] = useState(false);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Load the form once per opening: the job being edited, or a blank job on the care template.
  const loadKey = open ? (job ? `job-${job.id}` : "new") : null;
  if (open && loadKey !== loadedFor && (job || templatesQ.data)) {
    setLoadedFor(loadKey);
    setReqsTouched(false);
    if (job) {
      setF({
        title: job.title, location: job.location ?? "", postcode: job.postcode ?? "", salaryText: job.salaryText ?? "",
        employmentType: job.employmentType as EmploymentType, descriptionMd: job.descriptionMd ?? "",
        screeningThreshold: job.screeningThreshold ?? 85, closesAt: job.closesAt ? String(job.closesAt).slice(0, 10) : "",
      });
      setReqs(jobRequirementsOf(job));
      setTemplateId(job.formTemplateId ?? null);
    } else {
      const care = templatesQ.data?.find((t) => t.name === CARE_TEMPLATE);
      setF(EMPTY_JOB);
      setTemplateId(care ? Number(care.id) : null);
      setReqs(starterRequirements(care?.name));
    }
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  const template = templates.find((t) => Number(t.id) === templateId);
  const chooseTemplate = (id: number) => {
    setTemplateId(id);
    if (!editing && !reqsTouched) setReqs(starterRequirements(templates.find((t) => Number(t.id) === id)?.name));
  };

  const done = (message: string) => {
    utils.hr.jobs.invalidate();
    utils.forms.jobForm.invalidate();
    toast.success(message);
    onClose();
  };
  const create = trpc.hr.createJob.useMutation({
    onSuccess: () => done("Draft saved. Publish it when you are ready to share the link."),
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.hr.updateJob.useMutation({
    onSuccess: () => done(job?.status === "live" ? "Saved. Applicants now see the updated form." : "Saved."),
    onError: (e) => toast.error(e.message),
  });
  const saving = create.isPending || update.isPending;

  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const setReq = (i: number, k: keyof Req, v: unknown) => {
    setReqsTouched(true);
    setReqs((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  };
  const filledReqs = reqs.filter((r) => r.label.trim());
  const ready = f.title.trim().length >= 3 && f.descriptionMd.trim().length >= 10 && f.location.trim().length >= 2
    && filledReqs.every((r) => r.weight > 0);
  const reviewTop = f.screeningThreshold - 1;
  const questions = previewQuestions(template?.schemaJson, filledReqs);
  const templateChanged = editing && templateId !== (job?.formTemplateId ?? null);

  const submit = () => {
    const payload = {
      title: f.title.trim(), location: f.location.trim(), postcode: f.postcode.trim() || undefined,
      salaryText: f.salaryText.trim() || undefined, employmentType: f.employmentType,
      descriptionMd: f.descriptionMd.trim(), screeningThreshold: f.screeningThreshold,
      closesAt: f.closesAt || "",
      requirements: filledReqs.map((r) => ({ key: r.key || undefined, label: r.label.trim(), weight: r.weight, required: r.required })),
      formTemplateId: templateId ?? undefined,
    };
    if (job) update.mutate({ ...payload, id: Number(job.id), formTemplateId: templateChanged ? templateId ?? undefined : undefined });
    else create.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[min(92vh,880px)] w-[calc(100%-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-5 pr-14 text-left" style={{ borderColor: "var(--card-line)" }}>
          <DialogTitle className="text-xl text-[--brand-900]">{editing ? "Edit job" : "New job"}</DialogTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {!editing ? "This saves as a draft. Nothing is public until you publish it."
              : job?.status === "live" ? "This job is live. Changes reach the careers page and the application form as soon as you save."
              : "Changes are saved to the draft."}
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-6">
          <FormSection title="The role">
            <Field label="Job title" htmlFor="j-title">
              <Input id="j-title" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Domiciliary Care Worker" />
            </Field>
            <Field label="What the work involves" htmlFor="j-desc" hint="A few sentences is enough to start. You can refine it before publishing.">
              <Textarea id="j-desc" rows={5} value={f.descriptionMd} onChange={(e) => set("descriptionMd", e.target.value)}
                placeholder="A typical day, who they will support, and what you offer in return." />
            </Field>
          </FormSection>

          <FormSection title="Where, when, and pay">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Location" htmlFor="j-loc">
                <Input id="j-loc" value={f.location} onChange={(e) => set("location", e.target.value)} />
              </Field>
              <Field label="Postcode area" htmlFor="j-pc" hint="Shown to applicants. Example: B23">
                <Input id="j-pc" value={f.postcode} onChange={(e) => set("postcode", e.target.value)} placeholder="B23" />
              </Field>
              <Field label="Hours" htmlFor="j-type">
                <Select value={f.employmentType} onValueChange={(v) => set("employmentType", v)}>
                  <SelectTrigger id="j-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full time</SelectItem>
                    <SelectItem value="part_time">Part time</SelectItem>
                    <SelectItem value="zero_hours">Zero hours</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Closing date" htmlFor="j-close" hint="Leave blank to keep applications open.">
                <Input id="j-close" type="date" value={f.closesAt} onChange={(e) => set("closesAt", e.target.value)} />
              </Field>
            </div>
            <Field label="Pay, as applicants should read it" htmlFor="j-sal" hint="This exact wording appears on the careers page.">
              <Input id="j-sal" value={f.salaryText} onChange={(e) => set("salaryText", e.target.value)} placeholder="£15 per hour" />
            </Field>
          </FormSection>

          <FormSection
            title="Who gets through automatically"
            lede="Each application is scored against the screening requirements as soon as it arrives. A score at or above the line moves it forward, as long as every must-have is clearly met. Everyone else waits for a person. Nobody is rejected by the score alone."
          >
            <Field label={`Shortlist from ${f.screeningThreshold}`} htmlFor="j-th">
              <input id="j-th" type="range" min={60} max={100} value={f.screeningThreshold}
                onChange={(e) => set("screeningThreshold", Number(e.target.value))}
                className="mt-1 h-2 w-full cursor-pointer accent-[--brand-600]" />
            </Field>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-2xl px-3 py-3" style={{ background: "var(--tint-green)" }}>
                <p className="text-sm font-semibold text-[--brand-900]">{f.screeningThreshold} and above</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">Shortlisted, and the pre-interview form is sent.</p>
              </div>
              <div className="rounded-2xl px-3 py-3" style={{ background: "var(--tint-amber)" }}>
                <p className="text-sm font-semibold text-[--brand-900]">{reviewTop >= 60 ? `60 to ${reviewTop}` : "No middle band"}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {reviewTop >= 60 ? "Held for someone on the team to read." : "60 and above is shortlisted."}
                </p>
              </div>
              <div className="rounded-2xl px-3 py-3" style={{ background: "var(--tint-slate)" }}>
                <p className="text-sm font-semibold text-[--brand-900]">Under 60</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">Stays in Applied until a person decides.</p>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Application form"
            lede="Applicants fill in this form. Every screening requirement below is asked on it, so candidates can show they meet it."
          >
            <Field
              label="Start from"
              htmlFor="j-tpl"
              hint={templateChanged
                ? "Saving rebuilds this job's form from the chosen template. Edits made in the form builder will be replaced."
                : "Care Worker includes care experience, driving and availability questions. General role keeps it short."}
            >
              <Select value={templateId != null ? String(templateId) : ""} onValueChange={(v) => chooseTemplate(Number(v))}>
                <SelectTrigger id="j-tpl"><SelectValue placeholder={templatesQ.isLoading ? "Loading…" : "Choose a form"} /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </FormSection>

          <FormSection
            title="Screening Requirements"
            lede="What this role needs. Each one is asked on the application form and scored. Tick Must have for anything a candidate cannot do the job without."
          >
            <ul className="space-y-3">
              {reqs.map((r, i) => {
                const q = questions.get(r.uid);
                return (
                  <li key={r.uid} className="rounded-2xl border bg-white p-3" style={{ borderColor: "var(--card-line)" }}>
                    <div className="flex items-start gap-2">
                      <Input value={r.label} placeholder="For example: Full UK driving licence"
                        onChange={(e) => setReq(i, "label", e.target.value)} aria-label={`Requirement ${i + 1}`} maxLength={200} />
                      <Button size="sm" variant="ghost" className="h-9 w-9 shrink-0" aria-label={`Remove requirement ${i + 1}`}
                        onClick={() => { setReqsTouched(true); setReqs((rs) => rs.filter((_, j) => j !== i)); }}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        Weight
                        <Input type="number" min={1} max={100} value={r.weight} className="h-8 w-16"
                          onChange={(e) => setReq(i, "weight", Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                          aria-label={`Weight for requirement ${i + 1}`} />
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <Checkbox checked={r.required} onCheckedChange={(v) => setReq(i, "required", v === true)} />
                        Must have
                      </label>
                    </div>
                    {q && (
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        Asked on the form: <span className="text-slate-700">“{q}”</span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <Button size="sm" variant="outline"
              onClick={() => { setReqsTouched(true); setReqs((rs) => [...rs, { uid: uid(), key: "", label: "", weight: 10, required: false }]); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add a requirement
            </Button>
          </FormSection>
        </div>

        <DialogFooter className="shrink-0 gap-3 border-t bg-white px-6 py-4 sm:items-center sm:justify-between" style={{ borderColor: "var(--card-line)" }}>
          <p className="text-xs text-muted-foreground sm:mr-auto">
            {ready
              ? editing ? "Ready to save." : "Ready to save as a draft."
              : filledReqs.some((r) => r.weight <= 0) ? "Every requirement needs a weight above 0."
              : "Add a title, location and a short description to continue."}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={saving || !ready} onClick={submit}>
              {saving ? "Saving…" : editing ? "Save changes" : "Save draft"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
