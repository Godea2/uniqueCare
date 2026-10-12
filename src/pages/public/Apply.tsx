import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, Link, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { Loading, Markdown, fmtDate } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  conditionMet, validateAnswer, AVAILABILITY_ROWS, AVAILABILITY_COLS, CHECKBOX_CONFIRMED,
  type FormField, type FormAnswers,
} from "@contracts/form-schema";
import { employmentLabel, formatSalary } from "@contracts/job-display";
import { putFile } from "@/lib/upload-file";
import {
  AlertCircle, ArrowLeft, Banknote, CalendarClock, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3,
  FileText, Loader2, MapPin, RotateCcw, UploadCloud, X,
} from "lucide-react";

type ApplyInfo = NonNullable<Awaited<ReturnType<ReturnType<typeof trpc.useUtils>["hr"]["publicApplyInfo"]["fetch"]>>>;

const DAY_LABELS: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const COL_LABELS: Record<string, string> = { mornings: "Mornings", afternoons: "Afternoons", evenings: "Evenings", nights: "Nights" };
const MAX_CV_MB = 10;

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
type CvProgress = { name: string; progress: number; phase: "uploading" | "checking" };

function readStored<T>(key: string, check: (v: unknown) => v is T): T | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return check(v) ? v : null;
  } catch {
    return null;
  }
}
const isAnswers = (v: unknown): v is FormAnswers => typeof v === "object" && v !== null && !Array.isArray(v);
const isCv = (v: unknown): v is CvPayload =>
  typeof v === "object" && v !== null && typeof (v as CvPayload).key === "string" && typeof (v as CvPayload).fileName === "string";
