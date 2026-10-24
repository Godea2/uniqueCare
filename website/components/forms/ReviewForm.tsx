"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { reviewSchema, type ReviewInput } from "@/lib/validation";
import StarRating from "./StarRating";

const inputCls =
  "w-full rounded-lg border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-ink-muted/70 focus:border-brand-primary";
const labelCls = "mb-1.5 block text-sm font-semibold text-ink";
const errCls = "mt-1 text-sm text-error";

export default function ReviewForm() {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ReviewInput>({ resolver: zodResolver(reviewSchema), defaultValues: { rating: 0 as never } });

  async function onSubmit(data: ReviewInput) {
    setStatus("idle");
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div role="status" className="rounded-card border border-success/40 bg-green-50 p-8 text-center">
        <h3 className="font-heading text-xl font-semibold text-ink">Thank you for your review</h3>
        <p className="mt-2 text-ink-muted">It will appear once it has been checked by our team.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <div aria-live="polite">
        {status === "error" && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-error">
            Sorry, something went wrong submitting your review. Please try again.
          </p>
        )}
      </div>

      {/* honeypot */}
      <div className="absolute left-[-9999px]" aria-hidden>
        <label htmlFor="rev-website">Website</label>
        <input id="rev-website" type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="rev-name" className={labelCls}>
            Your Name <span aria-hidden>*</span>
          </label>
          <input
            id="rev-name"
            type="text"
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "rev-name-err" : undefined}
            className={inputCls}
            {...register("name")}
          />
          {errors.name && <p id="rev-name-err" className={errCls}>{errors.name.message}</p>}
        </div>
        <div>
          <label htmlFor="rev-rel" className={labelCls}>
            Your Relationship <span aria-hidden>*</span>
          </label>
          <select
            id="rev-rel"
            aria-invalid={Boolean(errors.relationship)}
            aria-describedby={errors.relationship ? "rev-rel-err" : undefined}
            className={inputCls}
            {...register("relationship")}
          >
            <option value="">Select...</option>
            <option>Service User</option>
            <option>Family Member</option>
            <option>Healthcare Professional</option>
            <option>Carer / Staff</option>
            <option>Other</option>
          </select>
          {errors.relationship && <p id="rev-rel-err" className={errCls}>{errors.relationship.message}</p>}
        </div>
      </div>

      <div>
        <span className={labelCls} id="rev-rating-label">
          Rating <span aria-hidden>*</span>
        </span>
        <Controller
          name="rating"
          control={control}
          render={({ field }) => (
            <StarRating value={field.value ?? 0} onChange={field.onChange} error={errors.rating?.message} />
          )}
        />
      </div>

      <div>
        <label htmlFor="rev-title" className={labelCls}>
          Review Title <span aria-hidden>*</span>
        </label>
        <input
          id="rev-title"
          type="text"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? "rev-title-err" : undefined}
          className={inputCls}
          {...register("title")}
        />
        {errors.title && <p id="rev-title-err" className={errCls}>{errors.title.message}</p>}
      </div>

      <div>
        <label htmlFor="rev-body" className={labelCls}>
          Your Review <span aria-hidden>*</span>
        </label>
        <textarea
          id="rev-body"
          rows={5}
          aria-invalid={Boolean(errors.body)}
          aria-describedby={errors.body ? "rev-body-err" : undefined}
          className={inputCls}
          {...register("body")}
        />
        {errors.body && <p id="rev-body-err" className={errCls}>{errors.body.message}</p>}
      </div>

      <p className="text-xs leading-relaxed text-ink-muted">
        By submitting this review you consent to us publishing it after moderation, as described in our{" "}
        <a href="/privacy" className="text-brand-primary hover:underline">Privacy Policy</a>.
      </p>

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-primary px-6 py-3.5 font-semibold text-white transition hover:bg-brand-primary-dark disabled:opacity-60"
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {isSubmitting ? "Submitting…" : "Submit Review"}
      </button>
    </form>
  );
}
