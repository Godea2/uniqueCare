import type { Metadata } from "next";
import AdminFrame from "@/components/admin/AdminFrame";

export const metadata: Metadata = {
  title: { default: "Admin | Unique Care UK", template: "%s | Unique Care UK Admin" },
  robots: { index: false, follow: false, nocache: true },
};

// Admin pages are per-user and must never be statically cached.
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Authentication is enforced by middleware.ts (cookie check) and by
  // requireAdminSession() in every /api/admin route. The login page renders
  // without the shell; AdminFrame picks the right chrome from the pathname.
  return <AdminFrame>{children}</AdminFrame>;
}
