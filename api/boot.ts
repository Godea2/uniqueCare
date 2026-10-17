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

/** Daily document / plan-review expiry reminders. */
async function expiryCronHandler(c: { req: { header: (n: string) => string | undefined }; json: (b: unknown, s?: number) => Response }) {
  if (!assertCronAuth(c)) return c.json({ error: "Unauthorized" }, 401);
  try {
    const result = await runExpiryReminderJob();
    return c.json({ ok: true, ...result });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Reminder job failed" }, 500);
  }
}
app.get("/api/cron/expiry-reminders", expiryCronHandler);
app.post("/api/cron/expiry-reminders", expiryCronHandler);

/** Auto clock-out sweep when carers close the app (every 5 minutes). */
async function attendanceSweepHandler(c: { req: { header: (n: string) => string | undefined }; json: (b: unknown, s?: number) => Response }) {
  if (!assertCronAuth(c)) return c.json({ error: "Unauthorized" }, 401);
  try {
    const result = await runAutoClockOutSweep();
    return c.json({ ok: true, ...result });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Attendance sweep failed" }, 500);
  }
}
app.get("/api/cron/attendance-sweep", attendanceSweepHandler);
app.post("/api/cron/attendance-sweep", attendanceSweepHandler);

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
