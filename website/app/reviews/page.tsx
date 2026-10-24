import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Phone, Star } from "lucide-react";
import { getApprovedReviews } from "@/lib/supabase";
import ReviewForm from "@/components/forms/ReviewForm";
import { site } from "@/content/site";
import { aggregateRatingJsonLd, JsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "Client Reviews | What Families Say About Our Home Care | Unique Care UK",
  description:
    "Read reviews from families and clients who trust Unique Care UK for home care services across London, Essex, and Hertfordshire. CQC rated Good. Share your experience.",
  alternates: { canonical: "/reviews" },
};

export const revalidate = 300;

export default async function ReviewsPage({ searchParams }: { searchParams: { page?: string } }) {
  const reviews = await getApprovedReviews();
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  const perPage = 9;
  const totalPages = Math.max(1, Math.ceil(reviews.length / perPage));
  const shown = reviews.slice((page - 1) * perPage, page * perPage);
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <div className="mx-auto max-w-content px-4 pb-16 pt-12 md:pb-20">
      {reviews.length > 0 && <JsonLd data={aggregateRatingJsonLd(avg, reviews.length)} />}

      <p className="eyebrow">Client Reviews</p>
      <h1 className="mt-2 font-heading text-4xl font-semibold text-ink md:text-5xl">What our clients say</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-muted">
        Don&apos;t just take our word for it. Hear from the families and individuals we support across London,
        Essex, and Hertfordshire.
      </p>

      {reviews.length > 0 && (
        <div className="mt-6 flex items-center gap-3 rounded-card border border-line bg-brand-soft px-6 py-4">
          <span className="flex gap-0.5" aria-label={`Average rating ${avg.toFixed(1)} out of 5`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-5 w-5 ${i < Math.round(avg) ? "fill-amber-400 text-amber-400" : "text-line"}`}
                aria-hidden
              />
            ))}
          </span>
          <span className="font-semibold text-ink">{avg.toFixed(1)} out of 5</span>
          <span className="text-sm text-ink-muted">
            based on {reviews.length} review{reviews.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {reviews.length === 0 ? (
        <p className="mt-10 rounded-card border border-line bg-surface-alt p-8 text-center text-ink-muted">
          No reviews yet. Be the first to share your experience!
        </p>
      ) : (
        <>
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {shown.map((r) => (
              <article key={r.id} className="fade-up flex flex-col rounded-card border border-line bg-white p-6 shadow-card">
                <div className="flex gap-0.5" aria-label={`${r.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${i < r.rating ? "fill-amber-400 text-amber-400" : "text-line"}`}
                      aria-hidden
                    />
                  ))}
                </div>
                <h2 className="mt-3 font-heading text-lg font-semibold text-ink">{r.title}</h2>
                <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-muted">{r.body}</p>
                <footer className="mt-4 border-t border-line pt-3 text-sm">
                  <p className="font-semibold text-ink">{r.name}</p>
                  <p className="text-ink-muted">
                    {r.relationship} ·{" "}
                    <time dateTime={r.created_at}>
                      {new Date(r.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                  </p>
                </footer>
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <nav aria-label="Reviews pages" className="mt-8 flex items-center justify-center gap-2">
              {Array.from({ length: totalPages }).map((_, i) => (
                <Link
                  key={i}
                  href={i === 0 ? "/reviews" : `/reviews?page=${i + 1}`}
                  aria-current={page === i + 1 ? "page" : undefined}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold ${
                    page === i + 1 ? "bg-brand-primary text-white" : "border border-line bg-white text-ink hover:bg-brand-soft"
                  }`}
                >
                  {i + 1}
                </Link>
              ))}
            </nav>
          )}
        </>
      )}

      <section aria-labelledby="leave-review-h" className="mt-16 grid gap-10 lg:grid-cols-2">
        <div>
          <h2 id="leave-review-h" className="font-heading text-3xl font-semibold text-ink">Leave a review</h2>
          <p className="mt-3 text-ink-muted">
            Share your experience to help other families make informed decisions.
          </p>
        </div>
        <div className="rounded-card border border-line bg-white p-6 shadow-card md:p-8">
          <ReviewForm />
        </div>
      </section>

      <section aria-labelledby="reviews-cta-h" className="mt-16 rounded-card bg-brand-soft p-8 text-center">
        <h2 id="reviews-cta-h" className="font-heading text-2xl font-semibold text-ink">
          Ready to experience our care?
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-ink-muted">
          Book a free, no-obligation assessment. We&apos;ll come to you at a time that suits.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 font-semibold text-white transition hover:bg-brand-primary-dark"
          >
            Book a free assessment <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <a
            href={site.phonePrimaryTel}
            className="inline-flex items-center gap-2 rounded-full border-2 border-brand-primary px-6 py-3 font-semibold text-brand-primary transition hover:bg-white"
          >
            <Phone className="h-4 w-4" aria-hidden /> Call us now
          </a>
        </div>
      </section>
    </div>
  );
}
