import { TRPCError } from "@trpc/server";
import { db } from "./db";
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
 * - Already linked: return it.
 * - A profile created by HR (e.g. on hire) with the same email: link it.
 * - Otherwise create one. Named super admins (and the very first user) become
 *   the Registered Manager; everyone else waits as "pending" until an admin
 *   approves them in the staff directory.
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

async function resolveStaff(user: User): Promise<StaffCtx> {
  const existing = await db.from("staffProfiles").eq("userId", user.id).first<StaffProfile>();
  if (existing) return { staff: existing, user };

  const email = user.email?.trim().toLowerCase();
  if (email) {
    const unlinked = await db.from("staffProfiles").isNull("userId").isNull("deletedAt").many<StaffProfile>();
    const match = unlinked.find((s) => s.email?.trim().toLowerCase() === email);
    if (match) {
      await db.from("staffProfiles").eq("id", match.id).update({ userId: user.id });
      return { staff: { ...match, userId: user.id }, user };
    }
  }

  const name = user.name ?? user.email ?? "Staff";
  const managers = await db.from("staffProfiles").eq("role", "super_admin").isNull("deletedAt").count();
  const isManager = isNamedSuperAdmin(user.email) || managers === 0;
  const [created] = await db.from("staffProfiles").insert<StaffProfile>({
    userId: user.id,
    fullName: name,
    email: user.email,
    role: isManager ? "super_admin" : "care_worker",
    jobTitle: isManager ? "Registered Manager" : null,
    status: isManager ? "active" : "pending",
    contractedHours: "37.5",
    avatarColor: "#0A2E5C",
  });
  if (!isManager) {
    await notifyRoles(["super_admin", "admin"], {
      type: "staff_pending",
      title: "New account awaiting approval",
      body: `${name} (${user.email ?? "no email"}) signed up and needs a role before they can use the app.`,
      link: "/staff",
    });
  }
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
