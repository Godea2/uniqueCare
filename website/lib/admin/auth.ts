import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { adminSelectOne, adminUpdate, adminInsert, adminCount, adminDbConfigured } from "./db";

const COOKIE = "uc_website_admin";
const MAX_AGE_SEC = 60 * 60 * 12; // 12 hours

export type AdminSession = {
  email: string;
  userId: number;
  iat: number;
  exp: number;
};

function sessionSecret(): string {
  return (
    process.env.WEBSITE_ADMIN_SESSION_SECRET
    || process.env.REVIEW_MODERATION_SECRET
    || process.env.REVALIDATE_SECRET
    || "dev-only-change-me"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function encodeSession(s: AdminSession): string {
  const body = Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeSession(token: string): AdminSession | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AdminSession;
    if (!s.email || !s.exp || Date.now() / 1000 > s.exp) return null;
    return s;
  } catch {
    return null;
  }
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  return decodeSession(raw);
}

export async function requireAdminSession(): Promise<AdminSession> {
  const s = await getAdminSession();
  if (!s) {
    const err = new Error("Unauthorized");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return s;
}

export async function setAdminSessionCookie(session: AdminSession): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, encodeSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

type AdminUser = {
  id: number;
  email: string;
  password_hash: string;
  last_login_at: string | null;
};

/** Bootstrap first admin from env if the table is empty. */
async function ensureBootstrapAdmin(): Promise<void> {
  if (!adminDbConfigured()) return;
  const email = (process.env.WEBSITE_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.WEBSITE_ADMIN_PASSWORD ?? "";
  if (!email || !password || password.length < 8) return;
  const n = await adminCount("website_admin_users");
  if (n > 0) return;
  const password_hash = await bcrypt.hash(password, 12);
  await adminInsert("website_admin_users", { email, password_hash });
}

export async function loginAdmin(emailRaw: string, password: string): Promise<AdminSession> {
  await ensureBootstrapAdmin();
  const email = emailRaw.trim().toLowerCase();
  const user = await adminSelectOne<AdminUser>("website_admin_users", {
    filters: { email: `eq.${email}` },
  });
  if (!user) {
    const err = new Error("Invalid email or password");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    const err = new Error("Invalid email or password");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  await adminUpdate("website_admin_users", `id=eq.${user.id}`, {
    last_login_at: new Date().toISOString(),
  });
  const now = Math.floor(Date.now() / 1000);
  const session: AdminSession = {
    email: user.email,
    userId: Number(user.id),
    iat: now,
    exp: now + MAX_AGE_SEC,
  };
  await setAdminSessionCookie(session);
  return session;
}

export { COOKIE as ADMIN_SESSION_COOKIE };
