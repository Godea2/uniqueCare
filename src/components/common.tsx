import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Inbox, AlertCircle, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const fmtDate = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString("en-GB") : "—";
export const fmtTime = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
export const fmtDateTime = (d?: string | Date | null) =>
  d ? `${fmtDate(d)} ${fmtTime(d)}` : "—";

export function PageHeader({
  title, subtitle, actions,
}: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div data-tour="page-header">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap" data-tour="page-actions">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label, value, hint, icon: Icon, tone = "default", onClick,
}: {
  label: string; value: ReactNode; hint?: string; icon: LucideIcon;
  tone?: "default" | "good" | "warn" | "bad"; onClick?: () => void;
}) {
  const tones = {
    default: "text-[--brand-900]",
    good: "text-green-700",
    warn: "text-amber-700",
    bad: "text-red-700",
  };
  return (
    <button
      onClick={onClick}
      data-tour="stat-card"
      className={cn(
        `uc-stat uc-stat-${tone} p-5 text-left w-full uc-focus`,
        onClick ? "cursor-pointer" : "cursor-default",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="uc-label">{label}</span>
          <div className={cn("text-3xl font-bold mt-2 tracking-tight", tones[tone])}>{value}</div>
          {hint && <div className="text-xs text-muted-foreground mt-1.5">{hint}</div>}
        </div>
        <span className={`uc-icon-chip uc-icon-chip-${tone} h-12 w-12 shrink-0`} aria-hidden>
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
      </div>
    </button>
  );
}

const CHIP_STYLES: Record<string, string> = {
  // statuses
  new: "bg-sky-100 text-sky-900 border-sky-200",
  open: "bg-blue-100 text-blue-900 border-blue-200",
  in_progress: "bg-indigo-100 text-indigo-900 border-indigo-200",
  waiting_on_customer: "bg-amber-100 text-amber-900 border-amber-200",
  waiting_on_internal: "bg-amber-100 text-amber-900 border-amber-200",
  escalated: "bg-red-100 text-red-900 border-red-300",
  resolved: "bg-green-100 text-green-900 border-green-200",
  closed: "bg-slate-100 text-slate-700 border-slate-200",
  reopened: "bg-orange-100 text-orange-900 border-orange-200",
  // priorities
  low: "bg-slate-100 text-slate-700 border-slate-200",
  normal: "bg-sky-100 text-sky-900 border-sky-200",
  high: "bg-amber-100 text-amber-900 border-amber-200",
  urgent: "bg-red-100 text-red-900 border-red-300",
  // pipeline stages
  applied: "bg-sky-100 text-sky-900 border-sky-200",
  screened_out: "bg-slate-100 text-slate-700 border-slate-200",
  shortlisted: "bg-blue-100 text-blue-900 border-blue-200",
  review: "bg-amber-100 text-amber-900 border-amber-200",
  pre_interview_forms_sent: "bg-indigo-100 text-indigo-900 border-indigo-200",
  pre_interview_forms_complete: "bg-indigo-100 text-indigo-900 border-indigo-200",
  interview_booked: "bg-violet-100 text-violet-900 border-violet-200",
  interviewed: "bg-violet-100 text-violet-900 border-violet-200",
  approved: "bg-emerald-100 text-emerald-900 border-emerald-200",
  rejected: "bg-red-100 text-red-900 border-red-200",
  compliance_docs_requested: "bg-cyan-100 text-cyan-900 border-cyan-200",
  compliance_docs_complete: "bg-teal-100 text-teal-900 border-teal-200",
  offer_sent: "bg-emerald-100 text-emerald-900 border-emerald-200",
  offer_accepted: "bg-green-100 text-green-900 border-green-200",
  training_booked: "bg-lime-100 text-lime-900 border-lime-200",
  online_training_in_progress: "bg-lime-100 text-lime-900 border-lime-200",
  dbs_verified: "bg-teal-100 text-teal-900 border-teal-200",
  training_complete: "bg-green-100 text-green-900 border-green-200",
  hired: "bg-green-600 text-white border-green-700",
  withdrawn: "bg-slate-100 text-slate-700 border-slate-200",
  // visit statuses
  unassigned: "bg-red-100 text-red-900 border-red-300",
  assigned: "bg-blue-100 text-blue-900 border-blue-200",
  partially_assigned: "bg-amber-100 text-amber-900 border-amber-200",
  confirmed: "bg-blue-100 text-blue-900 border-blue-200",
  in_progress_visit: "bg-indigo-100 text-indigo-900 border-indigo-200",
  completed: "bg-green-100 text-green-900 border-green-200",
  missed: "bg-red-600 text-white border-red-700",
  cancelled: "bg-slate-100 text-slate-700 border-slate-200",
  // plans
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  ai_generated: "bg-violet-100 text-violet-900 border-violet-200",
  in_review: "bg-amber-100 text-amber-900 border-amber-200",
  superseded: "bg-slate-100 text-slate-700 border-slate-200",
  // docs
  requested: "bg-slate-100 text-slate-700 border-slate-200",
  uploaded: "bg-amber-100 text-amber-900 border-amber-200",
  verified: "bg-green-100 text-green-900 border-green-200",
  expired: "bg-red-100 text-red-900 border-red-200",
  // misc
  due: "bg-amber-100 text-amber-900 border-amber-200",
  overdue: "bg-red-100 text-red-900 border-red-300",
  active: "bg-green-100 text-green-900 border-green-200",
  live: "bg-green-100 text-green-900 border-green-200",
  published: "bg-blue-100 text-blue-900 border-blue-200",
  locked: "bg-slate-100 text-slate-700 border-slate-200",
  auto_resolved: "bg-green-100 text-green-900 border-green-200",
  manual_required: "bg-red-100 text-red-900 border-red-300",
  pending: "bg-amber-100 text-amber-900 border-amber-200",
  posted: "bg-green-100 text-green-900 border-green-200",
  failed: "bg-red-100 text-red-900 border-red-200",
  booked: "bg-blue-100 text-blue-900 border-blue-200",
  attended: "bg-green-100 text-green-900 border-green-200",
  no_show: "bg-red-100 text-red-900 border-red-200",
  invited: "bg-sky-100 text-sky-900 border-sky-200",
  registered: "bg-blue-100 text-blue-900 border-blue-200",
  scheduled: "bg-blue-100 text-blue-900 border-blue-200",
  signed: "bg-green-100 text-green-900 border-green-200",
  investigating: "bg-amber-100 text-amber-900 border-amber-200",
  on_leave: "bg-amber-100 text-amber-900 border-amber-200",
  onboarding: "bg-sky-100 text-sky-900 border-sky-200",
  suspended: "bg-red-100 text-red-900 border-red-200",
  left: "bg-slate-100 text-slate-700 border-slate-200",
  hospital: "bg-amber-100 text-amber-900 border-amber-200",
  paused: "bg-slate-100 text-slate-700 border-slate-200",
  ended: "bg-slate-100 text-slate-700 border-slate-200",
  moderate: "bg-amber-100 text-amber-900 border-amber-200",
  serious: "bg-orange-100 text-orange-900 border-orange-300",
  severe: "bg-red-600 text-white border-red-700",
};

export function Chip({ value, label }: { value: string; label?: string }) {
  const style = CHIP_STYLES[value] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", style)}>
      {label ?? value.replace(/_/g, " ")}
    </span>
  );
}

export function RagDot({ rag }: { rag: "green" | "amber" | "red" }) {
  const c = { green: "bg-green-600", amber: "bg-amber-500", red: "bg-red-600" }[rag];
  const t = { green: "In date", amber: "Expiring soon", red: "Missing or expired" }[rag];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" title={t}>
      <span className={cn("h-2.5 w-2.5 rounded-full", c)} aria-hidden />
      <span className="sr-only">{t}</span>
    </span>
  );
}

