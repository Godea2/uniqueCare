import { withAdmin, humaniseJobSlug, relativeTime } from "@/lib/admin/http";
import { adminCount, adminSelect, adminSelectOne } from "@/lib/admin/db";

export const dynamic = "force-dynamic";

type Enquiry = {
  id: string;
  full_name: string;
  email: string;
  message: string;
  status: string;
  created_at: string;
};
type Application = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  job_slug: string;
  status: string;
  created_at: string;
};
type AdminUser = { last_login_at: string | null };

export async function GET() {
  return withAdmin(async () => {
    const [
      enquiryNew, enquiryRead, enquiryReplied, enquiryTotal,
      reviewPending, reviewApproved, reviewRejected,
      subActive, subUnsub,
      appNew, appReviewing, appShortlisted, appRejected, appTotal,
      recentEnquiries, recentApplications, admin,
    ] = await Promise.all([
      adminCount("website_enquiries", { status: "eq.new" }),
      adminCount("website_enquiries", { status: "eq.read" }),
      adminCount("website_enquiries", { status: "eq.replied" }),
      adminCount("website_enquiries"),
      adminCount("website_reviews", { status: "eq.pending" }),
      adminCount("website_reviews", { status: "eq.approved" }),
      adminCount("website_reviews", { status: "eq.rejected" }),
      adminCount("website_subscribers", { status: "eq.active" }),
      adminCount("website_subscribers", { status: "eq.unsubscribed" }),
      adminCount("website_applications", { status: "eq.new" }),
      adminCount("website_applications", { status: "eq.reviewing" }),
      adminCount("website_applications", { status: "eq.shortlisted" }),
      adminCount("website_applications", { status: "eq.rejected" }),
      adminCount("website_applications"),
      adminSelect<Enquiry>("website_enquiries", { order: "created_at.desc", limit: 5 }),
      adminSelect<Application>("website_applications", { order: "created_at.desc", limit: 4 }),
      adminSelectOne<AdminUser>("website_admin_users", { order: "last_login_at.desc.nullslast" }),
    ]);

    const lastLoginAt = admin?.last_login_at ?? null;
    const since = lastLoginAt ?? new Date(0).toISOString();

    const [newEnq, newRev, newApp, newSub] = await Promise.all([
      adminCount("website_enquiries", { created_at: `gt.${since}` }),
      adminCount("website_reviews", { created_at: `gt.${since}` }),
      adminCount("website_applications", { created_at: `gt.${since}` }),
      adminCount("website_subscribers", { created_at: `gt.${since}` }),
    ]);

    return {
      enquiryCounts: { new: enquiryNew, read: enquiryRead, replied: enquiryReplied, total: enquiryTotal },
      reviewCounts: { pending: reviewPending, approved: reviewApproved, rejected: reviewRejected },
      subscriberCounts: { active: subActive, unsubscribed: subUnsub },
      applicationCounts: {
        new: appNew, reviewing: appReviewing, shortlisted: appShortlisted, rejected: appRejected, total: appTotal,
      },
      recentEnquiries: recentEnquiries.map((e) => ({
        id: e.id,
        name: e.full_name,
        email: e.email,
        message: e.message,
        status: e.status,
        createdAt: e.created_at,
        relative: relativeTime(e.created_at),
      })),
      recentApplications: recentApplications.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        phone: a.phone,
        jobSlug: a.job_slug,
        jobTitle: humaniseJobSlug(a.job_slug),
        status: a.status,
        createdAt: a.created_at,
        relative: relativeTime(a.created_at),
      })),
      newSinceLastLogin: {
        enquiries: newEnq,
        reviews: newRev,
        applications: newApp,
        subscribers: newSub,
        lastLoginAt,
      },
    };
  });
}
