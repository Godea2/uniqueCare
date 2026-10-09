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

export async function signUpWithEmail(email: string, password: string, fullName: string, redirectTo: string) {
  const result = await gotrue("signup", {
    email,
    password,
    data: { full_name: fullName },
  }, redirectTo);
  if (!result.ok) {
    return { error: authErrorMessage(result.body, "Could not create the account") };
  }
  const session = sessionFrom(result.body);
  return { session };
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

export async function sendPasswordReset(email: string, redirectTo: string) {
  const result = await gotrue("recover", { email }, redirectTo);
  if (!result.ok) {
    return { error: authErrorMessage(result.body, "Could not send the reset email") };
  }
  return { ok: true as const };
}

export async function verifyEmailToken(tokenHash: string, type: string) {
  const result = await gotrue("verify", { token_hash: tokenHash, type });
  if (!result.ok) return { error: authErrorMessage(result.body, "This link is invalid or has expired") };
  const session = sessionFrom(result.body);
  if (!session) return { error: "This link is invalid or has expired" };
  return { session };
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
