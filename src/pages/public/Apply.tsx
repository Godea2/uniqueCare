import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { Loading, Markdown } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  conditionMet, validateAnswer, AVAILABILITY_ROWS, AVAILABILITY_COLS,
  type FormField, type FormAnswers,
} from "@contracts/form-schema";
import { ChevronLeft, ChevronRight, UploadCloud, FileText, X, CheckCircle2 } from "lucide-react";

type ApplyInfo = NonNullable<Awaited<ReturnType<ReturnType<typeof trpc.useUtils>["hr"]["publicApplyInfo"]["fetch"]>>>;

const DAY_LABELS: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const COL_LABELS: Record<string, string> = { mornings: "Mornings", afternoons: "Afternoons", evenings: "Evenings", nights: "Nights" };

export default function Apply() {
  const { slug } = useParams<{ slug: string }>();
  const [sp] = useSearchParams();
  const src = sp.get("src") ?? undefined;
  const info = trpc.hr.publicApplyInfo.useQuery({ slug: slug!, src }, { enabled: !!slug, retry: false });

  if (info.isLoading) return <Shell><Loading rows={4} /></Shell>;
  if (info.error) return <Shell><ClosedCard title="This link is not valid" body="The application link you followed does not exist. All our current vacancies are listed on the careers page." /></Shell>;
  if (info.data!.state === "closed") {
    return <Shell><ClosedCard title="This vacancy is now closed" body={`Thank you for your interest in ${info.data!.job.title}. This vacancy is no longer accepting applications — please take a look at our current vacancies.`} /></Shell>;
  }
  return <Shell><Wizard slug={slug!} src={src} info={info.data!} /></Shell>;
}

function ClosedCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="uc-card p-8 text-center">
      <CheckCircle2 className="mx-auto h-10 w-10 text-[--brand-400]" aria-hidden />
      <h1 className="mt-3 text-xl font-bold text-[--brand-900]">{title}</h1>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed">{body}</p>
      <Link to="/careers">
        <Button className="mt-5">See current vacancies</Button>
      </Link>
    </div>
  );
}

type CvPayload = { key: string; fileName: string; size: number; mimeType: string; extractedText: string; readable: boolean };

