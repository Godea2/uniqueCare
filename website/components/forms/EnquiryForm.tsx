"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { enquirySchema, type EnquiryInput } from "@/lib/validation";
import { services } from "@/content/services";
import { site } from "@/content/site";

const inputCls =
  "w-full rounded-lg border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-ink-muted/70 focus:border-brand-primary";
const labelCls = "mb-1.5 block text-sm font-semibold text-ink";
const errCls = "mt-1 text-sm text-error";

export default function EnquiryForm() {
  const params = useSearchParams();
  const preselectSlug = params.get("service") ?? "";
  const preselectName = services.find((s) => s.slug === preselectSlug)?.name ?? "";

  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EnquiryInput>({
    resolver: zodResolver(enquirySchema),
    defaultValues: { enquiryType: "Care Enquiry", careType: preselectName || undefined },
  });

  useEffect(() => {
    if (preselectName) setValue("careType", preselectName);
  }, [preselectName, setValue]);

  const enquiryType = watch("enquiryType");

  async function onSubmit(data: EnquiryInput) {
    setStatus("idle");
    try {
      const res = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, service: preselectSlug || undefined }),
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
        <h3 className="font-heading text-xl font-semibold text-ink">Thank you</h3>
        <p className="mt-2 text-ink-muted">
          We&apos;ve received your message and will be in touch within 2 working days. For urgent care needs,
          call <a href={site.phonePrimaryTel} className="font-semibold text-brand-primary hover:underline">{site.phonePrimary}</a>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <div aria-live="polite">
        {status === "error" && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-error">
            Sorry, something went wrong sending your message. Please try again, or call us on {site.phonePrimary}.
          </p>
        )}
      </div>

      {/* honeypot */}
      <div className="absolute left-[-9999px]" aria-hidden>
        <label htmlFor="enq-website">Website</label>
        <input id="enq-website" type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>

      <div>
        <label htmlFor="enq-name" className={labelCls}>
          Full Name <span aria-hidden>*</span>
        </label>
        <input
          id="enq-name"
          type="text"
          autoComplete="name"
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? "enq-name-err" : undefined}
          className={inputCls}
          {...register("fullName")}
        />
        {errors.fullName && <p id="enq-name-err" className={errCls}>{errors.fullName.message}</p>}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="enq-email" className={labelCls}>
            Email Address <span aria-hidden>*</span>
          </label>
          <input
            id="enq-email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "enq-email-err" : undefined}
            className={inputCls}
            {...register("email")}
          />
          {errors.email && <p id="enq-email-err" className={errCls}>{errors.email.message}</p>}
        </div>
        <div>
          <label htmlFor="enq-phone" className={labelCls}>
            Phone Number
          </label>
          <input
            id="enq-phone"
            type="tel"
            autoComplete="tel"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? "enq-phone-err" : undefined}
            className={inputCls}
            {...register("phone")}
          />
          {errors.phone && <p id="enq-phone-err" className={errCls}>{errors.phone.message}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="enq-type" className={labelCls}>Enquiry Type</label>
        <select id="enq-type" className={inputCls} {...register("enquiryType")}>
          <option>Care Enquiry</option>
          <option>Careers</option>
          <option>General Enquiry</option>
          <option>Feedback</option>
        </select>
      </div>

      {enquiryType === "Care Enquiry" && (
        <div>
          <label htmlFor="enq-care" className={labelCls}>Type of Care Needed</label>
          <select id="enq-care" className={inputCls} {...register("careType")}>
            <option value="">Select a service...</option>
            {services.map((s) => (
              <option key={s.slug} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="enq-message" className={labelCls}>
          Message <span aria-hidden>*</span>
        </label>
        <textarea
          id="enq-message"
          rows={5}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? "enq-message-err" : undefined}
          className={inputCls}
          {...register("message")}
        />
        {errors.message && <p id="enq-message-err" className={errCls}>{errors.message.message}</p>}
      </div>

      <p className="text-xs leading-relaxed text-ink-muted">
        By submitting this form you consent to us using your details to respond to your enquiry, as described
        in our <a href="/privacy" className="text-brand-primary hover:underline">Privacy Policy</a>.
      </p>

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-primary px-6 py-3.5 font-semibold text-white transition hover:bg-brand-primary-dark disabled:opacity-60 sm:w-auto"
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {isSubmitting ? "Sending…" : "Send Message"}
      </button>
    </form>
  );
}
