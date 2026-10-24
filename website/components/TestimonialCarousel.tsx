"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Star } from "lucide-react";

export type CarouselReview = {
  id: string;
  name: string;
  relationship: string;
  rating: number;
  title: string;
  body: string;
};

export default function TestimonialCarousel({ reviews }: { reviews: CarouselReview[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>();

  const next = useCallback(() => setIndex((i) => (i + 1) % reviews.length), [reviews.length]);
  const prev = useCallback(() => setIndex((i) => (i - 1 + reviews.length) % reviews.length), [reviews.length]);

  useEffect(() => {
    if (paused || reviews.length <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timer.current = setInterval(next, 8000);
    return () => clearInterval(timer.current);
  }, [paused, next, reviews.length]);

  if (reviews.length === 0) return null;
  const r = reviews[index];

  return (
    <div
      className="fade-up relative mx-auto max-w-3xl rounded-card border border-line bg-white p-8 shadow-card md:p-10"
      role="region"
      aria-roledescription="carousel"
      aria-label="Client testimonials"
    >
      <span className="font-heading text-6xl leading-none text-brand-secondary" aria-hidden>
        &ldquo;
      </span>
      <div aria-live="polite">
        <div className="flex gap-1" aria-label={`${r.rating} out of 5 stars`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`h-5 w-5 ${i < r.rating ? "fill-amber-400 text-amber-400" : "text-line"}`}
              aria-hidden
            />
          ))}
        </div>
        <blockquote className="mt-3 text-lg leading-relaxed text-ink">{r.body}</blockquote>
        <footer className="mt-5 flex items-center gap-3">
          <span
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft font-heading text-lg font-semibold text-brand-primary"
            aria-hidden
          >
            {r.name.charAt(0)}
          </span>
          <div>
            <p className="font-semibold text-ink">{r.name}</p>
            <p className="text-sm text-ink-muted">{r.relationship}</p>
          </div>
        </footer>
      </div>

      {reviews.length > 1 && (
        <div className="mt-6 flex items-center gap-2">
          <button
            type="button"
            onClick={prev}
            aria-label="Previous testimonial"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink hover:bg-brand-soft"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next testimonial"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink hover:bg-brand-soft"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Play testimonial rotation" : "Pause testimonial rotation"}
            aria-pressed={paused}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink hover:bg-brand-soft"
          >
            {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
          </button>
          <span className="ml-2 text-sm text-ink-muted" aria-hidden>
            {index + 1} / {reviews.length}
          </span>
        </div>
      )}
    </div>
  );
}
