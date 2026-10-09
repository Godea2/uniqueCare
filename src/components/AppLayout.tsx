import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate, Link } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, CalendarDays, ShieldCheck, Headset, Briefcase,
  Settings, ScrollText, Bell, Search, LogOut, UserCog, ClipboardList,
  CalendarRange, Stethoscope, FileCheck2, GraduationCap, Network,
  ClipboardCheck, Star, AlertTriangle, FileText, ChevronDown, PhoneCall,
} from "lucide-react";
import { AvatarDot } from "./common";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { AuthLayoutSkeleton } from "./AuthLayoutSkeleton";
import { LOGIN_PATH } from "@/const";
import type { StaffRole } from "@db/schema";

type NavItem = { label: string; path: string; icon: React.ElementType; roles?: StaffRole[] };
type NavGroup = { group: string; items: NavItem[] };

const ALL: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader", "supervisor", "interview_panel", "care_worker", "crm_agent"];
const OFFICE: StaffRole[] = ["super_admin", "admin"];
const MGMT: StaffRole[] = ["super_admin", "admin", "team_leader"];

const NAV: NavGroup[] = [
  {
    group: "Overview",
    items: [{ label: "Dashboard", path: "/", icon: LayoutDashboard, roles: ALL }],
  },
  {
    group: "Recruitment",
    items: [
      { label: "Jobs", path: "/recruitment/jobs", icon: Briefcase, roles: OFFICE },
      { label: "Application forms", path: "/recruitment/forms", icon: FileText, roles: OFFICE },
      { label: "Pipeline", path: "/recruitment/pipeline", icon: Network, roles: OFFICE },
      { label: "Interviews", path: "/recruitment/interviews", icon: CalendarDays, roles: ["super_admin", "admin", "interview_panel", "team_leader"] },
      { label: "Compliance checks", path: "/recruitment/compliance", icon: FileCheck2, roles: OFFICE },
      { label: "Training", path: "/recruitment/training", icon: GraduationCap, roles: OFFICE },
    ],
  },
  {
    group: "Staff",
    items: [
      { label: "Directory", path: "/staff", icon: Users, roles: ["super_admin", "admin", "care_coordinator", "team_leader", "supervisor"] },
      { label: "Compliance matrix", path: "/staff/compliance", icon: ClipboardCheck, roles: MGMT },
      { label: "Supervision notes", path: "/staff/supervision", icon: ClipboardList, roles: ["super_admin", "admin", "team_leader", "supervisor"] },
      { label: "Appraisals", path: "/staff/appraisals", icon: Star, roles: MGMT },
    ],
  },
  {
    group: "Clients",
    items: [
      { label: "Directory", path: "/clients", icon: Users, roles: ["super_admin", "admin", "care_coordinator", "team_leader", "supervisor", "crm_agent"] },
      { label: "Care plans", path: "/clients/care-plans", icon: FileText, roles: ["super_admin", "admin", "team_leader", "care_coordinator"] },
      { label: "Support plans", path: "/clients/support-plans", icon: FileText, roles: ["super_admin", "admin", "team_leader"] },
      { label: "Reviews", path: "/clients/reviews", icon: CalendarDays, roles: MGMT },
      { label: "Change events", path: "/clients/change-events", icon: AlertTriangle, roles: MGMT },
    ],
  },
  {
    group: "Rota",
    items: [
      { label: "Week planner", path: "/rota", icon: CalendarRange, roles: ["super_admin", "admin", "care_coordinator"] },
      { label: "Reassignments", path: "/rota/reassignments", icon: CalendarDays, roles: ["super_admin", "admin", "care_coordinator"] },
      { label: "My Rota", path: "/me", icon: CalendarDays, roles: ALL },
    ],
  },
  {
    group: "CRM & Helpdesk",
    items: [
      { label: "Tickets", path: "/crm/tickets", icon: Headset, roles: ["super_admin", "admin", "crm_agent", "care_coordinator", "team_leader"] },
      { label: "Contacts", path: "/crm/contacts", icon: PhoneCall, roles: ["super_admin", "admin", "crm_agent", "care_coordinator", "team_leader"] },
      { label: "Tasks", path: "/crm/tasks", icon: ClipboardList, roles: ALL },
      { label: "Reports", path: "/crm/reports", icon: ScrollText, roles: MGMT.concat(["crm_agent", "care_coordinator"]) },
    ],
  },
  {
    group: "CQC",
    items: [
      { label: "Readiness dashboard", path: "/cqc", icon: ShieldCheck, roles: MGMT },
      { label: "Incidents", path: "/cqc/incidents", icon: AlertTriangle, roles: MGMT.concat(["supervisor"]) },
      { label: "Inspection pack", path: "/cqc/inspection-pack", icon: Stethoscope, roles: ["super_admin", "admin"] },
    ],
  },
  {
    group: "System",
    items: [
      { label: "Settings", path: "/settings", icon: Settings, roles: ["super_admin"] },
      { label: "Audit log", path: "/audit", icon: ScrollText, roles: ["super_admin", "admin"] },
    ],
  },
];

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

