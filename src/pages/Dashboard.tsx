import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { PageHeader, StatCard, Loading, ErrorState, Chip } from "@/components/common";
import { useAuth } from "@/hooks/useAuth";
import {
  CalendarRange, FileCheck2, Headset, ShieldAlert, ClipboardList,
  Briefcase, HeartHandshake, AlertTriangle, ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StaffRole } from "@db/schema";

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

export default function Dashboard() {
  const { user } = useAuth();
  const q = trpc.core.dashboard.useQuery(undefined, { enabled: !!user });

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const role = d.role as StaffRole;

  const tiles: { label: string; value: string | number; hint: string; icon: LucideIcon; to: string; tone?: "default" | "warn" | "bad" | "good" }[] = [];

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
      hint: `${d.expiringCompliance} expiring within 30 days`, icon: FileCheck2, to: "/recruitment/compliance",
      tone: d.docsToVerify > 0 ? "warn" : "good",
    });
  if (["super_admin", "admin", "team_leader"].includes(role))
    tiles.push({
      label: "Plan reviews due", value: d.reviewsDue,
      hint: `${d.overdueReviews} overdue`, icon: ClipboardList, to: "/clients/reviews",
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${d.name.split(" ")[0]}`}
        subtitle={ROLE_LABELS[role]}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to} className="uc-focus rounded-xl">
            <StatCard label={t.label} value={t.value} hint={t.hint} icon={t.icon} tone={t.tone} />
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <QuickActions role={role} />
        <TodayPanel role={role} />
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
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
    <div className="uc-card p-5">
      <h2 className="uc-label mb-3">Quick actions</h2>
      <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
        {items.map((i) => (
          <li key={i.to}>
            <Link to={i.to} className="uc-focus flex items-center justify-between py-2.5 text-sm font-medium text-[--brand-900] hover:text-[--brand-600]">
              {i.label}
              <ArrowRight className="h-4 w-4 opacity-50" aria-hidden />
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
    <div className="uc-card p-5">
      <h2 className="uc-label mb-3">
        {isWorker ? "Your visits today" : "Tasks due soon"}
      </h2>
      {isWorker ? (
        myRota.isLoading ? <Loading rows={3} /> : (
          <TodayVisits data={myRota.data} />
        )
      ) : tasks.isLoading ? <Loading rows={3} /> : (() => {
        const open = tasks.data ? [...tasks.data.overdue, ...tasks.data.today, ...tasks.data.upcoming] : [];
        return (
          <ul className="space-y-2">
            {open.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium truncate">{t.title}</span>
                {t.dueAt && <Chip value={new Date(t.dueAt) < new Date() ? "overdue" : "due"} label={new Date(t.dueAt).toLocaleDateString("en-GB")} />}
              </li>
            ))}
            {open.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing due. Good shape.</p>
            )}
          </ul>
        );
      })()}
      {me.data && (
        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground" style={{ borderColor: "var(--line)" }}>
          Signed in as {me.data.fullName}
        </p>
      )}
    </div>
  );
}

function TodayVisits({ data }: { data?: unknown }) {
  const today = new Date().toDateString();
  const visits = (data as { id: number; client?: { firstName: string; lastName: string } | null; scheduledStart: string | Date; scheduledEnd: string | Date; status: string }[] | undefined) ?? [];
  const todays = visits.filter((v) => new Date(v.scheduledStart).toDateString() === today);
  if (todays.length === 0)
    return <p className="text-sm text-muted-foreground">No visits scheduled for today.</p>;
  return (
    <ul className="space-y-2">
      {todays.map((v) => (
        <li key={v.id} className="flex items-center justify-between gap-3 text-sm">
          <div>
            <p className="font-medium">{v.client ? `${v.client.firstName} ${v.client.lastName}` : "Visit"}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(v.scheduledStart).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              {" – "}
              {new Date(v.scheduledEnd).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <Chip value={v.status} />
        </li>
      ))}
    </ul>
  );
}
