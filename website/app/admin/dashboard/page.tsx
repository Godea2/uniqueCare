"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Briefcase, Loader2, MessageSquare, RefreshCw, Star, Users } from "lucide-react";
import { adminFetch, errorMessage, fmtDateTime } from "@/lib/admin/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { useRefreshAdminBadges } from "@/components/admin/AdminShell";
import { ErrorBlock, LoadingBlock, PageHeader, StatusBadge, btnGhost, card } from "@/components/admin/ui";

type Dashboard = {
  enquiryCounts: { new: number; read: number; replied: number; total: number };
  reviewCounts: { pending: number; approved: number; rejected: number };
  subscriberCounts: { active: number; unsubscribed: number };
  applicationCounts: { new: number; reviewing: number; shortlisted: number; rejected: number; total: number };
  recentEnquiries: { id: string; name: string; email: string; message: string; status: string; createdAt: string; relative: string }[];
  recentApplications: { id: number; name: string; email: string; jobTitle: string; status: string; createdAt: string; relative: string }[];
  newSinceLastLogin: { enquiries: number; reviews: number; applications: number; subscribers: number; lastLoginAt: string | null };
};

function StatCard({
  href,
  label,
  value,
  sub,
  icon: Icon,
  highlight,
}: {
  href: string;
  label: string;
  value: number;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <Link href={href} className={`${card} group block p-5 transition hover:border-brand-primary`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
        <span className="rounded-lg bg-brand-soft p-2 text-brand-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={`mt-3 font-heading text-3xl font-semibold ${highlight && value > 0 ? "text-brand-primary" : "text-slate-900 dark:text-white"}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>
    </Link>
  );
}

export default function DashboardPage() {
  const toast = useAdminToast();
  const refreshBadges = useRefreshAdminBadges();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (manual = false) => {
      setRefreshing(true);
      try {
        setData(await adminFetch<Dashboard>("/api/admin/dashboard"));
        setError(null);
        if (manual) {
          refreshBadges();
          toast.push("ok", "Dashboard refreshed");
        }
      } catch (e) {
        setError(errorMessage(e));
        if (manual) toast.push("err", errorMessage(e));
      } finally {
        setRefreshing(false);
      }
    },
    [refreshBadges, toast],
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const n = data?.newSinceLastLogin;
  const newTotal = n ? n.enquiries + n.reviews + n.applications + n.subscribers : 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="An overview of enquiries, reviews, applications and subscribers."
        actions={
          <button type="button" onClick={() => load(true)} disabled={refreshing} className={btnGhost}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
          </button>
        }
      />

      {error && <div className="mb-4"><ErrorBlock message={error} onRetry={() => load(true)} /></div>}
      {!data && !error && <LoadingBlock />}

      {data && (
        <div className="space-y-6">
          {n && newTotal > 0 && (
            <div className="rounded-xl border border-brand-primary/30 bg-brand-soft px-4 py-3 text-sm text-brand-primary-dark dark:text-sky-200">
              <strong>New since your last login{n.lastLoginAt ? ` (${fmtDateTime(n.lastLoginAt)})` : ""}:</strong>{" "}
              {[
                n.enquiries && `${n.enquiries} enquir${n.enquiries === 1 ? "y" : "ies"}`,
                n.reviews && `${n.reviews} review${n.reviews === 1 ? "" : "s"}`,
                n.applications && `${n.applications} application${n.applications === 1 ? "" : "s"}`,
                n.subscribers && `${n.subscribers} subscriber${n.subscribers === 1 ? "" : "s"}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              href="/admin/enquiries"
              label="New enquiries"
              value={data.enquiryCounts.new}
              sub={`${data.enquiryCounts.total} total · ${data.enquiryCounts.replied} replied`}
              icon={MessageSquare}
              highlight
            />
            <StatCard
              href="/admin/reviews"
              label="Reviews to moderate"
              value={data.reviewCounts.pending}
              sub={`${data.reviewCounts.approved} approved · ${data.reviewCounts.rejected} rejected`}
              icon={Star}
              highlight
            />
            <StatCard
              href="/admin/applications"
              label="New applications"
              value={data.applicationCounts.new}
              sub={`${data.applicationCounts.total} total · ${data.applicationCounts.shortlisted} shortlisted`}
              icon={Briefcase}
              highlight
            />
            <StatCard
              href="/admin/subscribers"
              label="Active subscribers"
              value={data.subscriberCounts.active}
              sub={`${data.subscriberCounts.unsubscribed} unsubscribed`}
              icon={Users}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className={card} aria-labelledby="recent-enq">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <h2 id="recent-enq" className="font-heading text-lg font-semibold">Recent enquiries</h2>
                <Link href="/admin/enquiries" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primary hover:underline">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {data.recentEnquiries.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-500">No enquiries yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.recentEnquiries.map((e) => (
                    <li key={e.id}>
                      <Link href="/admin/enquiries" className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{e.name}</span>
                          <StatusBadge status={e.status} />
                        </div>
                        <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{e.message}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{e.email} · {e.relative}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={card} aria-labelledby="recent-app">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <h2 id="recent-app" className="font-heading text-lg font-semibold">Recent applications</h2>
                <Link href="/admin/applications" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primary hover:underline">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {data.recentApplications.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-500">No applications yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.recentApplications.map((a) => (
                    <li key={a.id}>
                      <Link href="/admin/applications" className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{a.name}</span>
                          <StatusBadge status={a.status} />
                        </div>
                        <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{a.jobTitle}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{a.email} · {a.relative}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
