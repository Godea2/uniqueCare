import type { Context } from "hono";
import { randomBytes } from "node:crypto";
import {
  authEmailLink,
  findAuthUserByEmail,
  refreshAccessToken,
  setUserPassword,
  signInWithPassword,
  userFromAccessToken,
  verifyEmailToken,
} from "./lib/gotrue";
import { db } from "./db";
import { appUrl, orgProfile } from "./lib/app-url";
import { sendEmail } from "./lib/mailer";

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function temporaryPassword(): string {
  return `Aa1!${randomBytes(24).toString("base64url")}`;
}

function clientIp(c: Context): string {
  return (c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

/** At most `limit` requests per hour for each key; records this request when allowed. */
async function withinLimit(bucket: string, keys: string[], limit: number): Promise<boolean> {
  const since = new Date(Date.now() - 3600_000);
  for (const key of keys) {
    if (await db.from("rateLimitEvents").eq("bucket", bucket).eq("rlKey", key).gt("createdAt", since).count() >= limit) return false;
  }
  for (const key of keys) await db.from("rateLimitEvents").insert({ bucket, rlKey: key });
  return true;
}

const TOO_MANY = "Too many requests. Please wait a while and try again.";
const SEND_FAILED = "We could not send the email just now. Please try again in a few minutes.";

/** Public self-signup is closed — staff must be invited from User management. */
export async function signupHandler(c: Context) {
  return c.json({
    error: "Accounts are created by your manager. Ask them to send you an invite, then sign in here.",
  }, 403);
}

export async function signinHandler(c: Context) {
  const body = await readJson(c);
  const email = text(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return c.json({ error: "Email and password are required" }, 400);
  const result = await signInWithPassword(email, password);
  if (result.error || !result.session) {
    return c.json({ error: result.error ?? "Email or password is incorrect" }, 401);
  }
  return c.json({ session: result.session });
}

export async function refreshHandler(c: Context) {
  const body = await readJson(c);
  const refreshToken = text(body.refreshToken);
  if (!refreshToken) return c.json({ error: "Missing refresh token" }, 400);
  const result = await refreshAccessToken(refreshToken);
  if (result.error || !result.session) return c.json({ error: result.error ?? "Session expired" }, 401);
  return c.json({ session: result.session });
}

export async function forgotHandler(c: Context) {
  const body = await readJson(c);
  const email = text(body.email).toLowerCase();
  if (!email || !email.includes("@")) return c.json({ error: "Enter a valid email address" }, 400);
  if (!(await withinLimit("password_reset", [clientIp(c), email], 5))) return c.json({ error: TOO_MANY }, 429);

  const redirectTo = `${appUrl(c.req.raw)}/auth/set-password`;
  // Same answer whether or not the account exists, so this can't be used to find out who has one.
  const user = await findAuthUserByEmail(email);
  if (!user) return c.json({ ok: true });
  const result = await authEmailLink("recovery", email, redirectTo);
  if (result.error || !result.link) return c.json({ error: SEND_FAILED }, 502);

  const org = await orgProfile();
  const sent = await sendEmail({
    to: email,
    subject: "Reset your UniqueCare Connect password",
    body: [
      "Hello,",
      `We received a request to reset the password for the UniqueCare Connect account ${email}. Use the link below to choose a new one:`,
      result.link,
      "The link expires in 1 hour and can only be used once. Your current password keeps working until you set a new one.",
      "Didn't ask for this? You can ignore this email and your password won't change.",
      org.signOff,
    ].join("\n\n"),
    kind: "password_reset",
    privateLink: true,
  });
  if (!sent.delivered) return c.json({ error: SEND_FAILED }, 502);
  return c.json({ ok: true });
}

export async function verifyHandler(c: Context) {
  const body = await readJson(c);
  const tokenHash = text(body.tokenHash);
  const type = text(body.type) || "signup";
  if (!tokenHash) return c.json({ error: "Missing confirmation token" }, 400);
  const result = await verifyEmailToken(tokenHash, type);
  if (result.error || !result.session) {
    return c.json({ error: result.error ?? "This link is invalid or has expired" }, 400);
  }
  return c.json({ session: result.session });
}

export async function setPasswordHandler(c: Context) {
  const body = await readJson(c);
  const accessToken = text(body.accessToken);
  const password = typeof body.password === "string" ? body.password : "";
  if (!accessToken) return c.json({ error: "Open the link from your email again." }, 401);
  if (password.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);
  const user = await userFromAccessToken(accessToken);
  if (!user) return c.json({ error: "This link is invalid or has expired. Request a new one." }, 401);
  const updated = await setUserPassword(user.id, password);
  if (updated.error) return c.json({ error: updated.error }, 400);
  return c.json({ ok: true });
}
