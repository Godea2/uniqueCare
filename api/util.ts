import { TRPCError } from "@trpc/server";
import { waitUntil } from "@vercel/functions";
import { db } from "./db";
import { appUrl, orgProfile } from "./lib/app-url";
import { sendEmail } from "./lib/mailer";
import type { StaffProfile, StaffRole, User } from "@db/schema";
import type { TrpcContext } from "./context";

export type StaffCtx = {
  staff: StaffProfile;
  user: User;
};

const SUPER_ADMIN_EMAILS = new Set([
  "kaytoba49@gmail.com",
  "info@northsnow.co.uk",
]);

function isNamedSuperAdmin(email: string | null | undefined): boolean {
  return !!email && SUPER_ADMIN_EMAILS.has(email.trim().toLowerCase());
}

/** Statuses that may use the staff app. "pending" and "left" are locked out. */
export const ACTIVE_STAFF_STATUSES = ["active", "onboarding"] as const;

const staffCache = new WeakMap<object, Promise<StaffCtx>>();

/**
 * Resolve the signed-in user's staff profile.
 * - Already linked: return it (status unchanged — invited stays invited until password is set).
 * - Invite profile with matching email (no userId yet): link the auth user; stay invited until
 *   they finish /auth/set-password.
 * - Bootstrap only: named super admins or the very first user become Registered Manager.
 * Public self-signup is disabled — everyone else must be invited.
 */
export function getStaff(ctx: TrpcContext): Promise<StaffCtx> {
  const user = ctx.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  let pending = staffCache.get(user);
  if (!pending) {
    pending = resolveStaff(user);
    staffCache.set(user, pending);
    pending.catch(() => staffCache.delete(user));
  }
  return pending;
}

/** True if this staff member may open User management and invite others. */
export function canManageUsers(staff: StaffProfile): boolean {
  const real = (staff.homeRole ?? staff.role) as StaffRole;
  return real === "super_admin" || !!staff.canInviteUsers;
}

/** After the invitee chooses a password — grant app access. */
export async function activateInvitedStaff(opts: {
  localUserId?: number;
  email?: string | null;
}): Promise<void> {
  const email = opts.email?.trim().toLowerCase();
  const all = await db.from("staffProfiles").isNull("deletedAt").many<StaffProfile>();
  const match = all.find((s) =>
    (opts.localUserId != null && s.userId === opts.localUserId)
    || (!!email && s.email?.trim().toLowerCase() === email));
  if (!match) return;
  if (match.status !== "invited" && match.status !== "pending") {
    if (opts.localUserId != null && match.userId !== opts.localUserId) {
      await db.from("staffProfiles").eq("id", match.id).update({ userId: opts.localUserId });
    }
    return;
  }
  await db.from("staffProfiles").eq("id", match.id).update({
    userId: opts.localUserId ?? match.userId,
    status: "active",
  });
}

async function resolveStaff(user: User): Promise<StaffCtx> {
  const existing = await db.from("staffProfiles").eq("userId", user.id).first<StaffProfile>();
  if (existing) {
    return { staff: existing, user };
  }

  const email = user.email?.trim().toLowerCase();
  if (email) {
    const unlinked = await db.from("staffProfiles").isNull("userId").isNull("deletedAt").many<StaffProfile>();
    const match = unlinked.find((s) => s.email?.trim().toLowerCase() === email);
    if (match) {
      // Link login identity now; access waits until they set a password (status stays invited).
      await db.from("staffProfiles").eq("id", match.id).update({ userId: user.id });
      return { staff: { ...match, userId: user.id }, user };
    }
  }

  const name = user.name ?? user.email ?? "Staff";
  const managers = await db.from("staffProfiles").eq("role", "super_admin").isNull("deletedAt").count();
  const isManager = isNamedSuperAdmin(user.email) || managers === 0;
  if (!isManager) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This email is not on the staff list. Ask your manager to send you an invite.",
    });
  }
  const [created] = await db.from("staffProfiles").insert<StaffProfile>({
    userId: user.id,
    fullName: name,
    email: user.email,
    role: "super_admin",
    jobTitle: "Registered Manager",
    status: "active",
    canInviteUsers: true,
    contractedHours: "37.5",
    avatarColor: "#0A2E5C",
  });
  return { staff: created, user };
}

export function canUseApp(staff: StaffProfile): boolean {
  return !staff.deletedAt && (ACTIVE_STAFF_STATUSES as readonly string[]).includes(staff.status);
}

const ROLE_RANK: Record<StaffRole, number> = {
  care_worker: 1,
  interview_panel: 2,
  supervisor: 3,
  crm_agent: 3,
  care_coordinator: 4,
  team_leader: 5,
  admin: 6,
  super_admin: 7,
};

