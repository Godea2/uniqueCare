import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import { db } from "../db";
import type {
  CarePackages,
  ClientAssignedWorkers,
  ClientPreferences,
  ClientRequiredSkills,
  Clients,
  ReassignmentRequests,
  RotaWeeks,
  StaffAvailability,
  StaffProfiles,
  StaffUnavailability,
  TravelCache,
  VisitAssignments,
  VisitTemplates,
  Visits,
} from "@db/schema";
import { getStaff, requireRole, audit, notify, notifyRoles } from "../util";
import { assignRota, type EngineVisit, type EngineWorker } from "../rota/engine";
import { geocodePostcode, londonTime } from "../lib/geo";

const DAY = 24 * 60;

/** Midnight at the start of the rota week, UK time, so minute offsets match UK wall-clock availability. */
function mondayOf(weekStart: string) {
  return londonTime(weekStart.slice(0, 10), "00:00");
}
function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371, dLat = ((lat2 - lat1) * Math.PI) / 180, dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function loadEngineInput(weekId: number, onlyVisitIds?: number[]) {
  const week = await db.from("rotaWeeks").eq("id", weekId).first<RotaWeeks>();
  if (!week) throw new TRPCError({ code: "NOT_FOUND", message: "Rota week not found" });
  const monday = mondayOf(week.weekStartDate);
  const allVisits = await db.from("visits").eq("rotaWeekId", weekId).many<Visits>();
  const targetVisits = onlyVisitIds ? allVisits.filter((v) => onlyVisitIds.includes(Number(v.id))) : allVisits.filter((v) => v.status !== "cancelled");
  const clientRows = await db.from("clients").isNull("deletedAt").many<Clients>();
  const prefs = await db.from("clientPreferences").many<ClientPreferences>();
  const reqSkills = await db.from("clientRequiredSkills").many<ClientRequiredSkills>();
  const assignedWorkers = await db.from("clientAssignedWorkers").many<ClientAssignedWorkers>();
  const staff = await db.from("staffProfiles").eq("status", "active").isNull("deletedAt").many<StaffProfiles>();
  const avail = await db.from("staffAvailability").many<StaffAvailability>();
  const unavail = await db.from("staffUnavailability").eq("status", "approved").many<StaffUnavailability>();
  const existingAssignments = await db.from("visitAssignments").in("status", ["assigned", "accepted"]).many<VisitAssignments>();
  const weekStartMs = monday.getTime();

  // travel matrix between client postcodes (haversine fallback: km / 30kmh + 5 min)
  const travel = new Map<string, number>();
  const withGeo = clientRows.filter((c) => c.lat && c.lng);
  const cached = await db.from("travelCache").many<TravelCache>();
  for (const a of withGeo) {
    for (const b of withGeo) {
      if (a.id === b.id) continue;
      const key = `${a.id}->${b.id}`;
      const hit = cached.find((c) => c.fromPostcode === a.postcode && c.toPostcode === b.postcode);
      if (hit) travel.set(key, hit.minutes);
      else {
        const km = haversineKm(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
        travel.set(key, Math.round((km / 30) * 60 + 5));
      }
    }
  }

  const evVisits: EngineVisit[] = targetVisits.map((v) => {
    const pref = prefs.find((p) => p.clientId === v.clientId);
    const startMin = Math.round((new Date(v.scheduledStart).getTime() - weekStartMs) / 60000);
    const endMin = Math.round((new Date(v.scheduledEnd).getTime() - weekStartMs) / 60000);
    const dow = Math.floor(startMin / DAY);
    const locked = onlyVisitIds
      ? []
      : existingAssignments.filter((a) => a.visitId === v.id).map((a) => Number(a.staffId));
    return {
      id: Number(v.id), clientId: Number(v.clientId),
      dayOfWeek: dow, startMin, endMin,
      callType: v.callType as "single" | "double",
      requiredSkills: reqSkills.filter((r) => r.clientId === v.clientId).map((r) => r.skill),
      excludedStaffIds: (pref?.excludedStaffIds as number[]) ?? [],
      preferredStaffIds: (pref?.preferredStaffIds as number[]) ?? [],
      primaryStaffId: assignedWorkers.find((w) => w.clientId === v.clientId && w.isPrimary)?.staffId ?? null,
      preferredGender: (pref?.preferredGender as "any" | "female" | "male") ?? "any",
      preferredLanguage: pref?.preferredLanguage ?? null,
      lockedStaffIds: locked,
    };
  });

  const workers: EngineWorker[] = staff
    .filter((s2) => ["care_worker", "team_leader", "supervisor"].includes(s2.role))
    .map((w) => {
      const wAvail: Record<number, { start: number; end: number }[]> = {};
      for (const a of avail.filter((a) => a.staffId === w.id)) {
        (wAvail[a.dayOfWeek] ??= []).push({ start: toMin(a.startTime), end: toMin(a.endTime) });
      }
      const wUn = unavail.filter((u) => u.staffId === w.id).map((u) => ({
        startMin: Math.max(0, Math.round((new Date(u.startsAt).getTime() - weekStartMs) / 60000)),
        endMin: Math.min(7 * DAY, Math.round((new Date(u.endsAt).getTime() - weekStartMs) / 60000)),
      }));
      return {
        id: Number(w.id), gender: w.gender, languages: (w.languages as string[]) ?? [],
        skills: (w.skills as string[]) ?? [], drives: !!w.drives,
        contractedHours: Number(w.contractedHours ?? 0), maxWeeklyHours: Number(w.maxWeeklyHours ?? 48),
        wtdOptOut: !!w.wtdOptOut, availability: wAvail, unavailability: wUn,
        assignedHours: 0,
      };
    });

  return { week, monday, visits: evVisits, workers, travel, existingAssignments };
}

async function applyAssignments(weekId: number, visitSubset: number[] | undefined) {
  const { visits: evVisits, workers, travel } = await loadEngineInput(weekId, visitSubset);
  const result = assignRota({ visits: evVisits.filter((v) => v.lockedStaffIds.length === 0 || (v.callType === "double" && v.lockedStaffIds.length < 2)), workers, travel });
  for (const a of result.assignments) {
    await db.from("visitAssignments").insert({
      visitId: a.visitId, staffId: a.staffId, slot: a.slot,
      assignedBy: "system", assignmentReason: a.reason, travelMinutesFromPrevious: a.travelMinutes,
    });
  }
  // refresh visit statuses
  const affected = new Set([...result.assignments.map((a) => a.visitId), ...result.unassigned.map((u) => u.visitId)]);
  for (const vid of affected) {
    const v = (await db.from("visits").eq("id", vid).first<Visits>())!;
    const asg = await db.from("visitAssignments")
      .eq("visitId", vid)
      .in("status", ["assigned", "accepted"])
      .many<VisitAssignments>();
    const needed = v.callType === "double" ? 2 : 1;
    const status = asg.length >= needed ? "assigned" : asg.length > 0 ? "partially_assigned" : "unassigned";
    await db.from("visits").eq("id", vid).update({ status });
  }
  return result;
}

export const rotaRouter = createRouter({
  // ── Clients ──
  clients: authedQuery.query(async () => {
    const rows = await db.from("clients").isNull("deletedAt").order("lastName", "asc").many<Clients>();
    const prefs = await db.from("clientPreferences").many<ClientPreferences>();
    const skills = await db.from("clientRequiredSkills").many<ClientRequiredSkills>();
    const pkgs = await db.from("carePackages").many<CarePackages>();
    return rows.map((c) => ({
      ...c,
      preferences: prefs.find((p) => p.clientId === c.id) ?? null,
      requiredSkills: skills.filter((s2) => s2.clientId === c.id).map((s2) => s2.skill),
      package: pkgs.filter((p) => p.clientId === c.id).pop() ?? null,
    }));
  }),

  createClient: authedQuery
    .input(z.object({
      firstName: z.string().min(1), lastName: z.string().min(1), dob: z.string().optional(),
      gender: z.string().optional(), addressLine1: z.string(), town: z.string(), postcode: z.string().min(4),
      phone: z.string().optional(), fundingSource: z.enum(["local_authority", "nhs_chc", "private", "mixed"]),
      riskLevel: z.enum(["low", "medium", "high"]), accessNotes: z.string().optional(),
      requiredSkills: z.array(z.string()).default([]), preferredGender: z.enum(["any", "female", "male"]).default("any"),
      commissionedHoursPerWeek: z.number().min(0.5).max(168).default(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "care_coordinator");
      const geo = await geocodePostcode(input.postcode);
      if (!geo) throw new TRPCError({ code: "BAD_REQUEST", message: "That postcode was not recognised. Check it and try again." });
      const refs = await db.from("clients").many<Clients>();
      const highest = refs.reduce((max, c) => Math.max(max, Number(/^UC-C-(\d+)$/.exec(c.clientRef)?.[1] ?? 0)), 0);
      const [row] = await db.from("clients").insert<Clients>({
        clientRef: `UC-C-${String(highest + 1).padStart(4, "0")}`,
        firstName: input.firstName, lastName: input.lastName, dob: input.dob ?? null,
        gender: input.gender ?? null, addressLine1: input.addressLine1, town: input.town,
        postcode: input.postcode, phone: input.phone ?? null, fundingSource: input.fundingSource,
        riskLevel: input.riskLevel, accessNotes: input.accessNotes ?? null, status: "active",
        startDate: new Date().toISOString().slice(0, 10),
        lat: String(geo.lat), lng: String(geo.lng),
      });
      const cid = row.id;
      await db.from("clientPreferences").insert({ clientId: cid, preferredGender: input.preferredGender });
      for (const sk of input.requiredSkills) await db.from("clientRequiredSkills").insert({ clientId: cid, skill: sk });
      await db.from("carePackages").insert({
        clientId: cid, effectiveFrom: new Date().toISOString().slice(0, 10),
        commissionedHoursPerWeek: String(input.commissionedHoursPerWeek),
      });
      await audit(sc.staff.fullName, "client_created", "clients", cid, { name: `${input.firstName} ${input.lastName}` });
      return { id: cid };
    }),

  clientDetail: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const c = await db.from("clients").eq("id", input.id).first<Clients>();
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const pref = await db.from("clientPreferences").eq("clientId", c.id).first<ClientPreferences>() ?? null;
      const skills = await db.from("clientRequiredSkills").eq("clientId", c.id).many<ClientRequiredSkills>();
      const pkgs = await db.from("carePackages").eq("clientId", c.id).many<CarePackages>();
      const tpls = await db.from("visitTemplates").eq("clientId", c.id).many<VisitTemplates>();
      const workers = await db.from("clientAssignedWorkers").eq("clientId", c.id).many<ClientAssignedWorkers>();
      const staff = await db.from("staffProfiles").many<StaffProfiles>();
      const vts = await db.from("visits").eq("clientId", c.id).order("scheduledStart", "desc").limit(40).many<Visits>();
      const asg = await db.from("visitAssignments").many<VisitAssignments>();
      return {
        client: c, preferences: pref, requiredSkills: skills.map((x) => x.skill),
        packages: pkgs, templates: tpls,
        workers: workers.map((w) => ({ ...w, name: staff.find((s2) => s2.id === w.staffId)?.fullName })),
        visits: vts.map((v) => ({
          ...v,
          assignments: asg.filter((a) => a.visitId === v.id && ["assigned", "accepted"].includes(a.status))
            .map((a) => ({ ...a, name: staff.find((s2) => s2.id === a.staffId)?.fullName })),
        })),
      };
    }),

  /** Regular visit pattern for a client — the rota is generated from these each week. */
  addVisitTemplate: authedQuery
    .input(z.object({
      clientId: z.number(),
      days: z.array(z.number().int().min(0).max(6)).min(1),
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      durationMinutes: z.number().int().min(15).max(720),
      visitType: z.string().trim().min(2).max(60),
      callType: z.enum(["single", "double"]),
      flexibilityMinutes: z.number().int().min(0).max(120).default(15),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "care_coordinator");
      const pkg = (await db.from("carePackages").eq("clientId", input.clientId).many<CarePackages>()).pop();
      if (!pkg) throw new TRPCError({ code: "BAD_REQUEST", message: "This client has no care package yet." });
      for (const day of input.days) {
        await db.from("visitTemplates").insert({
          carePackageId: pkg.id, clientId: input.clientId, dayOfWeek: day, startTime: input.startTime,
          durationMinutes: input.durationMinutes, callType: input.callType,
          visitType: input.visitType.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
          flexibilityMinutes: input.flexibilityMinutes,
        });
      }
      await audit(sc.staff.fullName, "visit_template_added", "clients", input.clientId, { days: input.days, startTime: input.startTime });
      return { ok: true };
    }),

  removeVisitTemplate: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "care_coordinator");
      const tpl = await db.from("visitTemplates").eq("id", input.id).first<VisitTemplates>();
      if (!tpl) throw new TRPCError({ code: "NOT_FOUND" });
      await db.from("visitTemplates").eq("id", input.id).delete();
      await audit(sc.staff.fullName, "visit_template_removed", "clients", tpl.clientId, { id: input.id });
      return { ok: true };
    }),

  // ── Rota weeks ──
  weeks: authedQuery.query(async () => {
    return db.from("rotaWeeks").order("weekStartDate", "desc").limit(12).many<RotaWeeks>();
  }),

  generateWeek: authedQuery
    .input(z.object({ weekStartDate: z.string() })) // YYYY-MM-DD (Monday)
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "care_coordinator");
      let week = await db.from("rotaWeeks").eq("weekStartDate", input.weekStartDate).first<RotaWeeks>();
      if (week && week.status !== "draft")
        throw new TRPCError({ code: "CONFLICT", message: "This week is already published/locked." });
      if (!week) {
        const [created] = await db.from("rotaWeeks").insert<RotaWeeks>({ weekStartDate: input.weekStartDate, status: "draft" });
        week = created;
      } else {
        // regenerate: clear draft visits
        const oldVisits = await db.from("visits").eq("rotaWeekId", week.id).many<Visits>();
        for (const v of oldVisits) await db.from("visitAssignments").eq("visitId", v.id).delete();
        await db.from("visits").eq("rotaWeekId", week.id).delete();
      }
      const tpls = await db.from("visitTemplates").many<VisitTemplates>();
      const clientRows = await db.from("clients").eq("status", "active").many<Clients>();
      const activeClientIds = new Set(clientRows.map((c) => Number(c.id)));
      let created = 0;
      for (const t of tpls) {
        if (!activeClientIds.has(Number(t.clientId))) continue;
        const day = new Date(`${input.weekStartDate}T12:00:00Z`);
        day.setUTCDate(day.getUTCDate() + t.dayOfWeek);
        const start = londonTime(day.toISOString().slice(0, 10), t.startTime.slice(0, 5));
        const end = new Date(start.getTime() + t.durationMinutes * 60000);
        await db.from("visits").insert({
          rotaWeekId: week.id, clientId: t.clientId, visitTemplateId: t.id,
          scheduledStart: start, scheduledEnd: end, callType: t.callType,
          visitType: t.visitType, status: "unassigned",
        });
        created++;
      }
      const result = await applyAssignments(Number(week.id), undefined);
      await audit(sc.staff.fullName, "rota_generated", "rota_weeks", week.id, {
        visits: created, assigned: result.assignments.length, unassigned: result.unassigned.length,
      });
      return { weekId: Number(week.id), visits: created, assigned: result.assignments.length, unassigned: result.unassigned.length };
    }),

  weekData: authedQuery
    .input(z.object({ weekId: z.number() }))
    .query(async ({ input }) => {
      const week = await db.from("rotaWeeks").eq("id", input.weekId).first<RotaWeeks>();
      if (!week) throw new TRPCError({ code: "NOT_FOUND" });
      const vts = await db.from("visits").eq("rotaWeekId", input.weekId).order("scheduledStart", "asc").many<Visits>();
      const asg = await db.from("visitAssignments").in("status", ["assigned", "accepted"]).many<VisitAssignments>();
      const clientRows = await db.from("clients").many<Clients>();
      const staff = await db.from("staffProfiles").many<StaffProfiles>();
      return {
        week,
        visits: vts.map((v) => ({
          ...v,
          client: clientRows.find((c) => c.id === v.clientId),
          assignments: asg.filter((a) => a.visitId === v.id).map((a) => ({
            ...a, staff: staff.find((s2) => s2.id === a.staffId),
          })),
        })),
        staff: staff.filter((s2) => ["care_worker", "team_leader", "supervisor"].includes(s2.role) && s2.status === "active"),
      };
    }),

  publishWeek: authedQuery
    .input(z.object({ weekId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "care_coordinator");
      await db.from("rotaWeeks").eq("id", input.weekId).update({
        status: "published", publishedAt: new Date(), publishedBy: sc.staff.fullName,
      });
      // notify all care workers with visits this week
      const vts = await db.from("visits").eq("rotaWeekId", input.weekId).many<Visits>();
      const asg = await db.from("visitAssignments").many<VisitAssignments>();
      const staffSet = new Set(asg.filter((a) => vts.some((v) => v.id === a.visitId)).map((a) => Number(a.staffId)));
      for (const sid of staffSet) {
        await notify({ staffId: sid, type: "rota", title: "Your rota for next week is published", body: "Open My Rota to see your visits.", link: "/me" });
      }
      await audit(sc.staff.fullName, "rota_published", "rota_weeks", input.weekId);
      return { ok: true };
    }),

  reassignVisit: authedQuery
    .input(z.object({ visitId: z.number(), staffId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "care_coordinator");
      const visit = await db.from("visits").eq("id", input.visitId).first<Visits>();
      if (!visit) throw new TRPCError({ code: "NOT_FOUND" });
      // live constraint check
      const check = await checkAssignment(input.visitId, input.staffId);
      if (!check.ok) throw new TRPCError({ code: "BAD_REQUEST", message: check.reason });
      await db.from("visitAssignments")
        .eq("visitId", input.visitId)
        .in("status", ["assigned", "accepted"])
        .update({ status: "reassigned" });
      await db.from("visitAssignments").insert({
        visitId: input.visitId, staffId: input.staffId, slot: "lead", assignedBy: "user",
        assignmentReason: input.reason ?? "Manually assigned by coordinator.",
      });
      await db.from("visits").eq("id", input.visitId).update({ status: "assigned" });
      await notify({ staffId: input.staffId, type: "rota", title: "New visit assigned to you", body: `Visit on ${new Date(visit.scheduledStart).toLocaleString("en-GB")}.`, link: "/me" });
      await audit(sc.staff.fullName, "visit_reassigned", "visits", input.visitId, { staffId: input.staffId });
      return { ok: true };
    }),

  checkAssignment: authedQuery
    .input(z.object({ visitId: z.number(), staffId: z.number() }))
    .query(async ({ input }) => checkAssignment(input.visitId, input.staffId)),

  // ── Unavailability + auto-reassignment ──
  markUnavailable: authedQuery
    .input(z.object({
      staffId: z.number().optional(), startsAt: z.string(), endsAt: z.string(),
      reason: z.enum(["sick", "annual_leave", "training", "personal", "other"]), notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const staffId = input.staffId ?? Number(sc.staff.id);
      if (input.staffId && input.staffId !== Number(sc.staff.id)) {
        requireRole(sc, "super_admin", "admin", "care_coordinator");
      }
      const [row] = await db.from("staffUnavailability").insert<StaffUnavailability>({
        staffId, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt),
        reason: input.reason, notes: input.notes ?? null, status: "approved",
        approvedBy: sc.staff.fullName,
      });
      await audit(sc.staff.fullName, "unavailability_recorded", "staff_unavailability", row.id, { staffId, reason: input.reason });
      // find affected visits and auto-reassign
      const affected = await db.from("visitAssignments")
        .eq("staffId", staffId)
        .in("status", ["assigned", "accepted"])
        .many<VisitAssignments>();
      const affectedVisits: number[] = [];
      for (const a of affected) {
        const v = await db.from("visits").eq("id", a.visitId).first<Visits>();
        if (v && new Date(v.scheduledStart) < new Date(input.endsAt) && new Date(v.scheduledEnd) > new Date(input.startsAt) && !["completed", "cancelled", "missed"].includes(v.status)) {
          affectedVisits.push(Number(v.id));
          await db.from("visitAssignments").eq("id", a.id).update({ status: "reassigned" });
          await db.from("reassignmentRequests").insert({
            visitId: v.id, originalStaffId: staffId,
            reason: `${sc.staff.fullName} marked unavailable (${input.reason})`,
            requestedBy: sc.staff.fullName, status: "open",
          });
        }
      }
      let resolved = 0, manual = 0;
      for (const vid of affectedVisits) {
        const week = await db.from("rotaWeeks").many<RotaWeeks>();
        const v = (await db.from("visits").eq("id", vid).first<Visits>())!;
        const wk = week.find((w) => w.id === v.rotaWeekId);
        if (!wk) continue;
        const result = await applyAssignments(Number(wk.id), [vid]);
        const got = result.assignments.filter((a) => a.visitId === vid);
        const req = await db.from("reassignmentRequests")
          .eq("visitId", vid)
          .eq("status", "open")
          .first<ReassignmentRequests>();
        if (got.length > 0 && req) {
          await db.from("reassignmentRequests").eq("id", req.id).update({
            status: "auto_resolved", resolvedStaffId: got[0].staffId,
            resolutionLog: { assignments: got.map((g) => ({ staffId: g.staffId, reason: g.reason })) } as never,
          });
          await notify({ staffId: got[0].staffId, type: "rota", title: "Visit reassigned to you", body: `Cover visit on ${new Date(v.scheduledStart).toLocaleString("en-GB")}.`, link: "/me" });
          resolved++;
        } else if (req) {
          await db.from("reassignmentRequests").eq("id", req.id).update({
            status: "manual_required",
            resolutionLog: { nearMisses: result.unassigned.find((u) => u.visitId === vid)?.reasons ?? [] } as never,
          });
          await notifyRoles(["care_coordinator", "admin", "super_admin"], {
            type: "rota", title: "Reassignment needs manual review",
            body: `Visit #${vid} could not be auto-reassigned. See the top near-misses.`,
            link: "/rota/reassignments",
          });
          manual++;
        }
      }
      return { ok: true, affected: affectedVisits.length, autoResolved: resolved, manualRequired: manual };
    }),

  reassignments: authedQuery.query(async () => {
    const reqs = await db.from("reassignmentRequests").order("createdAt", "desc").limit(50).many<ReassignmentRequests>();
    const staff = await db.from("staffProfiles").many<StaffProfiles>();
    const vts = await db.from("visits").many<Visits>();
    const clientRows = await db.from("clients").many<Clients>();
    return reqs.map((r) => ({
      ...r,
      originalStaff: staff.find((s2) => s2.id === r.originalStaffId)?.fullName,
      resolvedStaff: staff.find((s2) => s2.id === r.resolvedStaffId)?.fullName,
      visit: vts.find((v) => v.id === r.visitId),
      client: clientRows.find((c) => c.id === vts.find((v) => v.id === r.visitId)?.clientId),
    }));
  }),

  myUnavailability: authedQuery.query(async ({ ctx }) => {
    const sc = await getStaff(ctx);
    return db.from("staffUnavailability").eq("staffId", sc.staff.id).order("startsAt", "desc").many<StaffUnavailability>();
  }),

  myRota: authedQuery.query(async ({ ctx }) => {
    const sc = await getStaff(ctx);
    const asg = await db.from("visitAssignments")
      .eq("staffId", sc.staff.id)
      .in("status", ["assigned", "accepted"])
      .many<VisitAssignments>();
    const vts = await db.from("visits").gte("scheduledStart", new Date(Date.now() - 864e5)).many<Visits>();
    const clientRows = await db.from("clients").many<Clients>();
    const allAsg = await db.from("visitAssignments").in("status", ["assigned", "accepted"]).many<VisitAssignments>();
    const staff = await db.from("staffProfiles").many<StaffProfiles>();
    return vts
      .filter((v) => asg.some((a) => a.visitId === v.id))
      .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime())
      .map((v) => {
        const client = clientRows.find((c) => c.id === v.clientId);
        const partner = v.callType === "double"
          ? allAsg.filter((a) => a.visitId === v.id && a.staffId !== sc.staff.id)
              .map((a) => staff.find((s2) => s2.id === a.staffId)?.fullName)[0]
          : null;
        return { ...v, client, partner, myAssignment: asg.find((a) => a.visitId === v.id) };
      });
  }),

  kpis: authedQuery.query(async () => {
    const now = new Date();
    const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const weekEnd = new Date(monday.getTime() + 7 * 864e5);
    const vts = await db.from("visits").gte("scheduledStart", monday).lte("scheduledStart", weekEnd).many<Visits>();
    const asg = await db.from("visitAssignments").in("status", ["assigned", "accepted"]).many<VisitAssignments>();
    const assignedWorkerRows = await db.from("clientAssignedWorkers").many<ClientAssignedWorkers>();
    const filled = vts.filter((v) => !["unassigned", "partially_assigned"].includes(v.status));
    const missed = vts.filter((v) => v.status === "missed");
    let continuity = 0, counted = 0;
    for (const a of asg) {
      const v = vts.find((x) => x.id === a.visitId);
      if (!v) continue;
      const primary = assignedWorkerRows.find((w) => w.clientId === v.clientId && w.isPrimary);
      counted++;
      if (primary && Number(primary.staffId) === Number(a.staffId)) continuity++;
    }
    const travelTotal = asg.reduce((sum, a) => sum + (a.travelMinutesFromPrevious ?? 0), 0);
    return {
      total: vts.length, filled: filled.length,
      fillRate: vts.length ? Math.round((filled.length / vts.length) * 100) : 100,
      missed: missed.length,
      continuity: counted ? Math.round((continuity / counted) * 100) : 100,
      travelMinutes: travelTotal,
      unassigned: vts.filter((v) => v.status === "unassigned" || v.status === "partially_assigned").length,
    };
  }),

  exportWeekCsv: authedQuery
    .input(z.object({ weekId: z.number() }))
    .query(async ({ input }) => {
      const vts = await db.from("visits").eq("rotaWeekId", input.weekId).order("scheduledStart", "asc").many<Visits>();
      const asg = await db.from("visitAssignments").in("status", ["assigned", "accepted"]).many<VisitAssignments>();
      const clientRows = await db.from("clients").many<Clients>();
      const staff = await db.from("staffProfiles").many<StaffProfiles>();
      const rows = [["Date", "Start", "End", "Client", "Address", "Visit type", "Call type", "Worker(s)", "Status"]];
      for (const v of vts) {
        const c = clientRows.find((x) => x.id === v.clientId);
        const names = asg.filter((a) => a.visitId === v.id).map((a) => staff.find((s2) => s2.id === a.staffId)?.fullName ?? "").filter(Boolean).join(" & ");
        rows.push([
          new Date(v.scheduledStart).toLocaleDateString("en-GB"),
          new Date(v.scheduledStart).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
          new Date(v.scheduledEnd).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
          c ? `${c.firstName} ${c.lastName}` : "", c?.addressLine1 ?? "",
          v.visitType ?? "", v.callType, names || "UNASSIGNED", v.status,
        ]);
      }
      return { csv: rows.map((r) => r.map((c2) => `"${String(c2).replace(/"/g, '""')}"`).join(",")).join("\n") };
    }),
});

