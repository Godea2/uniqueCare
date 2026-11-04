import path from "node:path";
import { pathToFileURL } from "node:url";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import {
  forgotHandler,
  refreshHandler,
  setPasswordHandler,
  signinHandler,
  signupHandler,
  verifyHandler,
} from "./auth-http";
import { runExpiryReminderJob } from "./lib/expiry-tracker";
import { runAutoClockOutSweep } from "./lib/attendance-session";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.post("/api/auth/signup", signupHandler);
app.post("/api/auth/signin", signinHandler);
app.post("/api/auth/refresh", refreshHandler);
app.post("/api/auth/forgot", forgotHandler);
app.post("/api/auth/verify", verifyHandler);
app.post("/api/auth/set-password", setPasswordHandler);

function assertCronAuth(c: { req: { header: (n: string) => string | undefined } }) {
  const auth = c.req.header("authorization") ?? "";
  const secret = env.cronSecret;
  return !!secret && auth === `Bearer ${secret}`;
}

/**
 * Daily jobs (Hobby-compatible: once per day).
 * - Document / plan-review expiry reminders
 * - Auto clock-out sweep for forgotten sessions
 * Between runs, probes + timesheet lazy-sweep still close open visits.
 */
async function dailyCronHandler(c: { req: { header: (n: string) => string | undefined }; json: (b: unknown, s?: number) => Response }) {
  if (!assertCronAuth(c)) return c.json({ error: "Unauthorized" }, 401);
  try {
    const [expiry, attendance] = await Promise.all([
      runExpiryReminderJob(),
      runAutoClockOutSweep(),
    ]);
    return c.json({ ok: true, expiry, attendance });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Daily cron failed" }, 500);
  }
}
app.get("/api/cron/daily", dailyCronHandler);
app.post("/api/cron/daily", dailyCronHandler);
/** @deprecated aliases — kept so old Vercel cron configs still hit something useful */
app.get("/api/cron/expiry-reminders", dailyCronHandler);
app.post("/api/cron/expiry-reminders", dailyCronHandler);
app.get("/api/cron/attendance-sweep", dailyCronHandler);
app.post("/api/cron/attendance-sweep", dailyCronHandler);

/** Public careers feed for the marketing website (service-role; no anon RLS). */
app.get("/api/public/jobs", async (c) => {
  try {
    const { listPublicLiveJobs } = await import("./lib/public-jobs");
    const jobs = await listPublicLiveJobs();
    c.header("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return c.json({ jobs });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Could not load jobs" }, 500);
  }
});

/**
 * Website → portal email bridge. The marketing site prefers Resend; when that
 * fails (or is unset), it POSTs here so SMTP/Graph on the portal still delivers
 * enquiry/review/subscribe notifications.
 *
 * Auth: Bearer token = WEBSITE_NOTIFY_SECRET || WEBSITE_REVALIDATE_SECRET || REVALIDATE_SECRET
 * (must match the website's notify/revalidate secret).
 */
app.post("/api/public/website-notify", async (c) => {
  const auth = c.req.header("authorization") ?? "";
  const secret =
    process.env.WEBSITE_NOTIFY_SECRET
    || process.env.WEBSITE_REVALIDATE_SECRET
    || process.env.REVALIDATE_SECRET
    || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  let body: { to?: string; subject?: string; html?: string; text?: string; replyTo?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const html = typeof body.html === "string" ? body.html : "";
  if (!to || !subject || !html) {
    return c.json({ error: "to, subject and html are required" }, 400);
  }
  try {
    const { sendEmail } = await import("./lib/mailer");
    const text = typeof body.text === "string" && body.text.trim()
      ? body.text
      : html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
    const result = await sendEmail({
      to,
      subject,
      body: text,
      html,
      kind: "website_notify",
      relatedType: "website",
      // Do not queue private content indefinitely; website already logged the failure.
      privateLink: false,
    });
    if (!result.delivered) {
      return c.json({ error: result.error || "Delivery failed" }, 502);
    }
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Send failed" }, 500);
  }
});

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

const entryPath = process.argv[1];
const startedDirectly =
  entryPath != null &&
  import.meta.url === pathToFileURL(path.resolve(entryPath)).href;

if (env.isProduction && !process.env.VERCEL && startedDirectly) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
