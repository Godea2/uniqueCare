import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import { db } from "../db";
import {
  STAFF_ROLES,
  type AuditLog,
  type AutomationRules,
  type Candidates,
  type Clients,
  type CrmContacts,
  type Notifications,
  type Organisations,
  type StaffProfiles,
  type Teams,
  type Tickets,
  type Visits,
} from "@db/schema";
import { getStaff, requireRole, audit } from "../util";

export const coreRouter = createRouter({
  /** Current signed-in user's staff profile */
  me: authedQuery.query(async ({ ctx }) => {
    const { staff } = await getStaff(ctx);
    return staff;
  }),

  /** "View as" role switching (super_admin/admin only) */
  setRole: authedQuery
    .input(z.object({ role: z.enum(STAFF_ROLES) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      await db.from("staffProfiles").eq("id", sc.staff.id).update({ role: input.role });
      await audit(sc.staff.fullName, "role_changed", "staff_profile", sc.staff.id, { to: input.role });
      return { ok: true };
    }),

  updateMyProfile: authedQuery
    .input(z.object({
      fullName: z.string().min(2).optional(),
      phone: z.string().optional(),
      homePostcode: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      await db.from("staffProfiles").eq("id", sc.staff.id).update(input);
      return { ok: true };
    }),

  staffList: authedQuery.query(async ({ ctx }) => {
    await getStaff(ctx);
    return db.from("staffProfiles").isNull("deletedAt").many<StaffProfiles>();
  }),

  teams: authedQuery.query(async () => db.from("teams").many<Teams>()),

  organisation: authedQuery.query(async () => {
    return (await db.from("organisations").first<Organisations>()) ?? null;
  }),

  updateOrganisation: authedQuery
    .input(z.object({
      name: z.string().min(2).optional(),
      address: z.string().optional(),
      cqcLocationId: z.string().optional(),
      screeningThreshold: z.number().min(50).max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin");
      const org = await db.from("organisations").first<Organisations>();
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const settings = { ...(org.settings as object ?? {}) };
      if (input.screeningThreshold) (settings as Record<string, unknown>).screeningThreshold = input.screeningThreshold;
      await db.from("organisations").eq("id", org.id).update({
        name: input.name ?? org.name,
        address: input.address ?? org.address,
        cqcLocationId: input.cqcLocationId ?? org.cqcLocationId,
        settings,
      });
      await audit(sc.staff.fullName, "organisation_updated", "organisations", org.id, input);
      return { ok: true };
    }),

  // ── Notifications ──
  myNotifications: authedQuery.query(async ({ ctx }) => {
    const sc = await getStaff(ctx);
    return db.from("notifications").eq("staffId", sc.staff.id).order("createdAt", "desc").limit(50).many<Notifications>();
  }),
  markNotificationRead: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      await db.from("notifications").eq("id", input.id).eq("staffId", sc.staff.id).update({ readAt: new Date() });
      return { ok: true };
    }),
  markAllRead: authedQuery.mutation(async ({ ctx }) => {
    const sc = await getStaff(ctx);
    await db.from("notifications").eq("staffId", sc.staff.id).isNull("readAt").update({ readAt: new Date() });
    return { ok: true };
  }),

  // ── Role-aware dashboard stats ──
  dashboard: authedQuery.query(async ({ ctx }) => {
    const sc = await getStaff(ctx);
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(todayStart.getTime() + 7 * 864e5);
    const in30 = new Date(now.getTime() + 30 * 864e5);

    const openTickets = await db.from("tickets").notIn("status", ["resolved", "closed"]).count();
    const myTickets = await db.from("tickets").eq("assigneeId", sc.staff.id).notIn("status", ["resolved", "closed"]).count();
    const unfilled = await db.from("visits").eq("status", "unassigned").gte("scheduledStart", todayStart).lte("scheduledStart", weekEnd).count();
    const newApplicants = await db.from("applications").eq("stage", "applied").count();
    const docsToVerify = await db.from("complianceDocuments").eq("status", "uploaded").count();
    const expiringCompliance = await db.from("complianceDocuments").eq("status", "verified").lte("expiresAt", in30.toISOString().slice(0, 10)).count();
    const reviewsDue = await db.from("planReviews").in("status", ["due", "overdue"]).count();
    const overdueReviews = await db.from("planReviews").eq("status", "overdue").count();
    const myOpenTasks = await db.from("tasks").eq("assigneeId", sc.staff.id).eq("status", "open").count();
    const liveJobs = await db.from("jobPostings").eq("status", "live").count();
    const activeClients = await db.from("clients").eq("status", "active").count();
    const activeStaff = await db.from("staffProfiles").eq("status", "active").count();
    const safeguardingOpen = await db.from("tickets").eq("category", "safeguarding_concern").notIn("status", ["resolved", "closed"]).count();

    // coverage for current week
    const monday = new Date(todayStart);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const weekVisits = await db.from("visits").gte("scheduledStart", monday).lte("scheduledStart", weekEnd).many<Visits>();
    const filled = weekVisits.filter((v) => !["unassigned", "partially_assigned"].includes(v.status)).length;
    const coverage = weekVisits.length ? Math.round((filled / weekVisits.length) * 100) : 100;

    return {
      role: sc.staff.role, name: sc.staff.fullName,
      openTickets, myTickets, unfilled, newApplicants, docsToVerify,
      expiringCompliance, reviewsDue, overdueReviews, myOpenTasks,
      liveJobs, activeClients, activeStaff, safeguardingOpen,
      weekVisits: weekVisits.length, coverage,
    };
  }),

  // ── Global search (Ctrl+K) ──
  globalSearch: authedQuery
    .input(z.object({ q: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await getStaff(ctx);
      const q = `%${input.q}%`;
      const [clientRows, staffRows, contactRows, ticketRows, candidateRows] = await Promise.all([
        db.from("clients").or([
          { op: "like", field: "firstName", value: q },
          { op: "like", field: "lastName", value: q },
          { op: "like", field: "clientRef", value: q },
          { op: "like", field: "postcode", value: q },
        ]).limit(5).many<Clients>(),
        db.from("staffProfiles").or([
          { op: "like", field: "fullName", value: q },
          { op: "like", field: "email", value: q },
        ]).limit(5).many<StaffProfiles>(),
        db.from("crmContacts").or([
          { op: "like", field: "firstName", value: q },
          { op: "like", field: "lastName", value: q },
          { op: "like", field: "phone", value: q },
          { op: "like", field: "email", value: q },
        ]).limit(5).many<CrmContacts>(),
        db.from("tickets").or([
          { op: "like", field: "ticketNo", value: q },
          { op: "like", field: "subject", value: q },
        ]).limit(5).many<Tickets>(),
        db.from("candidates").or([
          { op: "like", field: "firstName", value: q },
          { op: "like", field: "lastName", value: q },
          { op: "like", field: "email", value: q },
          { op: "like", field: "phone", value: q },
        ]).limit(5).many<Candidates>(),
      ]);
      return {
        clients: clientRows, staff: staffRows, contacts: contactRows,
        tickets: ticketRows, candidates: candidateRows,
      };
    }),

  // ── Audit log (super_admin) ──
  auditLog: authedQuery
    .input(z.object({ entityType: z.string().optional(), limit: z.number().default(100) }))
    .query(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      let query = db.from("auditLog").order("at", "desc").limit(input.limit);
      if (input.entityType) query = query.eq("entityType", input.entityType);
      return query.many<AuditLog>();
    }),

  // ── Automation rules ──
  automationRules: authedQuery.query(async ({ ctx }) => {
    await getStaff(ctx);
    return db.from("automationRules").many<AutomationRules>();
  }),
  toggleAutomation: authedQuery
    .input(z.object({ id: z.number(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin");
      await db.from("automationRules").eq("id", input.id).update({ enabled: input.enabled });
      await audit(sc.staff.fullName, input.enabled ? "automation_enabled" : "automation_disabled", "automation_rules", input.id);
      return { ok: true };
    }),
});
