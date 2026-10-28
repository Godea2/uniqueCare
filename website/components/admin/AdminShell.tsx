"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  LayoutDashboard, MessageSquare, Star, Briefcase, Users, Mail,
  FileText, ScrollText, Search, Link2, Menu, X, LogOut,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { AdminToastProvider } from "./AdminToast";

type Dash = {
  enquiryCounts?: { new: number };
  reviewCounts?: { pending: number };
  applicationCounts?: { new: number };
};

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/reviews", label: "Reviews", icon: Star, badgeKey: "reviews" as const },
  { href: "/admin/enquiries", label: "Enquiries", icon: MessageSquare, badgeKey: "enquiries" as const },
  { href: "/admin/applications", label: "Applications", icon: Briefcase, badgeKey: "applications" as const },
  { href: "/admin/subscribers", label: "Subscribers", icon: Users },
  { href: "/admin/newsletters", label: "Newsletters", icon: Mail },
  { href: "/admin/posts", label: "Blog Posts", icon: FileText },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
  { href: "/admin/seo", label: "On-Page SEO", icon: Search },
  { href: "/admin/seo/offpage", label: "Off-Page SEO", icon: Link2 },
];

const AdminBadgesContext = createContext<() => void>(() => {});

export function useRefreshAdminBadges() {
  return useContext(AdminBadgesContext);
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [dash, setDash] = useState<Dash>({});
  const [open, setOpen] = useState(false);

  const refreshBadges = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard");
      if (!res.ok) return;
      setDash(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refreshBadges(); }, [refreshBadges, pathname]);
  useEffect(() => { setOpen(false); }, [pathname]);

  const logout = async () => {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.replace("/admin/login");
  };

  const badgeFor = (key?: "reviews" | "enquiries" | "applications") => {
    if (key === "reviews") return dash.reviewCounts?.pending ?? 0;
    if (key === "enquiries") return dash.enquiryCounts?.new ?? 0;
    if (key === "applications") return dash.applicationCounts?.new ?? 0;
    return 0;
  };

  const nav = (
    <>
      <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-700">
        <p className="font-heading text-lg font-semibold text-[--brand-primary]">Unique Care UK</p>
        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Admin</p>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {NAV.map((item) => {
          const active = pathname === item.href
            || (item.href !== "/admin/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          const count = badgeFor(item.badgeKey);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-[--brand-soft] text-[--brand-primary-dark] dark:bg-slate-800 dark:text-sky-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" />
              <span className="flex-1">{item.label}</span>
              {count > 0 && (
                <span className="rounded-full bg-[--brand-primary] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-1 border-t border-slate-200 p-3 dark:border-slate-700">
        <ThemeToggle className="w-full justify-start" />
        <button
          type="button"
          onClick={logout}
          className="inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </>
  );

  return (
    <AdminToastProvider>
      <AdminBadgesContext.Provider value={refreshBadges}>
        <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex">
            {nav}
          </aside>

          {open && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setOpen(false)} />
              <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl dark:bg-slate-900">
                <div className="flex justify-end p-2">
                  <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                {nav}
              </aside>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 lg:hidden">
              <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </button>
              <span className="font-heading font-semibold text-[--brand-primary]">Admin</span>
            </header>
            <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
          </div>
        </div>
      </AdminBadgesContext.Provider>
    </AdminToastProvider>
  );
}
