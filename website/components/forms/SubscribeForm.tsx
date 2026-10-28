"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

type Status = "idle" | "loading" | "success" | "error";

/**
 * Newsletter signup. Designed for the dark footer by default
 * (`tone="dark"`); use `tone="light"` on white sections.
 */
export default function SubscribeForm({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; alreadySubscribed?: boolean };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
      setStatus("success");
      setMessage(data.alreadySubscribed ? "You're already subscribed. Thank you!" : "Thanks for subscribing!");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  const dark = tone === "dark";
  return (
    <form onSubmit={onSubmit} noValidate aria-label="Subscribe to our newsletter" className="w-full max-w-md">
      <div className="absolute left-[-9999px]" aria-hidden>
        <label htmlFor="sub-website">Website</label>
        <input
          id="sub-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      <label htmlFor="sub-email" className="sr-only">
        Email address
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="sub-email"
          type="email"
          required
          autoComplete="email"
          placeholder="Your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`min-w-0 flex-1 rounded-full border px-4 py-2.5 text-sm ${
            dark
              ? "border-white/25 bg-white/10 text-white placeholder:text-white/60"
              : "border-line bg-white text-ink placeholder:text-ink-muted/70"
          }`}
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
            dark
              ? "bg-white text-brand-primary-dark hover:bg-brand-soft"
              : "bg-brand-primary text-white hover:bg-brand-primary-dark"
          }`}
        >
          {status === "loading" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Subscribe
        </button>
      </div>
      <p
        aria-live="polite"
        role={status === "error" ? "alert" : undefined}
        className={`mt-2 min-h-[1.25rem] text-xs ${
          status === "error" ? (dark ? "text-red-200" : "text-error") : dark ? "text-white/80" : "text-ink-muted"
        }`}
      >
        {message}
      </p>
    </form>
  );
}
