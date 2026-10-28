import { humaniseJobSlug, relativeTime } from "./http";

/* ── Enquiries ─────────────────────────────────────────────────────────────── */
export const ENQUIRY_STATUSES = ["new", "read", "replied"] as const;
export type EnquiryRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  enquiry_type: string;
  care_type: string | null;
  message: string;
  status: string;
  created_at: string;
};
export function mapEnquiry(e: EnquiryRow) {
  return {
    id: e.id,
    name: e.full_name,
    email: e.email,
    phone: e.phone,
    enquiryType: e.enquiry_type,
    careType: e.care_type,
    message: e.message,
    status: e.status,
    createdAt: e.created_at,
    relative: relativeTime(e.created_at),
  };
}

/* ── Reviews ───────────────────────────────────────────────────────────────── */
export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewRow = {
  id: string;
  name: string;
  relationship: string;
  rating: number;
  title: string;
  body: string;
  status: string;
  approved_at: string | null;
  reviewed_at: string | null;
  created_at: string;
};
export function mapReview(r: ReviewRow) {
  return {
    id: r.id,
    name: r.name,
    relationship: r.relationship,
    rating: r.rating,
    title: r.title,
    body: r.body,
    status: r.status,
    approvedAt: r.approved_at,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
    relative: relativeTime(r.created_at),
  };
}

/* ── Applications ──────────────────────────────────────────────────────────── */
export const APPLICATION_STATUSES = ["new", "reviewing", "shortlisted", "rejected"] as const;
export type ApplicationRow = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  job_slug: string;
  cover_letter: string;
  right_to_work: boolean;
  driving_licence: boolean;
  status: string;
  created_at: string;
};
export function mapApplication(a: ApplicationRow) {
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    phone: a.phone,
    jobSlug: a.job_slug,
    jobTitle: humaniseJobSlug(a.job_slug),
    coverLetter: a.cover_letter,
    rightToWork: a.right_to_work,
    drivingLicence: a.driving_licence,
    status: a.status,
    createdAt: a.created_at,
    relative: relativeTime(a.created_at),
  };
}

/* ── Subscribers ───────────────────────────────────────────────────────────── */
export const SUBSCRIBER_STATUSES = ["active", "unsubscribed"] as const;
export type SubscriberRow = { id: number; email: string; status: string; created_at: string };
export function mapSubscriber(s: SubscriberRow) {
  return {
    id: s.id,
    email: s.email,
    status: s.status,
    createdAt: s.created_at,
    relative: relativeTime(s.created_at),
  };
}

/* ── Newsletters ───────────────────────────────────────────────────────────── */
export const NEWSLETTER_STATUSES = ["draft", "sent"] as const;
export type NewsletterRow = {
  id: number;
  subject: string;
  content: string;
  recipients_count: number | null;
  status: string;
  sent_at: string | null;
  created_at: string;
};
export function mapNewsletter(n: NewsletterRow) {
  return {
    id: n.id,
    subject: n.subject,
    content: n.content,
    recipientsCount: n.recipients_count,
    status: n.status,
    sentAt: n.sent_at,
    createdAt: n.created_at,
  };
}

/* ── Posts ─────────────────────────────────────────────────────────────────── */
export const POST_STATUSES = ["draft", "published", "archived"] as const;
export const POST_CATEGORIES = ["Care Advice", "Company News", "Health Tips", "Industry Updates"] as const;
export type PostRow = {
  id: number;
  title: string;
  slug: string;
  category: string;
  image_url: string | null;
  excerpt: string;
  content: string;
  status: string;
  created_at: string;
  updated_at: string;
};
export function mapPost(p: PostRow) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    category: p.category,
    imageUrl: p.image_url,
    excerpt: p.excerpt,
    content: p.content,
    status: p.status,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

/* ── CSV helpers ───────────────────────────────────────────────────────────── */
/** Neutralise spreadsheet formula injection in exported cells. */
export function csvSafe(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /^[=@\t\r]|^[+-](?![\d\s])/.test(s) ? `'${s}` : s;
}
export function isoDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toISOString() : "";
}
