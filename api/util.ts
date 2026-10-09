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

/** Resolve the signed-in user's staff profile; auto-create on first login. */
export async function getStaff(ctx: TrpcContext): Promise<StaffCtx> {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  const existing = await db.from("staffProfiles").eq("userId", ctx.user.id).first<StaffProfile>();
  if (existing) return { staff: existing, user: ctx.user };
  const name = ctx.user.name ?? ctx.user.email ?? "Staff";
  const managers = await db.from("staffProfiles").eq("role", "super_admin").isNull("deletedAt").count();
  const isManager = isNamedSuperAdmin(ctx.user.email) || managers === 0;
  const [created] = await db.from("staffProfiles").insert<StaffProfile>({
    userId: ctx.user.id,
    fullName: name,
    email: ctx.user.email,
    role: isManager ? "super_admin" : "care_worker",
    jobTitle: isManager ? "Registered Manager" : "Care Worker",
    status: isManager ? "active" : "onboarding",
    contractedHours: "37.5",
    avatarColor: "#0A2E5C",
  });
  return { staff: created, user: ctx.user };
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