export function requireRole(sc: StaffCtx, ...roles: StaffRole[]) {
  if (!roles.includes(sc.staff.role as StaffRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Requires one of: ${roles.join(", ")}`,
    });
  }
}

/** Shared role sets — keep in sync with src/lib/roles.ts nav / route guards. */
export const ROTA_PLANNER_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader"];
export const ROTA_WRITE_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator"];
export const PAYROLL_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader"];
export const COMPLIANCE_MATRIX_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader"];
export const STAFF_DIRECTORY_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader", "supervisor"];
export const CLIENT_DIRECTORY_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader", "supervisor", "crm_agent"];
export const CQC_READINESS_ROLES: StaffRole[] = ["super_admin", "admin", "team_leader", "care_coordinator"];
export const CQC_INCIDENT_ROLES: StaffRole[] = ["super_admin", "admin", "team_leader", "supervisor"];
/** Care/support plans + plan reviews — managers, admin, team leaders, coordinators */
export const CQC_PLAN_ROLES: StaffRole[] = ["super_admin", "admin", "care_coordinator", "team_leader"];
/** Create, AI generate, approve plans/reviews — same set (human approval always required). */
export const CQC_PLAN_WRITE_ROLES: StaffRole[] = CQC_PLAN_ROLES;
export const OFFICE_ROLES: StaffRole[] = ["super_admin", "admin"];
export const MANAGER_ALERT_ROLES: StaffRole[] = ["super_admin", "care_coordinator"];

export function roleAtLeast(sc: StaffCtx, role: StaffRole) {
  if (ROLE_RANK[sc.staff.role as StaffRole] < ROLE_RANK[role]) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient role" });
  }
}

export async function audit(
  actorName: string,
  action: string,
  entityType: string,
  entityId?: number | string,
  detail?: unknown,
) {
  await db
    .from("auditLog")
    .insert({
      actorName,
      action,
      entityType,
      entityId: entityId != null ? String(entityId) : null,
      detail: detail as never,
    })
    .catch(() => {});
}

export async function notify(opts: {
  staffId?: number;
  type: string;
  title: string;
  body?: string;
  link?: string;
}) {
  await db
    .from("notifications")
    .insert({
      staffId: opts.staffId ?? null,
      channel: "in_app",
      type: opts.type,
      title: opts.title,
      body: opts.body,
      link: opts.link,
    })
    .catch(() => {});
  if (opts.staffId) waitUntil(emailStaff(opts.staffId, opts).catch(() => {}));
}

/** Email copy of an in-app notification, sent in the background so the request isn't held up by SMTP. */
async function emailStaff(staffId: number, opts: { title: string; body?: string; link?: string }) {
  const staff = await db.from("staffProfiles").eq("id", staffId).first<StaffProfile>();
  if (!staff?.email || !canUseApp(staff)) return;
  const org = await orgProfile();
  const firstName = staff.fullName?.split(" ")[0] || "there";
  const link = opts.link ? `${appUrl()}${opts.link.startsWith("/") ? "" : "/"}${opts.link}` : appUrl();
  await sendEmail({
    to: staff.email,
    subject: opts.title,
    body: `Hello ${firstName},${opts.body ? `\n\n${opts.body}` : ""}\n\nOpen it in UniqueCare Connect:\n${link}\n\n${org.name}`,
    kind: "staff_notification",
    relatedType: "staff",
    relatedId: staffId,
  });
}

/** Notify every staff member holding one of the given roles. */
export async function notifyRoles(
  roles: StaffRole[],
  opts: { type: string; title: string; body?: string; link?: string },
) {
  for (const role of roles) {
    const members = await db.from("staffProfiles").eq("role", role).many<StaffProfile>();
    for (const member of members) {
      await notify({ ...opts, staffId: Number(member.id) });
    }
  }
}

/** Automation switch from Settings. A rule with no row is treated as on. */
export async function ruleEnabled(key: string): Promise<boolean> {
  const rule = await db.from("automationRules").eq("key", key).first<{ enabled: boolean | null }>();
  return rule?.enabled !== false;
}

export async function nextTicketNo(): Promise<string> {
  const last = await db.from("tickets").order("id", "desc").limit(1).first<{ ticketNo: string }>();
  const n = last ? parseInt(last.ticketNo.replace(/\D/g, ""), 10) + 1 : 100;
  return `UC-${String(n).padStart(6, "0")}`;
}

export const SLA_MINUTES: Record<string, [number, number]> = {
  urgent: [30, 120],
  high: [60, 480],
  normal: [240, 1440],
  low: [1440, 4320],
};