function Wizard({ slug, src, info }: { slug: string; src?: string; info: Extract<ApplyInfo, { state: "open" }> }) {
  const schema = info.schema;
  const storageKey = `apply-draft-${slug}`;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<FormAnswers>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "{}") as FormAnswers; } catch { return {}; }
  });
  const [cv, setCv] = useState<CvPayload | null>(null);
  const [cvName, setCvName] = useState<string>(() => localStorage.getItem(`${storageKey}-cvname`) ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<{ portalToken: string } | null>(null);

  const uploadCv = trpc.hr.uploadCv.useMutation({
    onError: (e) => setErrors((er) => ({ ...er, cv_upload: friendlyUploadError(e.message) })),
  });
  const submit = trpc.hr.submitApplication.useMutation({
    onSuccess: (r) => {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(`${storageKey}-cvname`);
      setSubmitted(r);
    },
  });

  // browser autosave
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(storageKey, JSON.stringify(answers)), 400);
    return () => clearTimeout(t);
  }, [answers, storageKey]);

  const visibleSections = useMemo(
    () => schema.sections
      .filter((s) => s.fields.length > 0)
      .map((s) => ({ ...s, fields: s.fields.filter((f) => conditionMet(f, answers)) })),
    [schema, answers],
  );
  const section = visibleSections[step];
  const set = (id: string, v: unknown) => setAnswers((a) => ({ ...a, [id]: v }));

  const validateStep = (): boolean => {
    const er: Record<string, string> = {};
    for (const f of section.fields) {
      if (f.type === "file_upload") {
        if (f.required && !cv && !cvName) { er[f.id] = "Please upload your CV"; continue; }
        if (f.required && !cv && cvName) { /* kept from autosave name only — must re-upload */ er[f.id] = "Please re-attach your CV (files are not stored until you submit)"; continue; }
        continue;
      }
      const e = validateAnswer(f, answers[f.id]);
      if (e) er[f.id] = e;
    }
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  const onNext = () => { if (validateStep()) { setStep((s) => s + 1); window.scrollTo({ top: 0 }); } };
  const onSubmit = () => {
    if (!validateStep() || submit.isPending) return;
    if (!cv) { setErrors((er) => ({ ...er, cv_upload: "Please upload your CV" })); setStep(visibleSections.findIndex((s) => s.id === "cv")); return; }
    submit.mutate({ slug, src, answers, cv, website: "" });
  };

  if (submitted) {
    return (
      <div className="uc-card p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" aria-hidden />
        <h1 className="mt-3 text-2xl font-bold text-[--brand-900]">Application received</h1>
        <div className="mt-3 text-sm text-slate-700 leading-relaxed mx-auto max-w-md">
          <Markdown text={schema.thankYouText ?? "Thank you for your application."} />
        </div>
        <Link to={`/portal/${submitted.portalToken}?welcome=1`}>
          <Button className="mt-6">Open your candidate portal</Button>
        </Link>
        <p className="mt-3 text-xs text-muted-foreground">A confirmation email is on its way to you.</p>
      </div>
    );
  }

  const progress = Math.round(((step + 1) / visibleSections.length) * 100);

  return (
    <div>
      <Link to="/careers" className="text-sm text-[--brand-600] hover:underline">← All vacancies</Link>
      <h1 className="mt-2 text-2xl font-bold text-[--brand-900]">{info.job.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {info.job.location}{info.job.salaryText ? ` · ${info.job.salaryText}` : ""} · {info.job.employmentType.replace(/_/g, " ")}
      </p>

      <details className="mt-3 uc-card p-4 group">
        <summary className="cursor-pointer text-sm font-medium text-[--brand-700] list-none flex items-center justify-between">
          About this role
          <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
        </summary>
        <div className="mt-3 text-sm text-slate-700"><Markdown text={info.job.descriptionMd ?? ""} /></div>
      </details>

      <div className="mt-5">
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
          <span>Step {step + 1} of {visibleSections.length}: {section.title}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[--brand-500] transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mt-4 uc-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-[--brand-900]">{section.title}</h2>
        {schema.introText && step === 0 && (
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{schema.introText}</p>
        )}
        {section.description && !section.fields.every((f) => f.type === "file_upload") && (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{section.description}</p>
        )}
        <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
          {section.fields.map((f) => (
            <div key={f.id} className={wideField(f) ? "sm:col-span-2" : undefined}>
            <FieldRenderer
              field={f}
              value={answers[f.id]}
              error={errors[f.id]}
              onChange={(v) => set(f.id, v)}
              cv={cv} cvName={cvName}
              uploading={uploadCv.isPending}
              onCvFile={(file) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const base64 = String(reader.result).split(",")[1] ?? "";
                  uploadCv.mutate({ slug, fileName: file.name, contentBase64: base64 }, {
                    onSuccess: (r) => {
                      setCv(r); setCvName(r.fileName);
                      localStorage.setItem(`${storageKey}-cvname`, r.fileName);
                      setErrors((er) => { const n = { ...er }; delete n[f.id]; return n; });
                    },
                  });
                };
                reader.readAsDataURL(file);
              }}
              onCvRemove={() => { setCv(null); setCvName(""); localStorage.removeItem(`${storageKey}-cvname`); }}
            />
            </div>
          ))}
          {section.fields.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing to answer in this section — continue to the next step.</p>
          )}
        </div>

        {/* honeypot — invisible to humans */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 opacity-0" onChange={() => {}} />

        {submit.error && (
          <p className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{submit.error.message}</p>
        )}

        <div className="mt-8 flex items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--card-line)" }}>
          <Button variant="outline" disabled={step === 0} onClick={() => { setStep((s) => s - 1); window.scrollTo({ top: 0 }); }}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < visibleSections.length - 1 ? (
            <Button onClick={onNext}>Continue <ChevronRight className="h-4 w-4 ml-1" /></Button>
          ) : (
            <Button onClick={onSubmit} disabled={submit.isPending}>
              {submit.isPending ? "Submitting…" : "Submit application"}
            </Button>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">Your progress is saved on this device as you go.</p>
      </div>
    </div>
  );
}

function wideField(f: FormField): boolean {
  return f.type !== "short_text" && f.type !== "uk_phone" && f.type !== "uk_postcode" && f.type !== "number" && f.type !== "date";
}

