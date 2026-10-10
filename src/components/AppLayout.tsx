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
  HelpCircle, Map, Compass, Menu, X,
} from "lucide-react";
import { AvatarDot } from "./common";
import { startFullTour, startPageTour } from "@/tours/tours";
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
    enabled: !!user && (meQ.data?.status === "active" || meQ.data?.status === "onboarding") && !meQ.data?.deletedAt,
    refetchInterval: 30000,
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
  // Groups start collapsed; the one holding the current page opens until the user toggles it.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [mobileNav, setMobileNav] = useState(false);
  const search = trpc.core.globalSearch.useQuery({ q: searchQ }, { enabled: searchQ.length > 1 });

  // Close the mobile drawer whenever the route changes
  useEffect(() => { setMobileNav(false); }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") setMobileNav(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileNav ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileNav]);

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
  const realRole = staff?.homeRole ?? staff?.role;
  const canSwitchRole = realRole === "super_admin" || realRole === "admin";

  if (staff && (staff.status === "pending" || staff.status === "left" || staff.deletedAt)) {
    const pendingApproval = staff.status === "pending";
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ backgroundColor: "var(--frame-bg)" }}>
        <div className="uc-card max-w-md p-8 text-center">
          <img src="/logo.png" alt="Unique Care UK" className="mx-auto mb-6 h-10 w-auto" />
          <h1 className="text-lg font-semibold text-[--brand-900]">
            {pendingApproval ? "Your account is awaiting approval" : "Your account is no longer active"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {pendingApproval
              ? `You're signed in as ${user.email}. A manager has been notified and will give you access shortly.`
              : "Please contact the office if you think this is a mistake."}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            {pendingApproval && <Button variant="outline" onClick={() => meQ.refetch()}>Check again</Button>}
            <Button onClick={logout}>Sign out</Button>
          </div>
        </div>
      </div>
    );
  }

  // Shared sidebar body — used by the desktop rail and the mobile drawer.
  // onNavigate is passed by the drawer so tapping a link closes it.
  const sidebarBody = (onNavigate?: () => void) => (
    <>
      <div className="px-5 pb-3 pt-5 flex items-center justify-between">
        <Link to="/" data-tour="shell-home" onClick={onNavigate} className="flex items-center gap-2 uc-focus rounded-md" aria-label="UniqueCare Connect home">
          <img src="/logo-white.png" alt="Unique Care UK" className="h-8 w-auto" />
        </Link>
        {onNavigate && (
          <button
            onClick={onNavigate}
            aria-label="Close menu"
            className="uc-focus flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>
      <div className="px-3 pb-3">
        <div className="uc-side-profile flex items-center gap-3 p-3">
          <AvatarDot name={staff?.fullName ?? user.name ?? "?"} color={staff?.avatarColor} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-white">{staff?.fullName ?? user.name}</p>
            <p className="truncate text-[11px] text-white/55">{role ? ROLE_LABELS[role] : ""}</p>
          </div>
          <button
            onClick={logout}
            aria-label="Sign out"
            className="uc-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </div>
      <nav className="flex-1 px-3 pb-4" aria-label="Main">
        {groups.map((g) => {
          const singleton = g.group === "Overview";
          const holdsCurrentPage = g.items.some((item) =>
            location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path)));
          const isCollapsed = !singleton && !(expanded[g.group] ?? holdsCurrentPage);
          const groupKey = g.group.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
          return (
            <div key={g.group} className="mt-1 first:mt-0" data-tour-group={groupKey}>
              {!singleton && (
                <button
                  onClick={() => setExpanded((s) => ({ ...s, [g.group]: isCollapsed }))}
                  className="uc-focus uc-side-group flex w-full items-center justify-between rounded-full px-3 py-2 text-[12px] font-medium transition-colors"
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
                    onClick={onNavigate}
                    className={cn(
                      "mb-0.5 flex items-center gap-3 rounded-full px-4 py-2.5 text-[13.5px] uc-focus",
                      active ? "uc-nav-active font-medium" : "uc-side-link",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="px-3 pb-4">
        <p className="px-2 pt-3 text-[10px] leading-relaxed text-white/35">
          UniqueCare Connect · v1.0 · CQC-registered · Data: UK
        </p>
      </div>
    </>
  );

  return (
    <div className="min-h-screen w-full md:p-4" style={{ backgroundColor: "var(--frame-bg)" }}>
      <div className="uc-frame flex min-h-screen md:min-h-0 md:h-[calc(100vh-2rem)] max-md:!rounded-none" style={{ backgroundColor: "var(--app-bg)" }}>
      {/* ── Colour-rail sidebar: logo + profile top, nav below ── */}
      <aside data-tour="shell-nav" className="no-print uc-sidebar hidden md:flex w-64 shrink-0 flex-col overflow-y-auto">
        {sidebarBody()}
      </aside>

      {/* ── Mobile drawer nav ── */}
      {mobileNav && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40 uc-fade-in" onClick={() => setMobileNav(false)} aria-hidden />
          <aside className="uc-sidebar uc-slide-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto shadow-2xl">
            {sidebarBody(() => setMobileNav(false))}
          </aside>
        </div>
      )}

      {/* ── Right column: white header + scrolling content ── */}
      <div className="flex min-w-0 flex-1 flex-col">
      <header className="no-print uc-topbar sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-6">
        <button
          className="uc-focus uc-topbar-circle h-9 w-9 shrink-0 md:hidden"
          onClick={() => setMobileNav(true)}
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </button>
        <Link to="/" className="flex md:hidden items-center gap-2 uc-focus rounded-md shrink-0" aria-label="UniqueCare Connect home">
          <img src="/logo.png" alt="Unique Care UK" className="h-7 w-auto" />
        </Link>

        <button
          data-tour="shell-search"
          onClick={() => setSearchOpen(true)}
          className="uc-focus uc-topbar-pill ml-2 hidden sm:flex items-center gap-2.5 rounded-full px-4 py-2 text-[13px] w-80"
        >
          <Search className="h-4 w-4 text-[#8a94ab]" strokeWidth={1.75} aria-hidden />
          <span className="text-[#8a94ab]">Search clients, staff, tickets…</span>
          <kbd className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[10px] text-[#8a94ab] shadow-sm">⌘K</kbd>
        </button>

        <div className="ml-auto flex items-center gap-2">
          {canSwitchRole && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button data-tour="shell-role" className="uc-focus uc-topbar-pill flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium">
                  <UserCog className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  <span className="hidden sm:inline">{role ? ROLE_LABELS[role] : "…"}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                <DropdownMenuLabel>View app as role</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(Object.keys(ROLE_LABELS) as StaffRole[]).filter((r) => realRole === "super_admin" || r !== "super_admin").map((r) => (
                  <DropdownMenuItem key={r} onClick={() => setRole.mutate({ role: r })} className="cursor-pointer rounded-lg">
                    <span className={cn("flex-1", r === role && "font-semibold text-[--brand-700]")}>{ROLE_LABELS[r]}</span>
                    {r === role && <span className="text-[--brand-600]">●</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button variant="outline" size="icon" className="sm:hidden rounded-full border-transparent bg-[#f1f3f9] text-[#4a5468] hover:bg-[#e8ecf6]" onClick={() => setSearchOpen(true)} aria-label="Search">
            <Search className="h-4 w-4" strokeWidth={1.75} />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-tour="shell-notifications" className="uc-focus uc-topbar-circle relative h-9 w-9" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
                <Bell className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                    {unread}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-96 max-w-[calc(100vw-1.5rem)] max-h-[70vh] overflow-y-auto rounded-xl">
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

          {/* ── Help & guided tours ── */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-tour="shell-help" className="uc-focus uc-topbar-circle h-9 w-9" aria-label="Help and tours">
                <HelpCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-xl">
              <DropdownMenuLabel>Help & tours</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={() => startPageTour(location.pathname)}>
                <Compass className="mr-2 h-4 w-4 text-[--brand-600]" aria-hidden />
                <div>
                  <p className="text-sm font-medium">Tour this page</p>
                  <p className="text-[11px] text-muted-foreground">A quick walkthrough of what you're viewing</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={() => startFullTour()}>
                <Map className="mr-2 h-4 w-4 text-[--brand-600]" aria-hidden />
                <div>
                  <p className="text-sm font-medium">Full product tour</p>
                  <p className="text-[11px] text-muted-foreground">Every menu and feature, end to end</p>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-tour="shell-account" className="uc-focus flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-[#f1f3f9] transition-colors">
                <AvatarDot name={staff?.fullName ?? user.name ?? "?"} color={staff?.avatarColor} />
                <div className="hidden lg:block text-left">
                  <p className="text-[13px] font-medium leading-tight text-[--ink-900]">{staff?.fullName ?? user.name}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{role ? ROLE_LABELS[role] : ""}</p>
                </div>
                <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
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

      {/* ── Main content ── */}
      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div key={location.pathname} className="uc-page-enter">{children}</div>
      </main>
      </div>
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
                    <CommandItem key={c.id} onSelect={() => { navigate(c.applicationId ? `/recruitment/pipeline/${c.applicationId}` : "/recruitment/pipeline"); setSearchOpen(false); }}>
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