export function EmptyState({
  icon: Icon = Inbox, title, hint, action,
}: { icon?: LucideIcon; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed rounded-xl bg-white/60" style={{ borderColor: "var(--line)" }}>
      <Icon className="h-8 w-8 text-[--brand-500] mb-3" aria-hidden />
      <p className="font-medium text-[--ink-900]">{title}</p>
      {hint && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="uc-shimmer h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center border border-red-200 rounded-xl bg-red-50/50">
      <AlertCircle className="h-8 w-8 text-red-600 mb-3" aria-hidden />
      <p className="font-medium text-red-900">Something went wrong</p>
      <p className="text-sm text-red-700 mt-1 max-w-sm">{message ?? "Please try again."}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
        </Button>
      )}
    </div>
  );
}

export function AiBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 border border-violet-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
      ✦ AI draft — review required
    </span>
  );
}

export function AiError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  const quota = msg.includes("额度") || msg.includes("quota") || msg.includes("access_terminated");
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">
        {quota ? "AI quota exhausted" : "Screening did not finish"}
      </p>
      <p className="mt-1 text-amber-800">
        {quota
          ? "AI features need quota topped up by the site owner. You can continue manually — nothing is blocked."
          : msg || "This is usually temporary. Your inputs are kept — try again in a moment."}
      </p>
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Try again
        </Button>
      )}
    </div>
  );
}

export function AvatarDot({ name, color }: { name: string; color?: string | null }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style={{ backgroundColor: color ?? "#1477ae" }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Minimal safe markdown renderer for job adverts and plan text (##, ###, -, **bold**, paragraphs). */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const inline = (s: string, keyBase: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>
        : <span key={`${keyBase}-${i}`}>{part}</span>
    );
  return (
    <div className={cn("space-y-2", className)}>
      {blocks.map((b, i) => {
        if (b.startsWith("### ")) return <h4 key={i} className="font-semibold text-[--brand-900] mt-3">{inline(b.slice(4), `h4-${i}`)}</h4>;
        if (b.startsWith("## ")) return <h3 key={i} className="font-semibold text-[--brand-900] mt-3">{inline(b.slice(3), `h3-${i}`)}</h3>;
        if (/^[-•] /m.test(b)) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {b.split("\n").filter((l) => /^[-•] /.test(l)).map((l, j) => (
                <li key={j}>{inline(l.replace(/^[-•] /, ""), `li-${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i} className="leading-relaxed">{inline(b, `p-${i}`)}</p>;
      })}
    </div>
  );
}
