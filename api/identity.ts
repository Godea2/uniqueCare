import type { User as AuthUser } from "@supabase/supabase-js";
import type { User } from "@db/schema";
import { findUserByUnionId, upsertUser } from "./queries/users";
import { userFromAccessToken } from "./lib/gotrue";

export async function ensureLocalUser(authUser: AuthUser): Promise<User | undefined> {
  const existing = await findUserByUnionId(authUser.id);
  if (existing) return existing;
  const metaName = authUser.user_metadata?.full_name;
  const name = typeof metaName === "string" && metaName.trim() ? metaName.trim() : authUser.email ?? "Staff";
  await upsertUser({
    unionId: authUser.id,
    email: authUser.email ?? null,
    name,
    role: "user",
  });
  return findUserByUnionId(authUser.id);
}

export async function authenticateRequest(headers: Headers): Promise<User | undefined> {
  const header = headers.get("authorization") ?? "";
  const token = /^bearer\s+/i.test(header) ? header.replace(/^bearer\s+/i, "").trim() : "";
  if (!token) return undefined;
  const authUser = await userFromAccessToken(token);
  if (!authUser) return undefined;
  return ensureLocalUser(authUser);
}
