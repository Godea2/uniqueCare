import type { Context } from "hono";
import { randomBytes } from "node:crypto";
import {
  refreshAccessToken,
  sendPasswordReset,
  setUserPassword,
  signInWithPassword,
  signUpWithEmail,
  userFromAccessToken,
  verifyEmailToken,
} from "./lib/gotrue";

function appOrigin(c: Context): string {
  const origin = c.req.header("origin");
  if (origin) return origin;
  const host = c.req.header("host") ?? "localhost:3000";
  const proto = c.req.header("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

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

export async function signupHandler(c: Context) {
  const body = await readJson(c);
  const email = text(body.email).toLowerCase();
  const fullName = text(body.fullName);
  if (!email || !email.includes("@")) return c.json({ error: "Enter a valid email address" }, 400);
  if (fullName.length < 2) return c.json({ error: "Enter your full name" }, 400);

  const redirectTo = `${appOrigin(c)}/auth/set-password`;
  const result = await signUpWithEmail(email, temporaryPassword(), fullName, redirectTo);
  if (result.error) {
    const already = /already registered|already been registered|already exists/i.test(result.error);
    return c.json({
      error: already
        ? "An account with this email already exists. Sign in, or reset your password."
        : result.error,
    }, already ? 409 : 400);
  }
  if (result.session) return c.json({ status: "session", session: result.session });
  return c.json({ status: "confirm_email" });
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
  const redirectTo = `${appOrigin(c)}/auth/set-password`;
  const result = await sendPasswordReset(email, redirectTo);
  if (result.error) return c.json({ error: result.error }, 400);
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
