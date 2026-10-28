import { Link, useNavigate } from "react-router";
import { MessageSquare, Star, Briefcase, Mail, Newspaper, FileText } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, StatCard, Loading, ErrorState, EmptyState, Chip, fmtDateTime } from "@/components/common";

export default function WebsiteOverview() {
  const navigate = useNavigate();
  const q = trpc.website.dashboard.useQuery();

  if (q.isLoading) return <Loading rows={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const d = q.data!;

  return (
    <div>
      <PageHeader
        title="Website"
        subtitle="Enquiries, reviews, applications and content from the public Unique Care UK website. Registered Manager only."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="New enquiries" value={d.enquiryCounts.new} icon={MessageSquare}
          tone={d.enquiryCounts.new > 0 ? "warn" : "default"}
          hint={`${d.enquiryCounts.total} total · ${d.lastSevenDays.enquiries} in the last 7 days`}
          onClick={() => navigate("/website/enquiries")}
        />
        <StatCard
          label="Reviews awaiting approval" value={d.reviewCounts.pending} icon={Star}
          tone={d.reviewCounts.pending > 0 ? "warn" : "default"}
          hint={`${d.reviewCounts.approved} published · ${d.reviewCounts.rejected} rejected`}
          onClick={() => navigate("/website/reviews")}
        />
        <StatCard
          label="New applications" value={d.applicationCounts.new} icon={Briefcase}
          tone={d.applicationCounts.new > 0 ? "warn" : "default"}
          hint={`${d.applicationCounts.shortlisted} shortlisted · ${d.applicationCounts.total} total`}
          onClick={() => navigate("/website/applications")}
        />
        <StatCard
          label="Active subscribers" value={d.subscriberCounts.active} icon={Mail}
          hint={`${d.lastSevenDays.subscribers} joined in the last 7 days`}
          onClick={() => navigate("/website/subscribers")}
        />
        <StatCard
          label="Newsletter drafts" value={d.newsletterDrafts} icon={Newspaper}
          hint={`${d.subscriberCounts.unsubscribed} unsubscribed`}
          onClick={() => navigate("/website/newsletters")}
        />
        <StatCard
          label="Published posts" value={d.postCounts.published} icon={FileText}
          hint={`${d.postCounts.draft} draft`}
          onClick={() => navigate("/website/posts")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[--brand-900]">Latest enquiries</h2>
            <Link to="/website/enquiries" className="text-xs text-[--brand-600] hover:underline">View all</Link>
          </div>
          {d.recentEnquiries.length === 0 ? <EmptyState title="No enquiries yet" /> : (
            <ul className="uc-card divide-y" style={{ borderColor: "var(--line)" }}>
              {d.recentEnquiries.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3" style={{ borderColor: "var(--line)" }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{e.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{e.message}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{fmtDateTime(e.createdAt)}</p>
                  </div>
                  <Chip value={e.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[--brand-900]">Latest applications</h2>
            <Link to="/website/applications" className="text-xs text-[--brand-600] hover:underline">View all</Link>
          </div>
          {d.recentApplications.length === 0 ? <EmptyState title="No applications yet" /> : (
            <ul className="uc-card divide-y" style={{ borderColor: "var(--line)" }}>
              {d.recentApplications.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-3" style={{ borderColor: "var(--line)" }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.jobTitle}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{fmtDateTime(a.createdAt)}</p>
                  </div>
                  <Chip value={a.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[--brand-900]">Latest reviews</h2>
            <Link to="/website/reviews" className="text-xs text-[--brand-600] hover:underline">View all</Link>
          </div>
          {d.recentReviews.length === 0 ? <EmptyState title="No reviews yet" /> : (
            <ul className="uc-card divide-y" style={{ borderColor: "var(--line)" }}>
              {d.recentReviews.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3" style={{ borderColor: "var(--line)" }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.title} <span className="text-xs font-normal text-muted-foreground">· {r.rating}/5 · {r.name}</span></p>
                    <p className="truncate text-xs text-muted-foreground">{r.body}</p>
                  </div>
                  <Chip value={r.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
