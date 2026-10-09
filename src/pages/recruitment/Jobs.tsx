import { useState } from "react";
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
import { Briefcase, Plus, Globe, Copy, Check, QrCode, ExternalLink, RefreshCw, Trash2, BarChart3, Link2, FileText } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import type { RouterOutputs } from "@/lib/router-types";

type JobRow = RouterOutputs["hr"]["jobs"][number];

export default function Jobs() {
  const utils = trpc.useUtils();
  const q = trpc.hr.jobs.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
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
            <JobCard key={j.id} job={j} onSetStatus={(status) => setStatus.mutate({ id: Number(j.id), status })} />
          ))}
        </div>
      )}
      <CreateJobDialog open={createOpen} onClose={() => setCreateOpen(false)} />
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

function JobCard({ job: j, onSetStatus }: { job: JobRow; onSetStatus: (s: "draft" | "live" | "closed") => void }) {
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

type Req = { key: string; label: string; weight: number; type: string; required: boolean };

function CreateJobDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState({
    title: "", location: "Birmingham", postcode: "", salaryText: "",
    employmentType: "full_time" as const, descriptionMd: "", screeningThreshold: 85, closesAt: "",
  });
  const [reqs, setReqs] = useState<Req[]>([
    { key: "right_to_work", label: "Right to work in the UK", weight: 20, type: "hard", required: true },
    { key: "experience", label: "Care experience (paid or voluntary)", weight: 25, type: "scored", required: false },
    { key: "values", label: "Person-centred values & communication", weight: 20, type: "scored", required: false },
  ]);
  const create = trpc.hr.createJob.useMutation({
    onSuccess: () => { utils.hr.jobs.invalidate(); toast.success("Job created as draft"); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const suggest = trpc.hr.extractRequirementsFromJD.useMutation({
    onSuccess: (r) => {
      setReqs(r.requirements.map((x) => ({ key: x.key, label: x.label, weight: x.weight, type: x.type, required: x.required })));
      toast.success("Requirements suggested — review and edit before publishing");
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const setReq = (i: number, k: keyof Req, v: unknown) =>
    setReqs((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New job posting</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label htmlFor="j-title">Job title</Label>
            <Input id="j-title" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Domiciliary Care Worker" />
          </div>
          <div>
            <Label htmlFor="j-loc">Location</Label>
            <Input id="j-loc" value={f.location} onChange={(e) => set("location", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="j-pc">Postcode area</Label>
            <Input id="j-pc" value={f.postcode} onChange={(e) => set("postcode", e.target.value)} placeholder="B23" />
          </div>
          <div>
            <Label htmlFor="j-sal">Salary text</Label>
            <Input id="j-sal" value={f.salaryText} onChange={(e) => set("salaryText", e.target.value)} placeholder="£12.85–£13.40 per hour" />
          </div>
          <div>
            <Label>Employment type</Label>
            <Select value={f.employmentType} onValueChange={(v) => set("employmentType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">Full time</SelectItem>
                <SelectItem value="part_time">Part time</SelectItem>
                <SelectItem value="zero_hours">Zero hours</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="j-th">Auto-shortlist threshold ({f.screeningThreshold})</Label>
            <input id="j-th" type="range" min={60} max={100} value={f.screeningThreshold}
              onChange={(e) => set("screeningThreshold", Number(e.target.value))}
              className="w-full accent-[--brand-600]" aria-describedby="j-th-hint" />
            <p id="j-th-hint" className="text-[11px] text-muted-foreground">Scores at or above this are shortlisted automatically. 60–84 goes to human review. Below 60 is never auto-rejected.</p>
          </div>
          <div>
            <Label htmlFor="j-close">Closing date</Label>
            <Input id="j-close" type="date" value={f.closesAt} onChange={(e) => set("closesAt", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label htmlFor="j-desc">Job description</Label>
            <Textarea id="j-desc" rows={5} value={f.descriptionMd} onChange={(e) => set("descriptionMd", e.target.value)}
              placeholder="About the role, what a typical day looks like, what we offer…" />
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="uc-label">Screening requirements</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline"
                disabled={f.descriptionMd.length < 10 || suggest.isPending}
                onClick={() => suggest.mutate({ title: f.title || "Care role", descriptionMd: f.descriptionMd })}>
                {suggest.isPending ? "Thinking…" : "Suggest from job description"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setReqs((rs) => [...rs, { key: `req_${rs.length + 1}`, label: "", weight: 10, type: "scored", required: false }])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {reqs.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={r.label} placeholder="Requirement" className="flex-1"
                  onChange={(e) => setReq(i, "label", e.target.value)} aria-label={`Requirement ${i + 1}`} />
                <Input type="number" min={1} max={40} value={r.weight} className="w-20"
                  onChange={(e) => setReq(i, "weight", Number(e.target.value))} aria-label="Weight" />
                <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                  <input type="checkbox" checked={r.required} onChange={(e) => setReq(i, "required", e.target.checked)}
                    className="accent-[--brand-600]" />
                  Hard required
                </label>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label="Remove requirement"
                  onClick={() => setReqs((rs) => rs.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            A job cannot go Live without requirements. Missing a hard-required item caps the AI score at 50 — it can never auto-shortlist.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={create.isPending || f.title.length < 3 || f.descriptionMd.length < 10}
            onClick={() => create.mutate({
              title: f.title, location: f.location, postcode: f.postcode || undefined,
              salaryText: f.salaryText || undefined, employmentType: f.employmentType,
              descriptionMd: f.descriptionMd, screeningThreshold: f.screeningThreshold,
              closesAt: f.closesAt || undefined,
              requirements: reqs.filter((r) => r.label.trim()).map((r, i) => ({
                key: r.key || `req_${i}`, label: r.label, weight: r.weight, type: r.type, required: r.required,
              })),
            })}
          >
            {create.isPending ? "Creating…" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
