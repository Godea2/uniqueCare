import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, signedInQuery } from "../middleware";
import { db } from "../db";
import { geocodePostcode } from "../lib/geo";
import { mailProvider, resendQueued, sendTestEmail } from "../lib/mailer";
import {
  STAFF_ROLES,
  type Applications,
  type AuditLog,
  type AutomationRules,
  type Candidates,
  type Clients,
  type CrmContacts,
  type EmailOutbox,
  type Notifications,
  type Organisations,
  type StaffProfiles,
  type Teams,
  type Tickets,
  type Visits,
} from "@db/schema";
import { getStaff, requireRole, audit, notify } from "../util";

export const coreRouter = createRouter({
  /** Current signed-in user's staff profile */
  me: signedInQuery.query(async ({ ctx }) => {
    const { staff } = await getStaff(ctx);
    return staff;
  }),

  /**
   * "View as" role switching for managers. The real role is kept in homeRole
   * so a manager previewing as a care worker can always switch back.
   */
  setRole: authedQuery
    .input(z.object({ role: z.enum(STAFF_ROLES) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const realRole = sc.staff.homeRole ?? sc.staff.role;
      if (realRole !== "super_admin" && realRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only managers can preview other roles." });
      }
      if (realRole === "admin" && input.role === "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admins cannot preview as Registered Manager." });
      }
      await db.from("staffProfiles").eq("id", sc.staff.id).update({
        role: input.role,
        homeRole: input.role === realRole ? null : realRole,
      });
      await audit(sc.staff.fullName, "role_preview", "staff_profile", sc.staff.id, { as: input.role, realRole });
      return { ok: true };
    }),

  /** Approve, change role/status or update the job details of a staff member. */
  updateStaff: authedQuery
    .input(z.object({
      id: z.number(),
      role: z.enum(STAFF_ROLES).optional(),
      status: z.enum(["active", "onboarding", "pending", "left"]).optional(),
      jobTitle: z.string().trim().max(120).optional(),
      contractedHours: z.number().min(0).max(60).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const actorRole = sc.staff.homeRole ?? sc.staff.role;
      if (actorRole !== "super_admin" && actorRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only managers can change staff accounts." });
      }
      const target = await db.from("staffProfiles").eq("id", input.id).first<StaffProfiles>();
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      const targetRole = target.homeRole ?? target.role;
      if (actorRole !== "super_admin" && (targetRole === "super_admin" || input.role === "super_admin")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only a Registered Manager can change Registered Manager accounts." });
      }
      if (target.id === sc.staff.id && (input.status && input.status !== "active" || input.role && input.role !== actorRole)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot change your own role or lock your own account." });
      }
      if (targetRole === "super_admin" && (input.status === "left" || (input.role && input.role !== "super_admin"))) {
        const managers = await db.from("staffProfiles").isNull("deletedAt").many<StaffProfiles>();
        const remaining = managers.filter((m) => m.id !== target.id && (m.homeRole ?? m.role) === "super_admin" && m.status !== "left");
        if (remaining.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "At least one Registered Manager must remain." });
        }
      }
      const patch: Partial<StaffProfiles> = {};
      if (input.role) { patch.role = input.role; patch.homeRole = null; }
      if (input.status) patch.status = input.status;
      if (input.jobTitle !== undefined) patch.jobTitle = input.jobTitle || null;
      if (input.contractedHours !== undefined) patch.contractedHours = String(input.contractedHours);
      if (input.status === "active" && !target.startDate) patch.startDate = new Date().toISOString().slice(0, 10);
      await db.from("staffProfiles").eq("id", input.id).update(patch);
      await audit(sc.staff.fullName, "staff_updated", "staff_profile", input.id, {
        before: { role: target.role, status: target.status, jobTitle: target.jobTitle },
        after: patch,
      });
      if (target.status === "pending" && input.status === "active") {
        await notify({
          staffId: target.id, type: "account_approved", title: "Your account has been approved",
          body: "You can now sign in to UniqueCare Connect with your email and password.", link: "/",
        });
      }
      return { ok: true };
    }),

  updateMyProfile: signedInQuery
    .input(z.object({
      fullName: z.string().min(2).optional(),
      phone: z.string().optional(),
      homePostcode: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const patch: Partial<StaffProfiles> = { ...input };
      if (input.homePostcode !== undefined) {
        const home = input.homePostcode.trim() ? await geocodePostcode(input.homePostcode) : null;
        if (input.homePostcode.trim() && !home) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "That postcode wasn't recognised." });
        }
        patch.homePostcode = input.homePostcode.trim().toUpperCase() || null;
        patch.lat = home ? String(home.lat) : null;
        patch.lng = home ? String(home.lng) : null;
      }
      await db.from("staffProfiles").eq("id", sc.staff.id).update(patch);
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
      signatoryName: z.string().trim().max(120).optional(),
      signatoryTitle: z.string().trim().max(120).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin");
      let org = await db.from("organisations").first<Organisations>();
      if (!org) {
        await db.from("organisations").insert({
          name: input.name ?? "Unique Care UK", settings: { timezone: "Europe/London", screeningThreshold: 85 },
        });
        org = (await db.from("organisations").first<Organisations>())!;
      }
      const settings: Record<string, unknown> = { ...((org.settings as Record<string, unknown> | null) ?? {}) };
      if (input.screeningThreshold) settings.screeningThreshold = input.screeningThreshold;
      if (input.signatoryName !== undefined) settings.signatoryName = input.signatoryName;
      if (input.signatoryTitle !== undefined) settings.signatoryTitle = input.signatoryTitle;
      await db.from("organisations").eq("id", org.id).update({
        name: input.name ?? org.name,
        address: input.address ?? org.address,
        cqcLocationId: input.cqcLocationId ?? org.cqcLocationId,
        settings: settings as never,
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
      const sc = await getStaff(ctx);
      const seesCandidates = ["super_admin", "admin", "team_leader", "interview_panel"].includes(sc.staff.role);
      const q = `%${input.q.replace(/[%_\\]/g, "\\$&")}%`;
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
        seesCandidates
          ? db.from("candidates").or([
            { op: "like", field: "firstName", value: q },
            { op: "like", field: "lastName", value: q },
            { op: "like", field: "email", value: q },
            { op: "like", field: "phone", value: q },
          ]).limit(5).many<Candidates>()
          : Promise.resolve([] as Candidates[]),
      ]);
      const apps = candidateRows.length
        ? await db.from("applications").in("candidateId", candidateRows.map((c) => c.id)).order("createdAt", "desc").many<Applications>()
        : [];
      return {
        clients: clientRows, staff: staffRows, contacts: contactRows,
        tickets: ticketRows,
        candidates: candidateRows.map((c) => ({
          ...c,
          applicationId: apps.find((a) => a.candidateId === c.id)?.id ?? null,
        })),
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

  emailStatus: authedQuery.query(async ({ ctx }) => {
    requireRole(await getStaff(ctx), "super_admin", "admin");
    const queued = await db.from("emailOutbox").eq("status", "queued").order("id", "desc").limit(50).many<EmailOutbox>();
    const recent = await db.from("emailOutbox").order("id", "desc").limit(15).many<EmailOutbox>();
    const lastFailure = await db.from("auditLog").eq("action", "email_queued").order("id", "desc").limit(1).first<AuditLog>();
    const failureDetail = (lastFailure?.detail ?? null) as { error?: string; to?: string } | null;
    return {
      ...mailProvider(),
      queued,
      recent,
      lastError: failureDetail?.error
        ? { message: failureDetail.error, to: failureDetail.to ?? null, at: lastFailure!.at }
        : null,
    };
  }),

  resendQueuedEmails: authedQuery
    .input(z.object({ ids: z.array(z.number()).max(50).optional() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      return resendQueued(sc.staff.fullName, input.ids);
    }),

  discardQueuedEmail: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      await db.from("emailOutbox").eq("id", input.id).eq("status", "queued").update({ status: "discarded" });
      await audit(sc.staff.fullName, "email_discarded", "email_outbox", input.id);
      return { ok: true };
    }),

  sendTestEmail: authedQuery.mutation(async ({ ctx }) => {
    const sc = await getStaff(ctx);
    requireRole(sc, "super_admin", "admin");
    const to = sc.staff.email ?? sc.user.email;
    if (!to) throw new TRPCError({ code: "BAD_REQUEST", message: "Your account has no email address." });
    const result = await sendTestEmail(to, sc.staff.fullName);
    if (!result.ok) throw new TRPCError({ code: "BAD_REQUEST", message: `Test email to ${to} failed: ${result.error}` });
    return { to };
  }),
});