async function checkAssignment(visitId: number, staffId: number): Promise<{ ok: boolean; reason?: string }> {
  const visit = await db.from("visits").eq("id", visitId).first<Visits>();
  if (!visit) return { ok: false, reason: "Visit not found" };
  const worker = await db.from("staffProfiles").eq("id", staffId).first<StaffProfiles>();
  if (!worker || worker.status !== "active") return { ok: false, reason: "Worker is not active" };
  const reqSkills = (await db.from("clientRequiredSkills").eq("clientId", visit.clientId).many<ClientRequiredSkills>()).map((r) => r.skill);
  const wSkills = (worker.skills as string[]) ?? [];
  const missing = reqSkills.filter((sk) => !wSkills.includes(sk));
  if (missing.length) return { ok: false, reason: `Missing required skills: ${missing.join(", ")}` };
  const pref = await db.from("clientPreferences").eq("clientId", visit.clientId).first<ClientPreferences>();
  if (pref && ((pref.excludedStaffIds as number[]) ?? []).includes(staffId))
    return { ok: false, reason: "Client has excluded this worker" };
  if (pref && pref.preferredGender !== "any" && worker.gender && pref.preferredGender !== worker.gender)
    return { ok: false, reason: `Client prefers ${pref.preferredGender} carers` };
  const start = new Date(visit.scheduledStart);
  const end = new Date(visit.scheduledEnd);
  const dow = (start.getDay() + 6) % 7;
  const windows = await db.from("staffAvailability")
    .eq("staffId", staffId)
    .eq("dayOfWeek", dow)
    .many<StaffAvailability>();
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  if (!windows.some((w) => toMin(w.startTime) <= startMin && toMin(w.endTime) >= endMin))
    return { ok: false, reason: "Outside the worker's weekly availability" };
  const un = await db.from("staffUnavailability")
    .eq("staffId", staffId)
    .eq("status", "approved")
    .many<StaffUnavailability>();
  if (un.some((u) => new Date(u.startsAt) < end && new Date(u.endsAt) > start))
    return { ok: false, reason: "Worker has approved unavailability over this time" };
  const otherAsg = await db.from("visitAssignments")
    .eq("staffId", staffId)
    .in("status", ["assigned", "accepted"])
    .many<VisitAssignments>();
  for (const a of otherAsg) {
    if (a.visitId === visitId) continue;
    const ov = await db.from("visits").eq("id", a.visitId).first<Visits>();
    if (ov && new Date(ov.scheduledStart).getTime() - 15 * 60000 < end.getTime() && new Date(ov.scheduledEnd).getTime() + 15 * 60000 > start.getTime())
      return { ok: false, reason: "Overlaps another visit (incl. 15 min travel buffer)" };
  }
  return { ok: true };
}