function Wizard({ slug, src, info }: { slug: string; src?: string; info: Extract<ApplyInfo, { state: "open" }> }) {
  const schema = info.schema;
  const storageKey = `apply-draft-${slug}`;
  const cvStorageKey = `${storageKey}-cv`;
  const [answers, setAnswers] = useState<FormAnswers>(() => readStored(storageKey, isAnswers) ?? {});
  const [cv, setCv] = useState<CvPayload | null>(() => readStored(cvStorageKey, isCv));
  const [restored, setRestored] = useState(() => Object.keys(answers).length > 0 || !!cv);
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cvProgress, setCvProgress] = useState<CvProgress | null>(null);
  const [submitted, setSubmitted] = useState<{ portalToken: string } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const cvUploadUrl = trpc.hr.cvUploadUrl.useMutation();
  const confirmCv = trpc.hr.confirmCv.useMutation();
  const submit = trpc.hr.submitApplication.useMutation({
    onSuccess: (r) => {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(cvStorageKey);
      setSubmitted(r);
      window.scrollTo({ top: 0 });
    },
  });

  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(storageKey, JSON.stringify(answers)), 400);
    return () => clearTimeout(t);
  }, [answers, storageKey]);

  const sections = useMemo(
    () => schema.sections
      .map((s) => ({ ...s, fields: s.fields.filter((f) => conditionMet(f, answers)) }))
      .filter((s) => s.fields.length > 0),
    [schema, answers],
  );
  const current = Math.min(step, sections.length - 1);
  const section = sections[current];
  const isLast = current === sections.length - 1;

  const setError = (id: string, message: string | null) =>
    setErrors((er) => {
      const next = { ...er };
      if (message) next[id] = message; else delete next[id];
      return next;
    });
  const set = (id: string, v: unknown) => {
    setAnswers((a) => ({ ...a, [id]: v }));
    if (errors[id]) setError(id, null);
  };

  const fieldError = (f: FormField): string | null => {
    if (f.type === "file_upload") return f.required && !cv ? "Please upload your CV" : null;
    return validateAnswer(f, answers[f.id]);
  };
  const errorsFor = (fields: FormField[]) => {
    const er: Record<string, string> = {};
    for (const f of fields) {
      const e = fieldError(f);
      if (e) er[f.id] = e;
    }
    return er;
  };

  const goTo = (i: number) => {
    setStep(i);
    setFurthest((m) => Math.max(m, i));
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const checkStep = (): boolean => {
    const er = errorsFor(section.fields);
    setErrors(er);
    const first = section.fields.find((f) => er[f.id]);
    if (first) requestAnimationFrame(() => focusField(first.id));
    return !first;
  };

  const onNext = () => { if (checkStep()) goTo(current + 1); };
  const onBack = () => { setErrors({}); goTo(current - 1); };
  const onJump = (i: number) => {
    if (i < current) { setErrors({}); goTo(i); }
    else if (i > current && i <= furthest && checkStep()) goTo(i);
  };

  const onSubmit = () => {
    if (submit.isPending || cvProgress) return;
    const withCvError = (fields: FormField[]) => {
      const er = errorsFor(fields);
      const cvField = fields.find((f) => f.type === "file_upload");
      if (cvField && !cv) er[cvField.id] = "Please upload your CV";
      return er;
    };
    const broken = sections.findIndex((s) => Object.keys(withCvError(s.fields)).length > 0);
    if (broken >= 0) {
      const er = withCvError(sections[broken].fields);
      setErrors(er);
      if (broken !== current) goTo(broken);
      const first = sections[broken].fields.find((f) => er[f.id]);
      if (first) setTimeout(() => focusField(first.id), broken !== current ? 350 : 0);
      return;
    }
    if (!cv) return;
    submit.mutate({ slug, src, answers, cv, website: "" });
  };

  const startAgain = () => {
    localStorage.removeItem(storageKey);
    localStorage.removeItem(cvStorageKey);
    setAnswers({});
    setCv(null);
    setErrors({});
    setRestored(false);
    setStep(0);
    setFurthest(0);
  };

  const uploadCv = async (file: File, field: FormField) => {
    const maxMb = Math.min(field.validation?.maxMb ?? MAX_CV_MB, MAX_CV_MB);
    if (!/\.(pdf|docx?)$/i.test(file.name)) {
      return setError(field.id, "Please choose a PDF or Word document (.pdf, .doc or .docx).");
    }
    if (file.size === 0) return setError(field.id, "That file is empty. Please choose another.");
    if (file.size > maxMb * 1024 * 1024) {
      return setError(field.id, `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${maxMb} MB. Saving it as a PDF usually makes it smaller.`);
    }
    setError(field.id, null);
    setCvProgress({ name: file.name, progress: 0, phase: "uploading" });
    try {
      const target = await cvUploadUrl.mutateAsync({ slug, fileName: file.name });
      await putFile(target.uploadUrl, file, (p) => setCvProgress((c) => c && { ...c, progress: p }));
      setCvProgress((c) => c && { ...c, progress: 1, phase: "checking" });
      const saved = await confirmCv.mutateAsync({ slug, key: target.key, ticket: target.ticket, fileName: file.name });
      setCv(saved);
      localStorage.setItem(cvStorageKey, JSON.stringify(saved));
    } catch (e) {
      setError(field.id, friendlyUploadError(e instanceof Error ? e.message : ""));
    } finally {
      setCvProgress(null);
    }
  };

  if (submitted) {
    return (
      <div className="uc-card p-8 text-center sm:p-10">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-50">
          <CheckCircle2 className="h-8 w-8 text-green-600" aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-[--brand-900]">Application received</h1>
        <p className="mt-1 text-sm font-medium text-slate-600">{info.job.title}</p>
        <div className="mt-4 text-sm text-slate-700 leading-relaxed mx-auto max-w-md">
          <Markdown text={schema.thankYouText ?? "Thank you for your application."} />
        </div>
        <Link to={`/portal/${submitted.portalToken}?welcome=1`}>
          <Button size="lg" className="mt-6">Open your candidate portal</Button>
        </Link>
        <p className="mt-3 text-xs text-muted-foreground">A confirmation email is on its way to you.</p>
      </div>
    );
  }

  const stepErrors = section.fields.filter((f) => errors[f.id]);
  const salary = formatSalary(info.job.salaryText);

  return (
    <div>
      <Link to="/careers" className="inline-flex items-center gap-1.5 text-sm font-medium text-[--brand-600] hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All vacancies
      </Link>

      <header className="mt-3 uc-card p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[--brand-600]">Job application</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[--brand-900] sm:text-[28px]">{info.job.title}</h1>
        <ul className="mt-3 flex flex-wrap gap-2 text-[13px]">
          {info.job.location && <MetaChip icon={<MapPin className="h-3.5 w-3.5" />}>{info.job.location}</MetaChip>}
          {salary && <MetaChip icon={<Banknote className="h-3.5 w-3.5" />} strong>{salary}</MetaChip>}
          {info.job.employmentType && <MetaChip icon={<Clock3 className="h-3.5 w-3.5" />}>{employmentLabel(info.job.employmentType)}</MetaChip>}
          {info.job.closesAt && <MetaChip icon={<CalendarClock className="h-3.5 w-3.5" />}>Closes {fmtDate(info.job.closesAt)}</MetaChip>}
        </ul>
        {info.job.descriptionMd && (
          <details className="group mt-4 border-t pt-3" style={{ borderColor: "var(--card-line)" }}>
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-md text-sm font-medium text-[--brand-700] uc-focus [&::-webkit-details-marker]:hidden">
              Read the job description
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
            </summary>
            <div className="mt-3 text-sm leading-relaxed text-slate-700"><Markdown text={info.job.descriptionMd} /></div>
          </details>
        )}
      </header>

      <div ref={topRef} className="scroll-mt-4 pt-6">
        <Stepper titles={sections.map((s) => s.title)} current={current} furthest={furthest} onJump={onJump} />
      </div>

      <form
        noValidate
        className="mt-4 uc-card overflow-hidden"
        onSubmit={(e) => { e.preventDefault(); if (isLast) onSubmit(); else onNext(); }}
      >
        <div className="border-b px-5 py-4 sm:px-7 sm:py-5" style={{ borderColor: "var(--card-line)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-[--brand-600]">Step {current + 1} of {sections.length}</p>
          <h2 className="mt-0.5 text-xl font-semibold text-[--brand-900]">{section.title}</h2>
          {section.description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{section.description}</p>}
        </div>

        <div className="space-y-6 px-5 py-6 sm:px-7">
          {current === 0 && restored && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-[--brand-50] px-4 py-3 text-sm text-[--brand-900]" style={{ borderColor: "var(--card-line)" }}>
              <span>Welcome back. We kept the answers you started on this device.</span>
              <button type="button" onClick={startAgain} className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-[--brand-700] hover:underline uc-focus">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Start again
              </button>
            </div>
          )}
          {current === 0 && schema.introText && (
            <p className="text-sm leading-relaxed text-slate-600">{schema.introText}</p>
          )}

          {stepErrors.length > 1 && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="flex items-center gap-2 font-medium">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                {stepErrors.length} answers need your attention
              </p>
              <ul className="mt-1.5 space-y-0.5 pl-6">
                {stepErrors.map((f) => (
                  <li key={f.id}>
                    <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => focusField(f.id)}>
                      {f.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
            {layoutFields(section.fields).map(({ field: f, size }) => (
              <div
                key={f.id}
                id={`field-${f.id}`}
                className={`scroll-mt-24 ${size === "half" ? "" : "sm:col-span-2"}`}
              >
                <div className={size === "solo" ? "sm:max-w-[calc(50%-0.75rem)]" : undefined}>
                  <FieldRenderer
                    field={f}
                    value={answers[f.id]}
                    error={errors[f.id]}
                    onChange={(v) => set(f.id, v)}
                    cv={cv}
                    cvProgress={cvProgress}
                    onCvFile={(file) => uploadCv(file, f)}
                    onCvRemove={() => { setCv(null); localStorage.removeItem(cvStorageKey); }}
                  />
                </div>
              </div>
            ))}
          </div>

          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
            className="absolute -left-[9999px] h-0 w-0 opacity-0" onChange={() => {}} />

          {submit.error && (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {submit.error.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t bg-slate-50/70 px-5 py-4 sm:px-7" style={{ borderColor: "var(--card-line)" }}>
          {current > 0 ? (
            <Button type="button" variant="ghost" onClick={onBack}>
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden /> Back
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground"><span className="text-red-600" aria-hidden>*</span> Required</span>
          )}
          {isLast ? (
            <Button type="submit" size="lg" disabled={submit.isPending || !!cvProgress}>
              {submit.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Sending…</> : "Submit application"}
            </Button>
          ) : (
            <Button type="submit" size="lg" disabled={!!cvProgress}>
              Continue <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      </form>
      <p className="mt-3 text-center text-xs text-muted-foreground">Your answers are saved on this device as you go.</p>
    </div>
  );
}

function MetaChip({ icon, strong, children }: { icon: ReactNode; strong?: boolean; children: ReactNode }) {
  return (
    <li className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${strong ? "bg-[--brand-100] font-semibold text-[--brand-900]" : "bg-[--brand-50] text-slate-700"}`}>
      <span className="text-[--brand-600]" aria-hidden>{icon}</span>
      {children}
    </li>
  );
}

function Stepper({ titles, current, furthest, onJump }: {
  titles: string[]; current: number; furthest: number; onJump: (i: number) => void;
}) {
  const progress = Math.round(((current + 1) / titles.length) * 100);
  return (
    <nav aria-label="Application steps">
      <div className="sm:hidden">
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
          <span>Step {current + 1} of {titles.length}: <span className="font-medium text-slate-700">{titles[current]}</span></span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[--brand-500] transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <ol className="hidden sm:grid" style={{ gridTemplateColumns: `repeat(${titles.length}, minmax(0, 1fr))` }}>
        {titles.map((title, i) => {
          const done = i < current;
          const here = i === current;
          const reachable = i <= furthest && !here;
          return (
            <li key={`${title}-${i}`} className="relative flex flex-col items-center">
              {i < titles.length - 1 && (
                <span aria-hidden className={`absolute left-[calc(50%+20px)] right-[calc(-50%+20px)] top-4 h-0.5 rounded-full ${i < current ? "bg-[--brand-500]" : "bg-slate-200"}`} />
              )}
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onJump(i)}
                aria-current={here ? "step" : undefined}
                className="group flex flex-col items-center gap-1.5 rounded-lg px-1 text-center uc-focus disabled:cursor-default"
              >
                <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold transition-colors ${
                  here ? "bg-[--brand-600] text-white ring-4 ring-[--brand-100]"
                    : done ? "bg-[--brand-500] text-white group-hover:bg-[--brand-700]"
                      : reachable ? "border-2 border-[--brand-400] bg-white text-[--brand-700] group-hover:bg-[--brand-50]"
                        : "border border-slate-300 bg-white text-slate-500"
                }`}>
                  {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                </span>
                <span className={`line-clamp-2 text-[11px] leading-tight ${
                  here ? "font-semibold text-[--brand-900]" : reachable ? "text-slate-600 group-hover:text-[--brand-700]" : "text-slate-400"
                }`}>
                  {title}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function focusField(id: string) {
  const box = document.getElementById(`field-${id}`);
  if (!box) return;
  box.scrollIntoView({ behavior: "smooth", block: "center" });
  const target = box.querySelector<HTMLElement>("input:not([type=file]), textarea, [role=combobox], button");
  target?.focus({ preventScroll: true });
}

const HALF_TYPES = new Set<FormField["type"]>(["short_text", "email", "uk_phone", "uk_postcode", "number", "date"]);
const fitsHalf = (f: FormField) => HALF_TYPES.has(f.type) && f.label.length <= 34 && !f.help;

/**
 * Short fields with short labels sit two to a row, so their inputs line up. A short field
 * without a partner keeps a half-width input on its own row instead of stretching.
 */
function layoutFields(fields: FormField[]): { field: FormField; size: "half" | "solo" | "full" }[] {
  const out: { field: FormField; size: "half" | "solo" | "full" }[] = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const next = fields[i + 1];
    if (fitsHalf(f) && next && fitsHalf(next)) {
      out.push({ field: f, size: "half" }, { field: next, size: "half" });
      i++;
    } else {
      out.push({ field: f, size: fitsHalf(f) ? "solo" : "full" });
    }
  }
  return out;
}

const AUTOCOMPLETE: Record<string, string> = {
  first_name: "given-name", last_name: "family-name", email: "email", mobile: "tel", phone: "tel", postcode: "postal-code",
};

function FieldShell({ f, id, error, group, children, footer }: {
  f: FormField; id: string; error?: string; group?: boolean; children: ReactNode; footer?: ReactNode;
}) {
  const label = (
    <>
      {f.label}
      {f.required
        ? <span className="ml-0.5 text-red-600" aria-hidden>*</span>
        : <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>}
    </>
  );
  return (
    <div className="flex min-w-0 flex-col gap-2" role={group ? "group" : undefined} aria-labelledby={group ? `${id}-label` : undefined}>
      {group
        ? <p id={`${id}-label`} className="text-sm font-medium leading-snug text-slate-800">{label}</p>
        : <label htmlFor={id} className="text-sm font-medium leading-snug text-slate-800">{label}</label>}
      {f.help && <p id={`${id}-help`} className="-mt-1 text-[13px] leading-relaxed text-muted-foreground">{f.help}</p>}
      {children}
      {footer}
      {error && (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

function ChoiceCard({ type, name, checked, onChange, label, invalid, describedBy }: {
  type: "radio" | "checkbox"; name: string; checked: boolean; onChange: (checked: boolean) => void;
  label: ReactNode; invalid?: boolean; describedBy?: string;
}) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm leading-snug transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[--brand-400] ${
      checked ? "border-[--brand-500] bg-[--brand-50] font-medium text-[--brand-900]"
        : invalid ? "border-red-300 bg-white hover:bg-slate-50" : "border-[--card-line] bg-white hover:border-[--brand-400] hover:bg-slate-50"
    }`}>
      <input
        type={type} name={name} checked={checked} className="sr-only" aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span aria-hidden className={`grid h-[18px] w-[18px] shrink-0 place-items-center border transition-colors ${
        type === "radio" ? "rounded-full" : "rounded-[5px]"
      } ${checked ? "border-[--brand-600] bg-[--brand-600]" : "border-slate-300 bg-white"}`}>
        {checked && (type === "radio"
          ? <span className="h-1.5 w-1.5 rounded-full bg-white" />
          : <Check className="h-3 w-3 text-white" strokeWidth={3} />)}
      </span>
      <span>{label}</span>
    </label>
  );
}

function FieldRenderer({ field: f, value, error, onChange, cv, cvProgress, onCvFile, onCvRemove }: {
  field: FormField; value: unknown; error?: string; onChange: (v: unknown) => void;
  cv: CvPayload | null; cvProgress: CvProgress | null;
  onCvFile: (f: File) => void; onCvRemove: () => void;
}) {
  const id = `f-${f.id}`;
  const describedBy = [f.help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const control = { id, "aria-invalid": !!error, "aria-describedby": describedBy };

  switch (f.type) {
    case "heading":
      return <h3 className="border-b pb-2 pt-2 text-base font-semibold text-[--brand-900]" style={{ borderColor: "var(--card-line)" }}>{f.label}</h3>;
    case "paragraph":
      return <p className="text-sm leading-relaxed text-slate-600">{f.label}</p>;
    case "divider":
      return <hr style={{ borderColor: "var(--card-line)" }} />;
    case "image":
      return f.imageKey ? <img src={f.imageKey} alt="" className="max-w-full rounded-xl" /> : null;

    case "short_text":
    case "email":
    case "uk_phone":
    case "uk_postcode":
      return (
        <FieldShell f={f} id={id} error={error}>
          <Input
            {...control}
            className={`h-11 bg-white ${f.type === "uk_postcode" ? "uppercase" : ""}`}
            type={f.type === "email" ? "email" : f.type === "uk_phone" ? "tel" : "text"}
            inputMode={f.type === "email" ? "email" : f.type === "uk_phone" ? "tel" : undefined}
            value={String(value ?? "")}
            placeholder={f.placeholder ?? (f.type === "uk_phone" ? "07123 456789" : f.type === "uk_postcode" ? "B1 1AA" : undefined)}
            autoComplete={AUTOCOMPLETE[f.id]}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => {
              const v = f.type === "uk_postcode" ? e.target.value.trim().toUpperCase() : e.target.value.trim();
              if (v !== e.target.value) onChange(v);
            }}
          />
        </FieldShell>
      );

    case "number":
      return (
        <FieldShell f={f} id={id} error={error}>
          <Input
            {...control} className="h-11 bg-white" type="number" inputMode="decimal"
            value={value === undefined || value === null ? "" : String(value)}
            min={f.validation?.min} max={f.validation?.max}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          />
        </FieldShell>
      );

    case "date":
      return (
        <FieldShell f={f} id={id} error={error}>
          <Input
            {...control} className="h-11 bg-white" type="date" value={String(value ?? "")}
            min={/start|available/i.test(f.id + f.label) ? new Date().toISOString().slice(0, 10) : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        </FieldShell>
      );

    case "long_text": {
      const len = String(value ?? "").length;
      const min = f.validation?.minChars;
      const max = f.validation?.maxChars;
      return (
        <FieldShell
          f={f} id={id} error={error}
          footer={(min || max) ? (
            <p className={`-mt-1 text-right text-xs tabular-nums ${min && len < min ? "text-amber-700" : max && len > max ? "text-red-700" : "text-muted-foreground"}`}>
              {min && len < min ? `${min - len} more characters needed · ` : ""}{len}{max ? ` / ${max}` : ""}
            </p>
          ) : undefined}
        >
          <Textarea
            {...control} rows={6} className="min-h-32 bg-white leading-relaxed" value={String(value ?? "")}
            placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)}
          />
        </FieldShell>
      );
    }

    case "single_choice": {
      const options = f.options ?? [];
      const asCards = options.length > 0 && options.length <= 6 && options.every((o) => o.label.length <= 48);
      if (!asCards) {
        return (
          <FieldShell f={f} id={id} error={error}>
            <Select value={String(value ?? "")} onValueChange={(v) => onChange(v)}>
              <SelectTrigger {...control} className="w-full bg-white data-[size=default]:h-11">
                <SelectValue placeholder="Choose an answer" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldShell>
        );
      }
      return (
        <FieldShell f={f} id={id} error={error} group>
          <div role="radiogroup" aria-labelledby={`${id}-label`} className={`grid gap-2 ${options.length > 2 ? "sm:grid-cols-2" : "grid-cols-2 sm:max-w-sm"}`}>
            {options.map((o) => (
              <ChoiceCard
                key={o.value} type="radio" name={id} checked={value === o.value} label={o.label}
                invalid={!!error} describedBy={describedBy} onChange={() => onChange(o.value)}
              />
            ))}
          </div>
        </FieldShell>
      );
    }

    case "multiple_choice": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const options = f.options ?? [];
      const toggle = (v: string, on: boolean) => onChange(on ? [...arr.filter((x) => x !== v), v] : arr.filter((x) => x !== v));
      if (options.length === 1 && options[0].value === CHECKBOX_CONFIRMED) {
        return (
          <FieldShell f={f} id={id} error={error} group>
            <ChoiceCard
              type="checkbox" name={id} checked={arr.includes(CHECKBOX_CONFIRMED)} label={options[0].label}
              invalid={!!error} describedBy={describedBy} onChange={(on) => toggle(CHECKBOX_CONFIRMED, on)}
            />
          </FieldShell>
        );
      }
      return (
        <FieldShell f={{ ...f, help: f.help ?? "Choose all that apply." }} id={id} error={error} group>
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((o) => (
              <ChoiceCard
                key={o.value} type="checkbox" name={id} checked={arr.includes(o.value)} label={o.label}
                invalid={!!error} describedBy={describedBy} onChange={(on) => toggle(o.value, on)}
              />
            ))}
          </div>
        </FieldShell>
      );
    }

    case "yes_no":
      return (
        <FieldShell f={f} id={id} error={error} group>
          <div role="radiogroup" aria-labelledby={`${id}-label`} className="grid max-w-xs grid-cols-2 gap-2">
            {(["yes", "no"] as const).map((v) => (
              <ChoiceCard
                key={v} type="radio" name={id} checked={value === v} label={v === "yes" ? "Yes" : "No"}
                invalid={!!error} describedBy={describedBy} onChange={() => onChange(v)}
              />
            ))}
          </div>
        </FieldShell>
      );

    case "rating": {
      const n = Number(value ?? 0);
      return (
        <FieldShell f={f} id={id} error={error} group>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v} type="button" onClick={() => onChange(v)} aria-label={`${v} out of 5`} aria-pressed={n === v}
                className={`h-11 w-11 rounded-xl border text-sm font-semibold transition-colors uc-focus ${n >= v ? "border-[--brand-600] bg-[--brand-600] text-white" : "border-[--card-line] bg-white hover:bg-slate-50"}`}
              >
                {v}
              </button>
            ))}
          </div>
        </FieldShell>
      );
    }

    case "availability_grid":
      return (
        <FieldShell f={f} id={id} error={error} group>
          <AvailabilityGrid value={value} onChange={onChange} invalid={!!error} />
        </FieldShell>
      );

    case "consent": {
      const checked = value === true || value === "yes";
      return (
        <div className="flex flex-col gap-2">
          <label
            htmlFor={id}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm leading-relaxed transition-colors ${
              checked ? "border-[--brand-400] bg-[--brand-50]" : error ? "border-red-300 bg-white" : "border-[--card-line] bg-white hover:bg-slate-50"
            }`}
          >
            <Checkbox id={id} className="mt-0.5" checked={checked} onCheckedChange={(v) => onChange(v === true)}
              aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
            <span className="text-slate-700">
              {f.label}
              {f.required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
            </span>
          </label>
          {error && (
            <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{error}
            </p>
          )}
        </div>
      );
    }

    case "file_upload":
      return (
        <FieldShell f={{ ...f, help: undefined }} id={id} error={error} group>
          <CvDrop field={f} cv={cv} progress={cvProgress} invalid={!!error} onFile={onCvFile} onRemove={onCvRemove} />
        </FieldShell>
      );
  }
}

function AvailabilityGrid({ value, onChange, invalid }: { value: unknown; onChange: (v: unknown) => void; invalid: boolean }) {
  const grid = (typeof value === "object" && value !== null && !Array.isArray(value) ? value : {}) as Record<string, string[]>;
  const has = (d: string, c: string) => (grid[d] ?? []).includes(c);
  const count = AVAILABILITY_ROWS.reduce((n, d) => n + (grid[d] ?? []).length, 0);

  const fill = (days: readonly string[], cols: readonly string[], on: boolean) => {
    const next = { ...grid };
    for (const d of days) {
      const cur = new Set(next[d] ?? []);
      for (const c of cols) { if (on) cur.add(c); else cur.delete(c); }
      next[d] = AVAILABILITY_COLS.filter((c) => cur.has(c));
    }
    onChange(next);
  };
  const allOn = (days: readonly string[], cols: readonly string[]) => days.every((d) => cols.every((c) => has(d, c)));
  const weekdays = AVAILABILITY_ROWS.slice(0, 5);
  const weekend = AVAILABILITY_ROWS.slice(5);
  const quick: { label: string; days: readonly string[]; cols: readonly string[] }[] = [
    { label: "Any time", days: AVAILABILITY_ROWS, cols: AVAILABILITY_COLS },
    { label: "Weekdays", days: weekdays, cols: AVAILABILITY_COLS },
    { label: "Weekends", days: weekend, cols: AVAILABILITY_COLS },
    { label: "Daytime only", days: AVAILABILITY_ROWS, cols: ["mornings", "afternoons"] },
  ];

  return (
    <div className={`rounded-xl border bg-white p-3 sm:p-4 ${invalid ? "border-red-300" : "border-[--card-line]"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Quick pick:</span>
        {quick.map((q) => {
          const on = allOn(q.days, q.cols);
          return (
            <button
              key={q.label} type="button" aria-pressed={on} onClick={() => fill(q.days, q.cols, !on)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors uc-focus ${on ? "border-[--brand-600] bg-[--brand-600] text-white" : "border-[--card-line] bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {q.label}
            </button>
          );
        })}
        {count > 0 && (
          <button type="button" onClick={() => onChange({})} className="ml-auto rounded-md text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline uc-focus">
            Clear
          </button>
        )}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] table-fixed border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="w-12" />
              {AVAILABILITY_COLS.map((c) => (
                <th key={c} scope="col" className="p-0 font-medium text-slate-600">
                  <button type="button" onClick={() => fill(AVAILABILITY_ROWS, [c], !allOn(AVAILABILITY_ROWS, [c]))}
                    className="w-full rounded-md px-1 py-1 hover:bg-slate-50 hover:text-[--brand-700] uc-focus" title={`Toggle ${COL_LABELS[c].toLowerCase()} every day`}>
                    {COL_LABELS[c]}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AVAILABILITY_ROWS.map((d) => (
              <tr key={d}>
                <th scope="row" className="p-0 text-left font-medium text-slate-600">
                  <button type="button" onClick={() => fill([d], AVAILABILITY_COLS, !allOn([d], AVAILABILITY_COLS))}
                    className="w-full rounded-md px-1.5 py-1 text-left hover:bg-slate-50 hover:text-[--brand-700] uc-focus" title={`Toggle all of ${DAY_LABELS[d]}`}>
                    {DAY_LABELS[d]}
                  </button>
                </th>
                {AVAILABILITY_COLS.map((c) => {
                  const on = has(d, c);
                  return (
                    <td key={c} className="p-0">
                      <button
                        type="button" onClick={() => fill([d], [c], !on)} aria-pressed={on}
                        aria-label={`${DAY_LABELS[d]} ${COL_LABELS[c]}`}
                        className={`grid h-9 w-full place-items-center rounded-lg border transition-colors uc-focus ${on ? "border-[--brand-600] bg-[--brand-600] text-white" : "border-[--card-line] bg-slate-50/60 hover:border-[--brand-400] hover:bg-white"}`}
                      >
                        {on && <Check className="h-4 w-4" aria-hidden />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
        {count === 0 ? "Tap the times you could regularly work. Tap a day or a column heading to fill it." : `${count} time slot${count === 1 ? "" : "s"} selected`}
      </p>
    </div>
  );
}

function CvDrop({ field, cv, progress, invalid, onFile, onRemove }: {
  field: FormField; cv: CvPayload | null; progress: CvProgress | null; invalid: boolean;
  onFile: (f: File) => void; onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const accept = (field.validation?.fileTypes ?? [".pdf", ".doc", ".docx"]).join(",");
  const maxMb = Math.min(field.validation?.maxMb ?? MAX_CV_MB, MAX_CV_MB);
  const picker = (
    <input ref={fileRef} type="file" accept={accept} className="hidden" tabIndex={-1}
      onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file); e.target.value = ""; }} />
  );

  if (progress) {
    const pct = Math.round(progress.progress * 100);
    return (
      <div className="rounded-xl border border-[--card-line] bg-white p-4" aria-live="polite">
        <div className="flex items-center gap-3">
          <Loader2 className="h-6 w-6 shrink-0 animate-spin text-[--brand-600]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{progress.name}</p>
            <p className="text-xs text-muted-foreground">{progress.phase === "uploading" ? `Uploading… ${pct}%` : "Checking your CV…"}</p>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-[--brand-500] transition-all" style={{ width: `${progress.phase === "checking" ? 100 : pct}%` }} />
        </div>
      </div>
    );
  }

  if (cv) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50/60 p-3.5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white">
          <FileText className="h-5 w-5 text-[--brand-600]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{cv.fileName}</p>
          <p className="flex items-center gap-1 text-xs text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {cv.size < 1024 * 1024 ? `${Math.max(1, Math.round(cv.size / 1024))} KB` : `${(cv.size / 1024 / 1024).toFixed(1)} MB`} · uploaded
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="bg-white" onClick={() => fileRef.current?.click()}>Replace</Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Remove CV" onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
        {picker}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault(); setDrag(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors uc-focus ${
          drag ? "border-[--brand-500] bg-[--brand-50]" : invalid ? "border-red-300 bg-red-50/40" : "border-[--card-line] bg-[--brand-50]/50 hover:border-[--brand-400] hover:bg-[--brand-50]"
        }`}
      >
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white shadow-sm">
          <UploadCloud className="h-6 w-6 text-[--brand-600]" aria-hidden />
        </span>
        <span className="text-sm font-semibold text-[--brand-900]">Choose your CV, or drop it here</span>
        <span className="text-xs text-muted-foreground">PDF, DOC or DOCX, up to {maxMb} MB</span>
      </button>
      {picker}
    </>
  );
}

function friendlyUploadError(message: string): string {
  if (!message || /KIMI_|存储|网站未完成|STORAGE_NOT_PROVISIONED|fetch failed/i.test(message)) {
    return "We could not upload your CV. Please try again.";
  }
  return message;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[--app-bg]">
      <header className="border-b bg-white" style={{ borderColor: "var(--line)" }}>
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <Link to="/careers"><img src="/logo.png" alt="Unique Care UK" className="h-9 w-auto" /></Link>
          <Link to="/careers" className="text-sm font-medium text-[--brand-700] hover:underline">Vacancies</Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
