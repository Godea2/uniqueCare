"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import AdminShell from "./AdminShell";

const THEME_KEY = "uc-website-admin-theme";

/**
 * Chooses the admin chrome: bare for /admin/login, full shell otherwise.
 * Also applies the saved theme and removes it again when leaving /admin so
 * dark mode never leaks onto the public site.
 */
export default function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY);
    const dark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    return () => document.documentElement.classList.remove("dark");
  }, []);

  if (pathname === "/admin/login") {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">{children}</main>
    );
  }
  return <AdminShell>{children}</AdminShell>;
}
