import { Link } from "react-router";
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Loading, ErrorState, Chip, fmtTime } from "@/components/common";
import { useAuth } from "@/hooks/useAuth";
import { markWelcomeSeen, startFullTour, welcomeSeen } from "@/tours/tours";
import { Button } from "@/components/ui/button";
import {
  CalendarRange, FileCheck2, Headset, ShieldAlert, ClipboardList,
  Briefcase, HeartHandshake, AlertTriangle, ArrowRight, X, Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StaffRole } from "@db/schema";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<StaffRole, string> = {
  super_admin: "Registered Manager",
  admin: "Office / HR Admin",
  care_coordinator: "Care Coordinator",
  team_leader: "Team Leader",
  supervisor: "Field Supervisor",
  interview_panel: "Interview Panel",
  care_worker: "Care Worker",
  crm_agent: "CRM Agent",
};

type Tile = {
  label: string;
  value: string | number;
  hint: string;
  icon: LucideIcon;
  to: string;
  tone?: "default" | "warn" | "bad" | "good";
};

export default function Dashboard() {
  const { user } = useAuth();
  const q = trpc.core.dashboard.useQuery(undefined, { enabled: !!user });

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const role = d.role as StaffRole;
  const tiles = buildTiles(d, role);
  const spotlight = tiles.slice(0, 4);
  const rest = tiles.slice(4);

  return (
    <div className="space-y-6">
      <section className="uc-hero relative overflow-hidden p-6 sm:p-8" data-tour="page-header">
        <div className="relative z-[1] flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">
              UniqueCare Connect
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {greeting()}, {d.name.split(" ")[0]}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/80 sm:text-[15px]">
              {ROLE_LABELS[role]} · {new Date().toLocaleDateString("en-GB", {
                weekday: "long", day: "numeric", month: "long",
              })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {["super_admin", "admin", "care_coordinator", "team_leader"].includes(role) && (
              <Button asChild size="sm" className="!rounded-xl !bg-white !text-[--brand-700] hover:!bg-white/92" style={{ backgroundImage: "none" }}>
                <Link to="/cqc/plans">Care & support plans</Link>
              </Button>
            )}
            {["super_admin", "admin", "care_coordinator"].includes(role) && (
              <Button asChild size="sm" variant="outline" className="!rounded-xl !border-white/35 !bg-transparent !text-white hover:!bg-white/10">
                <Link to="/rota">Week planner</Link>
              </Button>
            )}
          </div>
        </div>
        {spotlight.length > 0 && (
          <div className="relative z-[1] mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {spotlight.map((t) => (
              <Link
                key={t.label}
                to={t.to}
                className="uc-focus rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm transition hover:bg-white/16"
              >
                <div className="flex items-center justify-between gap-2">
                  <t.icon className="h-4 w-4 text-white/75" strokeWidth={1.85} aria-hidden />
                  <ToneDot tone={t.tone} />
                </div>
                <p className="mt-3 font-display text-2xl font-bold tabular-nums tracking-tight text-white">
                  {t.value}
                </p>
                <p className="mt-1 text-[12px] font-medium leading-snug text-white/75">{t.label}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <WelcomeCard />

      {rest.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-tight text-[--brand-900]">
              More signals
            </h2>
            <p className="text-xs text-[--ink-500]">Tap any card to open the workspace</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rest.map((t) => (
              <Link key={t.label} to={t.to} className="uc-focus rounded-2xl">
                <MetricCard tile={t} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <QuickActions role={role} />
        </div>
        <div className="lg:col-span-3">
          <TodayPanel role={role} />
        </div>
      </div>
    </div>
  );
}

function buildTiles(d: {
  coverage: number; weekVisits: number; unfilled: number; newApplicants: number; liveJobs: number;
  docsToVerify: number; expiringCompliance: number; reviewsDue: number; overdueReviews: number;
  myTickets: number; openTickets: number; myOpenTasks: number; safeguardingOpen: number;
  activeClients: number; activeStaff: number;
}, role: StaffRole): Tile[] {
  const tiles: Tile[] = [];
  if (["super_admin", "admin", "care_coordinator"].includes(role))
    tiles.push({
      label: "Visit coverage this week", value: `${d.coverage}%`,
      hint: `${d.weekVisits} visits scheduled`, icon: CalendarRange, to: "/rota",
      tone: d.coverage >= 98 ? "good" : d.coverage >= 90 ? "warn" : "bad",
    });
  if (["super_admin", "admin", "care_coordinator"].includes(role))
    tiles.push({
      label: "Unfilled visits (7 days)", value: d.unfilled,
      hint: "Need coordinator attention", icon: AlertTriangle, to: "/rota",
      tone: d.unfilled > 0 ? "warn" : "good",
    });
  if (["super_admin", "admin"].includes(role))
    tiles.push({
      label: "New applicants", value: d.newApplicants,
      hint: `${d.liveJobs} live job${d.liveJobs === 1 ? "" : "s"}`, icon: Briefcase, to: "/recruitment/pipeline",
      tone: d.newApplicants > 0 ? "warn" : "default",
    });
  if (["super_admin", "admin"].includes(role))
    tiles.push({
      label: "Documents to verify", value: d.docsToVerify,
      hint: "Recruitment uploads awaiting check", icon: FileCheck2, to: "/recruitment/compliance",
      tone: d.docsToVerify > 0 ? "warn" : "good",
    });
  if (["super_admin", "admin", "care_coordinator", "team_leader"].includes(role))
    tiles.push({
      label: "Expiring documents", value: d.expiringCompliance,
      hint: "Within 30 days — open tracker", icon: FileCheck2, to: "/staff/expiry",
      tone: d.expiringCompliance > 0 ? "warn" : "good",
    });
  if (["super_admin", "admin", "team_leader", "care_coordinator"].includes(role))
    tiles.push({
      label: "Plan reviews due", value: d.reviewsDue,
      hint: `${d.overdueReviews} overdue`, icon: ClipboardList, to: "/cqc/plan-reviews",
      tone: d.overdueReviews > 0 ? "bad" : d.reviewsDue > 0 ? "warn" : "good",
    });
  tiles.push({
    label: "My open tickets", value: d.myTickets,
    hint: `${d.openTickets} open across the service`, icon: Headset, to: "/crm/tickets",
  });
  tiles.push({
    label: "My open tasks", value: d.myOpenTasks,
    hint: "Tasks & follow-ups", icon: ClipboardList, to: "/crm/tasks",
    tone: d.myOpenTasks > 0 ? "warn" : "good",
  });
  if (["super_admin", "admin", "team_leader"].includes(role))
    tiles.push({
      label: "Open safeguarding", value: d.safeguardingOpen,
      hint: "Management visibility only", icon: ShieldAlert, to: "/crm/tickets",
      tone: d.safeguardingOpen > 0 ? "bad" : "good",
    });
  tiles.push({
    label: "Active clients", value: d.activeClients,
    hint: `${d.activeStaff} active staff`, icon: HeartHandshake, to: "/clients",
  });
  return tiles;
}

function ToneDot({ tone }: { tone?: Tile["tone"] }) {
  const c = {
    default: "bg-white/40",
    good: "bg-emerald-300",
    warn: "bg-amber-300",
    bad: "bg-rose-300",
  }[tone ?? "default"];
  return <span className={cn("h-2 w-2 rounded-full", c)} aria-hidden />;
}

function MetricCard({ tile }: { tile: Tile }) {
  const tones = {
    default: "text-[--brand-900]",
    good: "text-emerald-700",
    warn: "text-amber-700",
    bad: "text-red-700",
  };
  const Icon = tile.icon;
  return (
    <div className={cn("uc-stat uc-stat-" + (tile.tone ?? "default"), "w-full p-5 text-left")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="uc-label">{tile.label}</span>
          <div className={cn("mt-2 font-display text-[1.75rem] font-bold tracking-tight tabular-nums", tones[tile.tone ?? "default"])}>
            {tile.value}
          </div>
          <div className="mt-1.5 text-xs leading-snug text-[--ink-500]">{tile.hint}</div>
        </div>
        <span className={`uc-icon-chip uc-icon-chip-${tile.tone ?? "default"} h-11 w-11 shrink-0`} aria-hidden>
          <Icon className="h-5 w-5" strokeWidth={1.85} />
        </span>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function WelcomeCard() {
  const [show, setShow] = useState(() => !welcomeSeen());
  if (!show) return null;
  const dismiss = () => {
    markWelcomeSeen();
    setShow(false);
  };
  return (
    <div
      className="uc-card relative flex flex-col gap-4 overflow-hidden border-[--brand-100] bg-[--brand-50] p-5 sm:flex-row sm:items-center sm:p-6"
      data-testid="welcome-card"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[--brand-600] text-white">
        <Sparkles className="h-5 w-5" strokeWidth={1.85} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-semibold tracking-tight text-[--brand-900]">
          New here? Take the product tour
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[--ink-600]">
          A one-minute walkthrough of every menu and feature. Replay anytime from Help in the top bar.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            dismiss();
            startFullTour();
          }}
        >
          Take the tour
        </Button>
        <Button size="sm" variant="outline" onClick={dismiss}>Maybe later</Button>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss welcome"
        className="uc-focus absolute right-3 top-3 rounded-lg p-1 text-[--ink-500] hover:text-[--brand-900]"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function QuickActions({ role }: { role: StaffRole }) {
  const items: { label: string; to: string }[] = [];
  if (["super_admin", "admin", "care_coordinator"].includes(role))
    items.push({ label: "Open the week planner", to: "/rota" });
  if (["super_admin", "admin"].includes(role))
    items.push({ label: "Review compliance queue", to: "/recruitment/compliance" });
  if (["super_admin", "admin", "crm_agent", "care_coordinator", "team_leader"].includes(role))
    items.push({ label: "Log a new ticket", to: "/crm/tickets" });
  if (["super_admin", "admin", "team_leader", "supervisor"].includes(role))
    items.push({ label: "Record a supervision note", to: "/staff/supervision" });
  items.push({ label: "View my rota", to: "/me" });

  return (
    <div className="uc-card h-full p-5 sm:p-6" data-tour="quick-actions">
      <h2 className="font-display text-lg font-semibold tracking-tight text-[--brand-900]">Quick actions</h2>
      <ul className="mt-4 space-y-1">
        {items.map((i) => (
          <li key={i.to}>
            <Link
              to={i.to}
              className="uc-focus group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-[--brand-900] transition-colors hover:bg-[--brand-50]"
            >
              {i.label}
              <ArrowRight className="h-4 w-4 text-[--ink-500] transition-transform group-hover:translate-x-0.5 group-hover:text-[--brand-600]" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TodayPanel({ role }: { role: StaffRole }) {
  const me = trpc.core.me.useQuery();
  const isWorker = role === "care_worker";
  const myRota = trpc.rota.myRota.useQuery(undefined, { enabled: isWorker });
  const tasks = trpc.crm.myTasks.useQuery(undefined, { enabled: !isWorker });

  return (
    <div className="uc-card h-full p-5 sm:p-6" data-tour="today-panel">
      <h2 className="font-display text-lg font-semibold tracking-tight text-[--brand-900]">
        {isWorker ? "Your visits today" : "Tasks due soon"}
      </h2>
      <div className="mt-4">
        {isWorker ? (
          myRota.isLoading ? <Loading rows={3} /> : <TodayVisits data={myRota.data} />
        ) : tasks.isLoading ? <Loading rows={3} /> : (() => {
          const open = tasks.data ? [...tasks.data.overdue, ...tasks.data.today, ...tasks.data.upcoming] : [];
          if (open.length === 0) {
            return <p className="text-sm text-[--ink-500]">Nothing due. Good shape.</p>;
          }
          return (
            <ul className="space-y-2">
              {open.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-[--card-line] bg-[--app-bg]/60 px-3 py-2.5 text-sm">
                  <span className="truncate font-medium text-[--brand-900]">{t.title}</span>
                  {t.dueAt && (
                    <Chip
                      value={new Date(t.dueAt) < new Date() ? "overdue" : "due"}
                      label={new Date(t.dueAt).toLocaleDateString("en-GB")}
                    />
                  )}
                </li>
              ))}
            </ul>
          );
        })()}
      </div>
      {me.data && (
        <p className="mt-4 border-t border-[--card-line] pt-3 text-xs text-[--ink-500]">
          Signed in as {me.data.fullName}
        </p>
      )}
    </div>
  );
}

function TodayVisits({ data }: { data?: unknown }) {
  const today = new Date().toDateString();
  const visits = (data as {
    id: number;
    client?: { firstName: string; lastName: string } | null;
    scheduledStart: string | Date;
    scheduledEnd: string | Date;
    status: string;
  }[] | undefined) ?? [];
  const todays = visits.filter((v) => new Date(v.scheduledStart).toDateString() === today);
  if (todays.length === 0) {
    return <p className="text-sm text-[--ink-500]">No visits scheduled for today.</p>;
  }
  return (
    <ul className="space-y-2">
      {todays.map((v) => (
        <li key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-[--card-line] bg-[--app-bg]/60 px-3 py-2.5 text-sm">
          <div>
            <p className="font-medium text-[--brand-900]">
              {v.client ? `${v.client.firstName} ${v.client.lastName}` : "Visit"}
            </p>
            <p className="text-xs text-[--ink-500]">
              {fmtTime(v.scheduledStart)} – {fmtTime(v.scheduledEnd)}
            </p>
          </div>
          <Chip value={v.status} />
        </li>
      ))}
    </ul>
  );
}
