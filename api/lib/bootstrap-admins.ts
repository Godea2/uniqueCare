import { db } from "../db";
import type { StaffProfiles, User } from "@db/schema";
import { ensureLocalUser } from "../identity";
import { findAuthUserByEmail, provisionAuthUser } from "./gotrue";

/** Registered Managers provisioned without invite email (firewall-safe). */
export const BOOTSTRAP_ADMINS: { email: string; fullName: string }[] = [
  { email: "karen.rides@uniquecareuk.com", fullName: "Karen Rides" },
  { email: "henry@uniquecareuk.com", fullName: "Henry" },
  { email: "ruby@uniquecareuk.com", fullName: "Ruby" },
  { email: "satta@uniquecareuk.com", fullName: "Satta" },
];

export const BOOTSTRAP_ADMIN_EMAILS = new Set(
  BOOTSTRAP_ADMINS.map((a) => a.email.toLowerCase()),
);

export type BootstrapResult = {
  email: string;
  ok: boolean;
  createdAuth?: boolean;
  createdProfile?: boolean;
  error?: string;
};

let pending: Promise<BootstrapResult[]> | null = null;

/**
 * Ensure named RMs exist in Auth + staff_profiles with an active login.
 * Requires BOOTSTRAP_ADMIN_PASSWORD (min 8 chars).
 * Password is applied when creating Auth users, when the staff row is still
 * invited/pending, when Auth has never signed in, or when
 * BOOTSTRAP_ADMIN_FORCE_PASSWORD=1|true.
 */
export function ensureBootstrapAdmins(): Promise<BootstrapResult[]> {
  if (!pending) pending = runBootstrap();
  return pending;
}

/** Clear memo so the next call re-reads env and re-provisions. */
export function resetBootstrapMemo(): void {
  pending = null;
}

/**
 * When sign-in fails but the typed password matches BOOTSTRAP_ADMIN_PASSWORD,
 * force-create/update that RM account so they can get in without invite email.
 */
export async function tryBootstrapPasswordRecovery(email: string, password: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const admin = BOOTSTRAP_ADMINS.find((a) => a.email === normalized);
  if (!admin) return false;

  const bootstrapPassword = (process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "").trim();
  if (bootstrapPassword.length < 8 || password !== bootstrapPassword) return false;

  const result = await provisionOneAdmin(admin, bootstrapPassword, true);
  resetBootstrapMemo();
  return result.ok;
}

async function runBootstrap(): Promise<BootstrapResult[]> {
  const password = (process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "").trim();
  if (password.length < 8) {
    console.warn("[bootstrap-admins] BOOTSTRAP_ADMIN_PASSWORD missing or shorter than 8 characters — skipped");
    pending = null;
    return BOOTSTRAP_ADMINS.map((a) => ({
      email: a.email,
      ok: false,
      error: "BOOTSTRAP_ADMIN_PASSWORD not set (min 8 characters)",
    }));
  }

  const forcePassword = /^(1|true|yes)$/i.test(process.env.BOOTSTRAP_ADMIN_FORCE_PASSWORD ?? "");
  const results: BootstrapResult[] = [];

  for (const admin of BOOTSTRAP_ADMINS) {
    try {
      results.push(await provisionOneAdmin(admin, password, forcePassword));
    } catch (err) {
      results.push({
        email: admin.email,
        ok: false,
        error: err instanceof Error ? err.message : "Bootstrap failed",
      });
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error("[bootstrap-admins] partial failure", failed);
    pending = null;
  } else {
    console.log("[bootstrap-admins] ready", results.map((r) => r.email).join(", "));
  }
  return results;
}

async function provisionOneAdmin(
  admin: { email: string; fullName: string },
  password: string,
  forcePassword: boolean,
): Promise<BootstrapResult> {
  const email = admin.email.toLowerCase();
  const all = await db.from("staffProfiles").isNull("deletedAt").many<StaffProfiles>();
  const match = all.find((s) => s.email?.trim().toLowerCase() === email);
  const authUser = await findAuthUserByEmail(email);
  const neverSignedIn = !!authUser && !authUser.last_sign_in_at;
  const needsPassword =
    forcePassword
    || !match
    || match.status === "invited"
    || match.status === "pending"
    || neverSignedIn
    || !authUser;

  const provisioned = await provisionAuthUser({
    email,
    password,
    fullName: admin.fullName,
    resetPassword: needsPassword,
  });
  if (provisioned.error || !provisioned.user) {
    return { email, ok: false, error: provisioned.error ?? "Auth provision failed" };
  }

  const local = await ensureLocalUser(provisioned.user);
  if (!local) {
    return {
      email,
      ok: false,
      createdAuth: provisioned.created,
      error: "Could not create local user row",
    };
  }

  return upsertAdminProfile({
    email,
    fullName: admin.fullName,
    localUser: local,
    existing: match,
    authCreated: !!provisioned.created,
  });
}

async function upsertAdminProfile(opts: {
  email: string;
  fullName: string;
  localUser: User;
  existing?: StaffProfiles;
  authCreated: boolean;
}): Promise<BootstrapResult> {
  if (opts.existing) {
    await db.from("staffProfiles").eq("id", opts.existing.id).update({
      userId: opts.localUser.id,
      fullName: opts.existing.fullName?.trim() ? opts.existing.fullName : opts.fullName,
      email: opts.email,
      role: "super_admin",
      homeRole: null,
      jobTitle: opts.existing.jobTitle ?? "Registered Manager",
      status: "active",
      canInviteUsers: true,
    });
    return {
      email: opts.email,
      ok: true,
      createdAuth: opts.authCreated,
      createdProfile: false,
    };
  }

  await db.from("staffProfiles").insert({
    userId: opts.localUser.id,
    fullName: opts.fullName,
    email: opts.email,
    role: "super_admin",
    jobTitle: "Registered Manager",
    status: "active",
    canInviteUsers: true,
    contractedHours: "37.5",
    avatarColor: "#0A2E5C",
  });

  return {
    email: opts.email,
    ok: true,
    createdAuth: opts.authCreated,
    createdProfile: true,
  };
}
