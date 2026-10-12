import { createClient, type SupabaseClient, type User as AuthUser } from "@supabase/supabase-js";
import { env } from "./env";

let admin: SupabaseClient | null = null;

/** Service-role client used only to verify tokens and update auth users. */
export function authAdmin(): SupabaseClient {
  if (!admin) {
    if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    }
    admin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

export type ClientSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type GoTrueBody = Record<string, unknown>;

function authErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const record = body as Record<string, unknown>;
  const message = record.msg ?? record.message ?? record.error_description ?? record.error;
  return typeof message === "string" && message.trim() ? message : fallback;
}

async function gotrue(path: string, body: GoTrueBody, redirectTo?: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  const base = env.supabaseUrl.replace(/\/$/, "");
  const url = new URL(`${base}/auth/v1/${path.replace(/^\//, "")}`);
  if (redirectTo) url.searchParams.set("redirect_to", redirectTo);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.supabaseServiceRoleKey,
      Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
    },
    body: JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body: parsed };
}

function sessionFrom(body: unknown): ClientSession | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const accessToken = record.access_token;
  const refreshToken = record.refresh_token;
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") return null;
  const expiresAt = typeof record.expires_at === "number"
    ? record.expires_at
    : Math.floor(Date.now() / 1000) + (typeof record.expires_in === "number" ? record.expires_in : 3600);
  return { accessToken, refreshToken, expiresAt };
}

export async function signInWithPassword(email: string, password: string) {
  const result = await gotrue("token?grant_type=password", { email, password });
  if (!result.ok) {
    return { error: authErrorMessage(result.body, "Email or password is incorrect") };
  }
  const session = sessionFrom(result.body);
  if (!session) return { error: "Sign-in did not return a session" };
  return { session };
}

export async function refreshAccessToken(refreshToken: string) {
  const result = await gotrue("token?grant_type=refresh_token", { refresh_token: refreshToken });
  if (!result.ok) return { error: authErrorMessage(result.body, "Session expired") };
  const session = sessionFrom(result.body);
  if (!session) return { error: "Could not refresh the session" };
  return { session };
}

export async function verifyEmailToken(tokenHash: string, type: string) {
  const result = await gotrue("verify", { token_hash: tokenHash, type });
  if (!result.ok) return { error: authErrorMessage(result.body, "This link is invalid or has expired") };
  const session = sessionFrom(result.body);
  if (!session) return { error: "This link is invalid or has expired" };
  return { session };
}

/**
 * A sign-up confirmation or password-reset link, made without Supabase sending an email,
 * so the app can send it through its own mailer.
 */
export async function authEmailLink(
  kind: "signup" | "recovery" | "magiclink", email: string, redirectTo: string, opts?: { password?: string; fullName?: string },
): Promise<{ link?: string; error?: string }> {
  const options = { redirectTo, ...(opts?.fullName ? { data: { full_name: opts.fullName } } : {}) };
  const { data, error } = kind === "signup"
    ? await authAdmin().auth.admin.generateLink({ type: "signup", email, password: opts?.password ?? "", options })
    : await authAdmin().auth.admin.generateLink({ type: kind, email, options: { redirectTo } });
  if (error || !data?.properties?.action_link) return { error: error?.message ?? "Could not create the link" };
  return { link: data.properties.action_link };
}

export async function findAuthUserByEmail(email: string): Promise<AuthUser | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await authAdmin().auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function userFromAccessToken(accessToken: string): Promise<AuthUser | null> {
  const { data, error } = await authAdmin().auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}

export async function setUserPassword(userId: string, password: string) {
  const { error } = await authAdmin().auth.admin.updateUserById(userId, { password });
  if (error) return { error: error.message };
  return { ok: true as const };
}