function FieldRenderer({ field: f, value, error, onChange, cv, cvName, uploading, onCvFile, onCvRemove }: {
  field: FormField; value: unknown; error?: string; onChange: (v: unknown) => void;
  cv: CvPayload | null; cvName: string; uploading: boolean;
  onCvFile: (f: File) => void; onCvRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const id = `f-${f.id}`;
  const req = f.required ? " *" : "";

  const err = error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null;
  const help = f.help ? <p className="text-sm leading-relaxed text-muted-foreground">{f.help}</p> : null;

  switch (f.type) {
    case "heading":
      return <h3 className="text-base font-semibold text-[--brand-900] pt-2">{f.label}</h3>;
    case "paragraph":
      return <p className="text-sm text-slate-600 leading-relaxed">{f.label}</p>;
    case "divider":
      return <hr style={{ borderColor: "var(--card-line)" }} />;
    case "image":
      return f.imageKey ? <img src={f.imageKey} alt="" className="rounded-xl max-w-full" /> : null;
    case "short_text":
    case "email":
    case "uk_phone":
    case "uk_postcode":
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{f.label}{req}</Label>
          <Input id={id} className="h-11" type={f.type === "email" ? "email" : f.type === "uk_phone" ? "tel" : "text"}
            value={String(value ?? "")} placeholder={f.placeholder}
            autoComplete={f.id === "email" ? "email" : f.id === "mobile" ? "tel" : f.id === "postcode" ? "postal-code" : f.id === "first_name" ? "given-name" : f.id === "last_name" ? "family-name" : undefined}
            onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
          {help}{err}
        </div>
      );
    case "number":
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{f.label}{req}</Label>
          <Input id={id} type="number" value={value === undefined || value === null ? "" : String(value)}
            min={f.validation?.min} max={f.validation?.max}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} aria-invalid={!!error} />
          {help}{err}
        </div>
      );
    case "date":
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{f.label}{req}</Label>
          <Input id={id} type="date" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
          {help}{err}
        </div>
      );
    case "long_text": {
      const len = String(value ?? "").length;
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{f.label}{req}</Label>
          <Textarea id={id} rows={5} value={String(value ?? "")} placeholder={f.placeholder}
            onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
          {f.validation?.minChars || f.validation?.maxChars ? (
            <p className={`mt-1 text-[11px] ${f.validation?.minChars && len < f.validation.minChars ? "text-amber-600" : "text-muted-foreground"}`}>
              {len}{f.validation?.maxChars ? ` / ${f.validation.maxChars}` : ""} characters
              {f.validation?.minChars ? ` (minimum ${f.validation.minChars})` : ""}
            </p>
          ) : help}
          {err}
        </div>
      );
    }
    case "single_choice":
      return (
        <div className="flex flex-col gap-1.5">
          <Label>{f.label}{req}</Label>
          <Select value={String(value ?? "")} onValueChange={(v) => onChange(v)}>
            <SelectTrigger aria-invalid={!!error}><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {(f.options ?? []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {help}{err}
        </div>
      );
    case "multiple_choice": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset>
          <legend className="text-sm font-medium">{f.label}{req}</legend>
          <div className="mt-2 space-y-2">
            {(f.options ?? []).map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <Checkbox checked={arr.includes(o.value)}
                  onCheckedChange={(v) => onChange(v === true ? [...arr, o.value] : arr.filter((x) => x !== o.value))} />
                {o.label}
              </label>
            ))}
          </div>
          {help}{err}
        </fieldset>
      );
    }
    case "yes_no":
      return (
        <fieldset>
          <legend className="text-sm font-medium">{f.label}{req}</legend>
          <div className="mt-2 flex gap-2">
            {["yes", "no"].map((v) => (
              <button key={v} type="button"
                onClick={() => onChange(v)}
                className={`rounded-full border px-5 py-2 text-sm font-medium transition-colors ${value === v ? "bg-[--brand-600] text-white border-[--brand-600]" : "bg-white hover:bg-slate-50"}`}
                style={value === v ? undefined : { borderColor: "var(--card-line)" }}
                aria-pressed={value === v}>
                {v === "yes" ? "Yes" : "No"}
              </button>
            ))}
          </div>
          {help}{err}
        </fieldset>
      );
    case "rating": {
      const n = Number(value ?? 0);
      return (
        <fieldset>
          <legend className="text-sm font-medium">{f.label}{req}</legend>
          <div className="mt-2 flex gap-1.5">
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} type="button" onClick={() => onChange(v)} aria-label={`${v} out of 5`} aria-pressed={n === v}
                className={`h-10 w-10 rounded-full border text-sm font-semibold ${n >= v ? "bg-[--brand-600] text-white border-[--brand-600]" : "bg-white"}`}
                style={n >= v ? undefined : { borderColor: "var(--card-line)" }}>
                {v}
              </button>
            ))}
          </div>
          {help}{err}
        </fieldset>
      );
    }
    case "availability_grid": {
      const grid = (typeof value === "object" && value !== null ? value : {}) as Record<string, string[]>;
      const toggle = (day: string, slot: string) => {
        const cur = grid[day] ?? [];
        onChange({ ...grid, [day]: cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot] });
      };
      return (
        <fieldset>
          <legend className="text-sm font-medium">{f.label}{req}</legend>
          {help}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left p-1.5" />
                  {AVAILABILITY_COLS.map((c) => <th key={c} className="p-1.5 font-medium text-slate-600">{COL_LABELS[c]}</th>)}
                </tr>
              </thead>
              <tbody>
                {AVAILABILITY_ROWS.map((d) => (
                  <tr key={d}>
                    <th className="text-left p-1.5 font-medium text-slate-600">{DAY_LABELS[d]}</th>
                    {AVAILABILITY_COLS.map((c) => {
                      const on = (grid[d] ?? []).includes(c);
                      return (
                        <td key={c} className="p-1 text-center">
                          <button type="button" onClick={() => toggle(d, c)}
                            aria-label={`${DAY_LABELS[d]} ${COL_LABELS[c]}: ${on ? "available" : "not available"}`}
                            aria-pressed={on}
                            className={`h-8 w-full min-w-10 rounded-lg border transition-colors ${on ? "bg-[--brand-600] border-[--brand-600]" : "bg-white hover:bg-slate-50"}`}
                            style={on ? undefined : { borderColor: "var(--card-line)" }}>
                            {on && <span className="text-white text-xs">✓</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {err}
        </fieldset>
      );
    }
    case "consent":
      return (
        <div className="rounded-xl bg-[--brand-50] border p-3" style={{ borderColor: "var(--card-line)" }}>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={value === true || value === "yes"}
              onCheckedChange={(v) => onChange(v === true)} aria-invalid={!!error} />
            <span>{f.label}{req}</span>
          </label>
          {err}
        </div>
      );
    case "file_upload": {
      const accept = (f.validation?.fileTypes ?? [".pdf", ".doc", ".docx"]).join(",");
      const maxMb = f.validation?.maxMb ?? 10;
      const shown = cv?.fileName ?? cvName;
      return (
        <div className="flex flex-col gap-2">
          {shown ? (
            <div className="mt-2 flex items-center gap-3 rounded-xl border bg-white p-3" style={{ borderColor: "var(--card-line)" }}>
              <FileText className="h-8 w-8 text-[--brand-500] shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{shown}</p>
                {cv && <p className="text-[11px] text-muted-foreground">{(cv.size / 1024 / 1024).toFixed(1)} MB · ready to submit</p>}
                {!cv && <p className="text-[11px] text-amber-600">Please re-attach the file before submitting</p>}
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>Replace</Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Remove file" onClick={onCvRemove}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <button type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault(); setDrag(false);
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  if (file.size > maxMb * 1024 * 1024) { alert(`File is larger than ${maxMb} MB`); return; }
                  onCvFile(file);
                }
              }}
              className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors disabled:opacity-70 ${drag ? "border-[--brand-500] bg-[--brand-50]" : "border-[--card-line] bg-[--brand-50]/40 hover:bg-[--brand-50]"}`}>
              <UploadCloud className="h-8 w-8 text-[--brand-600]" aria-hidden />
              <span className="text-sm font-medium text-[--brand-900]">{uploading ? "Uploading your CV…" : "Choose your CV, or drop it here"}</span>
              <span className="text-xs text-muted-foreground">PDF, DOC or DOCX, up to {maxMb} MB</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept={accept} className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (file.size > maxMb * 1024 * 1024) { alert(`File is larger than ${maxMb} MB`); return; }
                onCvFile(file);
              }
              e.target.value = "";
            }} />
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>
          )}
        </div>
      );
    }
  }
}

function friendlyUploadError(message: string): string {
  if (/KIMI_|存储|网站未完成|STORAGE_NOT_PROVISIONED/i.test(message)) {
    return "We could not store your CV. Please try again.";
  }
  return message;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[--app-bg]">
      <header className="bg-white border-b" style={{ borderColor: "var(--line)" }}>
        <div className="mx-auto max-w-xl px-4 py-4">
          <Link to="/careers"><img src="/logo.png" alt="Unique Care UK" className="h-9 w-auto" /></Link>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-8">{children}</main>
    </div>
  );
}