export default function AppLayout({ children }: { children: ReactNode }) {
  const { isLoading, user, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: LOGIN_PATH });
  const location = useLocation();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const meQ = trpc.core.me.useQuery(undefined, { enabled: !!user, retry: 1 });
  const notifQ = trpc.core.myNotifications.useQuery(undefined, {
    enabled: !!user && !!meQ.data, refetchInterval: 30000,
  });
  const setRole = trpc.core.setRole.useMutation({
    onSuccess: () => utils.invalidate(),
  });
  const markRead = trpc.core.markNotificationRead.useMutation({
    onSuccess: () => utils.core.myNotifications.invalidate(),
  });
  const markAll = trpc.core.markAllRead.useMutation({
    onSuccess: () => utils.core.myNotifications.invalidate(),
  });

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const search = trpc.core.globalSearch.useQuery({ q: searchQ }, { enabled: searchQ.length > 1 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const role = meQ.data?.role as StaffRole | undefined;
  const groups = useMemo(
    () =>
      NAV.map((g) => ({
        ...g,
        items: g.items.filter((i) => !i.roles || (role && i.roles.includes(role))),
      })).filter((g) => g.items.length > 0),
    [role],
  );
  const unread = (notifQ.data ?? []).filter((n) => !n.readAt).length;

  if (isLoading || (user && meQ.isLoading)) return <AuthLayoutSkeleton />;
  if (!user) return null;
  const staff = meQ.data;
  const canSwitchRole = staff?.role === "super_admin" || staff?.role === "admin";

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "var(--app-bg)" }}>
      {/* ── Dark top bar (full width) ── */}
      <header className="no-print sticky top-0 z-40 flex h-14 items-center gap-3 px-4 md:px-5"
        style={{ backgroundColor: "var(--topbar)" }}>
        <Link to="/" className="flex items-center gap-2 uc-focus rounded-md shrink-0" aria-label="UniqueCare Connect home">
          <img src="/logo-white.png" alt="Unique Care UK" className="h-7 w-auto" />
        </Link>

        <button
          onClick={() => setSearchOpen(true)}
          className="uc-focus ml-2 hidden sm:flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.07] px-4 py-1.5 text-[13px] text-white/60 w-80 hover:bg-white/[0.12] hover:text-white/80 transition-colors"
        >
          <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          <span>Search clients, staff, tickets…</span>
          <kbd className="ml-auto rounded-full border border-white/15 px-1.5 py-0.5 text-[10px] text-white/50">⌘K</kbd>
        </button>

        <div className="ml-auto flex items-center gap-2">
          {canSwitchRole && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="uc-focus flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3.5 py-1.5 text-xs font-medium text-white/85 hover:bg-white/[0.12] transition-colors">
                  <UserCog className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  {role ? ROLE_LABELS[role] : "…"}
                  <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                <DropdownMenuLabel>View app as role</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(Object.keys(ROLE_LABELS) as StaffRole[]).map((r) => (
                  <DropdownMenuItem key={r} onClick={() => setRole.mutate({ role: r })} className="cursor-pointer rounded-lg">
                    <span className={cn("flex-1", r === role && "font-semibold text-[--brand-700]")}>{ROLE_LABELS[r]}</span>
                    {r === role && <span className="text-[--brand-600]">●</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button variant="outline" size="icon" className="sm:hidden rounded-full border-white/15 bg-white/[0.07] text-white/80 hover:bg-white/[0.12] hover:text-white" onClick={() => setSearchOpen(true)} aria-label="Search">
            <Search className="h-4 w-4" strokeWidth={1.75} />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="uc-focus relative flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] hover:bg-white/[0.12] transition-colors" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
                <Bell className="h-4 w-4 text-white/85" strokeWidth={1.75} aria-hidden />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2" style={{ ["--tw-ring-color" as never]: "var(--topbar)" }}>
                    {unread}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-96 max-h-96 overflow-y-auto rounded-xl">
              <DropdownMenuLabel className="flex items-center justify-between">
                Notifications
                {unread > 0 && (
                  <button className="text-xs text-[--brand-600] font-normal hover:underline" onClick={() => markAll.mutate()}>
                    Mark all read
                  </button>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(notifQ.data ?? []).length === 0 && (
                <p className="px-3 py-6 text-sm text-muted-foreground text-center">No notifications yet.</p>
              )}
              {(notifQ.data ?? []).slice(0, 20).map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  className={cn("flex flex-col items-start gap-0.5 cursor-pointer py-2.5 rounded-lg", !n.readAt && "bg-[--brand-50]")}
                  onClick={() => {
                    markRead.mutate({ id: Number(n.id) });
                    if (n.link) navigate(n.link);
                  }}
                >
                  <span className="text-sm font-medium leading-tight">{n.title}</span>
                  {n.body && <span className="text-xs text-muted-foreground line-clamp-2">{n.body}</span>}
                  <span className="text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleString("en-GB")}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="uc-focus flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-white/[0.08] transition-colors">
                <AvatarDot name={staff?.fullName ?? user.name ?? "?"} color={staff?.avatarColor} />
                <div className="hidden lg:block text-left">
                  <p className="text-[13px] font-medium leading-tight text-white/90">{staff?.fullName ?? user.name}</p>
                  <p className="text-[11px] text-white/50 leading-tight">{role ? ROLE_LABELS[role] : ""}</p>
                </div>
                <ChevronDown className="h-3 w-3 text-white/50" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-xl">
              <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/me")} className="cursor-pointer rounded-lg">My rota & profile</DropdownMenuItem>
              <DropdownMenuItem onClick={logout} className="cursor-pointer rounded-lg text-red-700 focus:text-red-700">
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex">
        {/* ── Light sidebar with pill nav ── */}
        <aside className="no-print hidden md:flex w-64 shrink-0 flex-col sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto"
          style={{ backgroundColor: "var(--app-bg)" }}>
          <nav className="flex-1 px-3 py-4" aria-label="Main">
            {groups.map((g) => {
              const isCollapsed = collapsed[g.group] ?? false;
              const singleton = g.group === "Overview";
              return (
                <div key={g.group} className="mt-1 first:mt-0">
                  {!singleton && (
                    <button
                      onClick={() => setCollapsed((s) => ({ ...s, [g.group]: !isCollapsed }))}
                      className="uc-focus flex w-full items-center justify-between rounded-full px-3 py-2 text-[12px] font-medium text-slate-500 hover:text-slate-700 transition-colors"
                      aria-expanded={!isCollapsed}
                    >
                      {g.group}
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isCollapsed && "-rotate-90")} strokeWidth={1.75} aria-hidden />
                    </button>
                  )}
                  {!isCollapsed && g.items.map((item) => {
                    const active = location.pathname === item.path ||
                      (item.path !== "/" && location.pathname.startsWith(item.path));
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={cn(
                          "mb-0.5 flex items-center gap-3 rounded-full px-4 py-2.5 text-[13.5px] transition-all uc-focus",
                          active
                            ? "bg-white text-slate-900 font-medium shadow-[0_1px_3px_rgb(15_18_35/0.08),0_1px_2px_rgb(15_18_35/0.04)]"
                            : "text-slate-600 hover:bg-white/70 hover:text-slate-900",
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        <item.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-[--brand-700]" : "text-slate-500")} strokeWidth={1.75} aria-hidden />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>
          <div className="px-6 py-4 text-[11px] text-slate-400">
            UniqueCare Connect · v1.0
            <br />CQC-registered · Data: UK
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>

      {/* ── Global search ── */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Search clients, staff, contacts, tickets, candidates…" value={searchQ} onValueChange={setSearchQ} />
        <CommandList>
          <CommandEmpty>{searchQ.length < 2 ? "Type at least 2 characters…" : "No results found."}</CommandEmpty>
          {search.data && (
            <>
              {search.data.clients.length > 0 && (
                <CommandGroup heading="Clients">
                  {search.data.clients.map((c) => (
                    <CommandItem key={c.id} onSelect={() => { navigate(`/clients/${c.id}`); setSearchOpen(false); }}>
                      {c.firstName} {c.lastName} <span className="ml-2 text-xs text-muted-foreground">{c.clientRef} · {c.postcode}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {search.data.staff.length > 0 && (
                <CommandGroup heading="Staff">
                  {search.data.staff.map((s2) => (
                    <CommandItem key={s2.id} onSelect={() => { navigate(`/staff`); setSearchOpen(false); }}>
                      {s2.fullName} <span className="ml-2 text-xs text-muted-foreground">{s2.jobTitle}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {search.data.contacts.length > 0 && (
                <CommandGroup heading="CRM contacts">
                  {search.data.contacts.map((c) => (
                    <CommandItem key={c.id} onSelect={() => { navigate(`/crm/contacts/${c.id}`); setSearchOpen(false); }}>
                      {c.firstName} {c.lastName} <span className="ml-2 text-xs text-muted-foreground">{c.phone ?? c.email}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {search.data.tickets.length > 0 && (
                <CommandGroup heading="Tickets">
                  {search.data.tickets.map((t) => (
                    <CommandItem key={t.id} onSelect={() => { navigate(`/crm/tickets/${t.id}`); setSearchOpen(false); }}>
                      {t.ticketNo} — {t.subject}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {search.data.candidates.length > 0 && (
                <CommandGroup heading="Candidates">
                  {search.data.candidates.map((c) => (
                    <CommandItem key={c.id} onSelect={() => { navigate(`/recruitment/pipeline`); setSearchOpen(false); }}>
                      {c.firstName} {c.lastName} <span className="ml-2 text-xs text-muted-foreground">{c.email}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </div>
  );
}
