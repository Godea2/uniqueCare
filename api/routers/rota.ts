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
  ComplianceDocuments,
  ComplianceRequirements,
  ReassignmentRequests,
  RotaWeeks,
  StaffAvailability,
  StaffProfiles,
  StaffUnavailability,
  TravelCache,
  VisitAssignments,
  VisitAttendance,
  VisitTemplates,
  Visits,
} from "@db/schema";
import {
  getStaff, requireRole, audit, notify, notifyRoles,
  ROTA_PLANNER_ROLES, ROTA_WRITE_ROLES, CLIENT_DIRECTORY_ROLES,
} from "../util";
import {
  blockRotaOnExpiredMandatory, latestStaffDoc, staffMandatoryDocsOk, MANDATORY_ROTA_KEYS,
} from "../lib/expiry-tracker";
import { assignRota, REST_BREAK_MIN, STUDENT_MAX_WEEKLY_HOURS, type EngineVisit, type EngineWorker } from "../rota/engine";
import { geocodePostcode, londonTime } from "../lib/geo";
import {
  buildWeekWorkbook, dateFromWeekDay, dayNameFromDate, detectAndParseWorkbook,
  normaliseCallType, normaliseClientKey, normaliseVisitType,
  parseSheetDate, parseTimeToHm, type WeekSheetRow,
} from "../rota/week-sheet";

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
  // Previous week's visits (for 11-hour rest across the week boundary)
  const allVisitsPrev = await db.from("visits").lte("scheduledEnd", monday.toISOString()).many<Visits>();
  const targetVisits = onlyVisitIds ? allVisits.filter((v) => onlyVisitIds.includes(Number(v.id))) : allVisits.filter((v) => v.status !== "cancelled");
  const clientRows = await db.from("clients").isNull("deletedAt").many<Clients>();
  const prefs = await db.from("clientPreferences").many<ClientPreferences>();
  const reqSkills = await db.from("clientRequiredSkills").many<ClientRequiredSkills>();
  const assignedWorkers = await db.from("clientAssignedWorkers").many<ClientAssignedWorkers>();
  const staff = await db.from("staffProfiles").eq("status", "active").isNull("deletedAt").many<StaffProfiles>();
  const avail = await db.from("staffAvailability").many<StaffAvailability>();
  const unavail = await db.from("staffUnavailability").eq("status", "approved").many<StaffUnavailability>();
  const existingAssignments = await db.from("visitAssignments").in("status", ["assigned", "accepted"]).many<VisitAssignments>();
  const tplsAll = await db.from("visitTemplates").many<VisitTemplates>();
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
    const client = clientRows.find((c) => c.id === v.clientId);
    const tpl = tplsAll.find((t) => t.id === v.visitTemplateId);
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
      // time-critical: ±30 min (CQC); otherwise template window (default ±60)
      windowMin: client?.timeCritical ? 30 : Math.min(60, Math.max(0, tpl?.flexibilityMinutes ?? 60)),
      requiredSkills: reqSkills.filter((r) => r.clientId === v.clientId).map((r) => r.skill),
      excludedStaffIds: (pref?.excludedStaffIds as number[]) ?? [],
      preferredStaffIds: (pref?.preferredStaffIds as number[]) ?? [],
      primaryStaffId: assignedWorkers.find((w) => w.clientId === v.clientId && w.isPrimary)?.staffId ?? null,
      preferredGender: (pref?.preferredGender as "any" | "female" | "male") ?? "any",
      preferredLanguage: pref?.preferredLanguage ?? null,
      lockedStaffIds: locked,
    };
  });

  const blockExpired = await blockRotaOnExpiredMandatory();
  const staffReqKeys = new Set(
    (await db.from("complianceRequirements").many<ComplianceRequirements>())
      .filter((r) => r.appliesTo === "staff" && r.required)
      .map((r) => r.key),
  );
  // Fall back to known mandatory keys if requirements table has no staff rows yet
  const mandatoryKeys = staffReqKeys.size
    ? staffReqKeys
    : new Set<string>(MANDATORY_ROTA_KEYS);
  const staffDocs = blockExpired
    ? await db.from("complianceDocuments").eq("ownerType", "staff").many<ComplianceDocuments>()
    : [];
  const today = new Date().toISOString().slice(0, 10);
  const workers: EngineWorker[] = staff
    .filter((s2) => ["care_worker", "team_leader", "supervisor"].includes(s2.role))
    .map((w) => {
      const expiredDocKeys = blockExpired
        ? [...mandatoryKeys].filter((key) => {
          const d = latestStaffDoc(staffDocs, Number(w.id), key);
          if (!d || d.status !== "verified") return true;
          if (d.expiresAt && d.expiresAt < today) return true;
          return false;
        })
        : [];
      const wAvail: Record<number, { start: number; end: number }[]> = {};
      for (const a of avail.filter((a) => a.staffId === w.id)) {
        (wAvail[a.dayOfWeek] ??= []).push({ start: toMin(a.startTime), end: toMin(a.endTime) });
      }
      const wUn = unavail.filter((u) => u.staffId === w.id).map((u) => ({
        startMin: Math.max(0, Math.round((new Date(u.startsAt).getTime() - weekStartMs) / 60000)),
        endMin: Math.min(7 * DAY, Math.round((new Date(u.endsAt).getTime() - weekStartMs) / 60000)),
      }));
      const daysOff: number[] = [];
      const pattern = w.workPattern ?? "six_day";
      if (pattern === "six_day") {
        daysOff.push(6);
      } else {
        if (w.fixedDayOff != null) daysOff.push(Number(w.fixedDayOff));
        const flex = w.flexibleDayOff != null ? Number(w.flexibleDayOff) : 6;
        if (!daysOff.includes(flex)) daysOff.push(flex);
      }
      // end of last duty before this week (11-hour rest into Monday)
      const prevAsg = existingAssignments.filter((a) => Number(a.staffId) === Number(w.id));
      let prevDutyEndMin: number | null = null;
      if (prevAsg.length) {
        const pv = allVisitsPrev.filter((v) => prevAsg.some((a) => a.visitId === v.id));
        if (pv.length) {
          const last = pv.reduce((a2, b) =>
            (new Date(a2.scheduledEnd).getTime() > new Date(b.scheduledEnd).getTime() ? a2 : b));
          const m = Math.round((new Date(last.scheduledEnd).getTime() - weekStartMs) / 60000);
          if (m <= 0) prevDutyEndMin = m;
        }
      }
      return {
        id: Number(w.id), gender: w.gender, languages: (w.languages as string[]) ?? [],
        skills: (w.skills as string[]) ?? [], drives: !!w.drives,
        contractedHours: Number(w.contractedHours ?? 0), maxWeeklyHours: Number(w.maxWeeklyHours ?? 48),
        wtdOptOut: !!w.wtdOptOut, isStudent: !!w.isStudent, daysOff, prevDutyEndMin,
        availability: wAvail, unavailability: wUn,
        assignedHours: 0,
        expiredDocKeys,
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
    // Persist time shifts within the client's allowed window
    if (a.movedByMin) {
      const v = await db.from("visits").eq("id", a.visitId).first<Visits>();
      if (v) {
        const start = new Date(new Date(v.scheduledStart).getTime() + a.movedByMin * 60000);
        const end = new Date(new Date(v.scheduledEnd).getTime() + a.movedByMin * 60000);
        await db.from("visits").eq("id", a.visitId).update({
          scheduledStart: start.toISOString(),
          scheduledEnd: end.toISOString(),
        });
      }
    }
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
  clients: authedQuery.query(async ({ ctx }) => {
    requireRole(await getStaff(ctx), ...CLIENT_DIRECTORY_ROLES);
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
      requireRole(sc, ...ROTA_WRITE_ROLES);
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
    .query(async ({ ctx, input }) => {
      requireRole(await getStaff(ctx), ...CLIENT_DIRECTORY_ROLES);
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
      flexibilityMinutes: z.number().int().min(0).max(120).default(60),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...ROTA_WRITE_ROLES);
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
      requireRole(sc, ...ROTA_WRITE_ROLES);
      const tpl = await db.from("visitTemplates").eq("id", input.id).first<VisitTemplates>();
      if (!tpl) throw new TRPCError({ code: "NOT_FOUND" });
      await db.from("visitTemplates").eq("id", input.id).delete();
      await audit(sc.staff.fullName, "visit_template_removed", "clients", tpl.clientId, { id: input.id });
      return { ok: true };
    }),

  /** Edit an existing weekly visit pattern (day, time, duration, type, window). */
  updateVisitTemplate: authedQuery
    .input(z.object({
      id: z.number(),
      dayOfWeek: z.number().int().min(0).max(6).optional(),
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
      durationMinutes: z.number().int().min(15).max(720).optional(),
      visitType: z.string().trim().min(2).max(60).optional(),
      callType: z.enum(["single", "double"]).optional(),
      flexibilityMinutes: z.number().int().min(0).max(120).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...ROTA_WRITE_ROLES);
      const tpl = await db.from("visitTemplates").eq("id", input.id).first<VisitTemplates>();
      if (!tpl) throw new TRPCError({ code: "NOT_FOUND" });
      const patch: Partial<VisitTemplates> = {};
      if (input.dayOfWeek !== undefined) patch.dayOfWeek = input.dayOfWeek;
      if (input.startTime !== undefined) patch.startTime = input.startTime;
      if (input.durationMinutes !== undefined) patch.durationMinutes = input.durationMinutes;
      if (input.visitType !== undefined) {
        patch.visitType = input.visitType.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      }
      if (input.callType !== undefined) patch.callType = input.callType;
      if (input.flexibilityMinutes !== undefined) patch.flexibilityMinutes = input.flexibilityMinutes;
      if (Object.keys(patch).length === 0) return { ok: true };
      await db.from("visitTemplates").eq("id", input.id).update(patch);
      await audit(sc.staff.fullName, "visit_template_updated", "clients", tpl.clientId, { id: input.id, ...patch });
      return { ok: true };
    }),

  // ── Rota weeks ──
  weeks: authedQuery.query(async ({ ctx }) => {
    requireRole(await getStaff(ctx), ...ROTA_PLANNER_ROLES);
    return db.from("rotaWeeks").order("weekStartDate", "desc").limit(12).many<RotaWeeks>();
  }),

  generateWeek: authedQuery
    .input(z.object({ weekStartDate: z.string() })) // YYYY-MM-DD (Monday)
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...ROTA_WRITE_ROLES);
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
    .query(async ({ ctx, input }) => {
      requireRole(await getStaff(ctx), ...ROTA_PLANNER_ROLES);
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
      requireRole(sc, ...ROTA_WRITE_ROLES);
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
    .input(z.object({
      visitId: z.number(),
      staffId: z.number(),
      secondStaffId: z.number().optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...ROTA_WRITE_ROLES);
      const visit = await db.from("visits").eq("id", input.visitId).first<Visits>();
      if (!visit) throw new TRPCError({ code: "NOT_FOUND" });
      const check = await checkAssignment(input.visitId, input.staffId);
      if (!check.ok) throw new TRPCError({ code: "BAD_REQUEST", message: check.reason });
      if (visit.callType === "double") {
        if (!input.secondStaffId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Double-handed visits need a second carer." });
        }
        if (input.secondStaffId === input.staffId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Lead and second carer must be different people." });
        }
        const check2 = await checkAssignment(input.visitId, input.secondStaffId);
        if (!check2.ok) throw new TRPCError({ code: "BAD_REQUEST", message: `Second carer: ${check2.reason}` });
      }
      await db.from("visitAssignments")
        .eq("visitId", input.visitId)
        .in("status", ["assigned", "accepted"])
        .update({ status: "reassigned" });
      await db.from("visitAssignments").insert({
        visitId: input.visitId, staffId: input.staffId, slot: "lead", assignedBy: "user",
        assignmentReason: input.reason ?? "Manually assigned by coordinator.",
      });
      if (visit.callType === "double" && input.secondStaffId) {
        await db.from("visitAssignments").insert({
          visitId: input.visitId, staffId: input.secondStaffId, slot: "second", assignedBy: "user",
          assignmentReason: input.reason ?? "Manually assigned by coordinator (second).",
        });
        await notify({
          staffId: input.secondStaffId, type: "rota", title: "New visit assigned to you",
          body: `Visit on ${new Date(visit.scheduledStart).toLocaleString("en-GB")}.`, link: "/me",
        });
      }
      await db.from("visits").eq("id", input.visitId).update({
        status: visit.callType === "double" ? "assigned" : "assigned",
      });
      await notify({
        staffId: input.staffId, type: "rota", title: "New visit assigned to you",
        body: `Visit on ${new Date(visit.scheduledStart).toLocaleString("en-GB")}.`, link: "/me",
      });
      const openReq = await db.from("reassignmentRequests")
        .eq("visitId", input.visitId).eq("status", "manual_required").first<ReassignmentRequests>();
      if (openReq) {
        await db.from("reassignmentRequests").eq("id", openReq.id).update({
          status: "auto_resolved",
          resolvedStaffId: input.staffId,
          resolutionLog: { manual: true, staffId: input.staffId, secondStaffId: input.secondStaffId ?? null } as never,
        });
      }
      await audit(sc.staff.fullName, "visit_reassigned", "visits", input.visitId, { staffId: input.staffId });
      return { ok: true };
    }),

  /** Set / clear the primary carer for continuity of care. */
  setClientPrimaryCarer: authedQuery
    .input(z.object({ clientId: z.number(), staffId: z.number().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...ROTA_WRITE_ROLES);
      const existing = await db.from("clientAssignedWorkers").eq("clientId", input.clientId).many<ClientAssignedWorkers>();
      for (const w of existing) {
        if (w.isPrimary) await db.from("clientAssignedWorkers").eq("id", w.id).update({ isPrimary: false });
      }
      if (input.staffId == null) {
        await audit(sc.staff.fullName, "primary_carer_cleared", "clients", input.clientId);
        return { ok: true };
      }
      const row = existing.find((w) => Number(w.staffId) === input.staffId);
      if (row) {
        await db.from("clientAssignedWorkers").eq("id", row.id).update({ isPrimary: true });
      } else {
        await db.from("clientAssignedWorkers").insert({
          clientId: input.clientId, staffId: input.staffId, isPrimary: true,
        });
      }
      await audit(sc.staff.fullName, "primary_carer_set", "clients", input.clientId, { staffId: input.staffId });
      return { ok: true };
    }),

  checkAssignment: authedQuery
    .input(z.object({ visitId: z.number(), staffId: z.number() }))
    .query(async ({ input }) => checkAssignment(input.visitId, input.staffId)),

  /** Mark a client time-critical / medication — visit window becomes ±30 min (CQC). */
  setClientTimeCritical: authedQuery
    .input(z.object({ clientId: z.number(), timeCritical: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...ROTA_WRITE_ROLES);
      await db.from("clients").eq("id", input.clientId).update({ timeCritical: input.timeCritical });
      await audit(
        sc.staff.fullName,
        input.timeCritical ? "client_marked_time_critical" : "client_unmarked_time_critical",
        "clients",
        input.clientId,
        { window: input.timeCritical ? "30 min" : "60 min" },
      );
      return { ok: true };
    }),

  /** Set a visit template's allowed time window (minutes either side of preferred time). */
  setTemplateWindow: authedQuery
    .input(z.object({ templateId: z.number(), flexibilityMinutes: z.number().min(0).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...ROTA_WRITE_ROLES);
      await db.from("visitTemplates").eq("id", input.templateId).update({
        flexibilityMinutes: input.flexibilityMinutes,
      });
      await audit(sc.staff.fullName, "template_window_updated", "visit_templates", input.templateId, {
        flexibilityMinutes: input.flexibilityMinutes,
      });
      return { ok: true };
    }),

  /**
   * Week insights: rule compliance for the weekly planner —
   * rest breaks, time-window adherence, continuity, student hour caps, travel.
   */
  weekInsights: authedQuery
    .input(z.object({ weekId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireRole(await getStaff(ctx), ...ROTA_PLANNER_ROLES);
      const vts = await db.from("visits").eq("rotaWeekId", input.weekId).order("scheduledStart", "asc").many<Visits>();
      const asg = await db.from("visitAssignments").in("status", ["assigned", "accepted"]).many<VisitAssignments>();
      const clientRows = await db.from("clients").many<Clients>();
      const staff = await db.from("staffProfiles").many<StaffProfiles>();
      const assignedWorkers = await db.from("clientAssignedWorkers").many<ClientAssignedWorkers>();
      const tplsAll = await db.from("visitTemplates").many<VisitTemplates>();

      const violations: { type: string; severity: "error" | "warning" | "info"; message: string }[] = [];
      const wkAsg = asg.filter((a) => vts.some((v) => v.id === a.visitId));

      const week = await db.from("rotaWeeks").eq("id", input.weekId).first<RotaWeeks>();
      const monday = week ? mondayOf(week.weekStartDate) : null;
      const prevVisits = monday
        ? await db.from("visits").lte("scheduledEnd", monday.toISOString()).gte("scheduledEnd", new Date(monday.getTime() - 2 * 864e5).toISOString()).many<Visits>()
        : [];
      const prevAsg = prevVisits.length
        ? await db.from("visitAssignments").in("status", ["assigned", "accepted"]).many<VisitAssignments>()
        : [];

      const byStaff = new Map<number, Visits[]>();
      for (const a of wkAsg) {
        const v = vts.find((x) => x.id === a.visitId);
        if (!v) continue;
        const arr = byStaff.get(Number(a.staffId)) ?? [];
        if (!arr.some((x) => x.id === v.id)) arr.push(v);
        byStaff.set(Number(a.staffId), arr);
      }
      for (const [sid, list] of byStaff) {
        const name = staff.find((s2) => s2.id === sid)?.fullName ?? `#${sid}`;
        const byDay = new Map<string, { first: Date; last: Date }>();
        for (const v of list) {
          const start = new Date(v.scheduledStart);
          const end = new Date(v.scheduledEnd);
          const key = start.toISOString().slice(0, 10);
          const g = byDay.get(key) ?? { first: start, last: end };
          if (start < g.first) g.first = start;
          if (end > g.last) g.last = end;
          byDay.set(key, g);
        }
        // Cross-week boundary: last duty before Monday → first visit Mon
        if (monday) {
          const prevEnds = prevVisits
            .filter((v) => prevAsg.some((a) => Number(a.visitId) === Number(v.id) && Number(a.staffId) === sid))
            .map((v) => new Date(v.scheduledEnd).getTime());
          if (prevEnds.length) {
            const lastPrev = new Date(Math.max(...prevEnds));
            const monKey = monday.toISOString().slice(0, 10);
            const monFirst = byDay.get(monKey)?.first;
            if (monFirst) {
              const gapMin = (monFirst.getTime() - lastPrev.getTime()) / 60000;
              if (gapMin < REST_BREAK_MIN) {
                violations.push({
                  type: "rest_break",
                  severity: "error",
                  message: `${name}: only ${Math.floor(gapMin / 60)}h ${Math.round(gapMin % 60)}m rest from previous week into ${monKey} (minimum 11h)`,
                });
              }
            }
          }
        }
        const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
        for (let i = 1; i < days.length; i++) {
          const gapMin = (days[i][1].first.getTime() - days[i - 1][1].last.getTime()) / 60000;
          if (gapMin < REST_BREAK_MIN) {
            violations.push({
              type: "rest_break",
              severity: "error",
              message: `${name}: only ${Math.floor(gapMin / 60)}h ${Math.round(gapMin % 60)}m rest between ${days[i - 1][0]} and ${days[i][0]} (minimum 11h)`,
            });
          }
        }
      }

      for (const [sid, list] of byStaff) {
        const w = staff.find((s2) => s2.id === sid);
        if (!w?.isStudent) continue;
        const mins = list.reduce((sum, v) =>
          sum + (new Date(v.scheduledEnd).getTime() - new Date(v.scheduledStart).getTime()) / 60000, 0)
          + wkAsg.filter((a) => Number(a.staffId) === sid).reduce((sum, a) => sum + (a.travelMinutesFromPrevious ?? 0), 0);
        const hours = mins / 60;
        if (hours > 20) {
          violations.push({
            type: "student_hours",
            severity: "error",
            message: `${w.fullName} (student): ${hours.toFixed(1)}h scheduled incl. travel — exceeds the 20h/week cap`,
          });
        }
      }

      let onTime = 0, moved = 0, continuityHits = 0, continuityTotal = 0;
      for (const a of wkAsg) {
        const v = vts.find((x) => x.id === a.visitId);
        if (!v) continue;
        const client = clientRows.find((c) => c.id === v.clientId);
        const tpl = tplsAll.find((t) => t.id === v.visitTemplateId);
        const cname = client ? `${client.firstName} ${client.lastName}` : `#${v.clientId}`;
        if (a.assignmentReason?.includes("within the client")) {
          moved++;
          const m = a.assignmentReason.match(/moved (\d+) min (later|earlier)/);
          const mm = m ? Number(m[1]) : 0;
          const win = client?.timeCritical ? 30 : tpl?.flexibilityMinutes ?? 60;
          if (m && mm > win) {
            violations.push({
              type: "time_window",
              severity: "error",
              message: `${cname}: visit moved ${mm} min — outside the ±${win} min window${client?.timeCritical ? " (time-critical)" : ""}`,
            });
          }
        } else onTime++;
        const primary = assignedWorkers.find((w2) => w2.clientId === v.clientId && w2.isPrimary);
        if (primary) {
          continuityTotal++;
          if (Number(primary.staffId) === Number(a.staffId)) continuityHits++;
          else {
            const wname = staff.find((s2) => s2.id === a.staffId)?.fullName ?? "";
            const pname = staff.find((s2) => s2.id === primary.staffId)?.fullName ?? "";
            violations.push({
              type: "continuity",
              severity: "info",
              message: `${cname}: ${wname} covering instead of primary carer ${pname}`,
            });
          }
        }
      }

      const travelTotal = wkAsg.reduce((sum, a) => sum + (a.travelMinutesFromPrevious ?? 0), 0);
      return {
        violations,
        stats: {
          visits: vts.length,
          assigned: wkAsg.length,
          onTimePct: onTime + moved ? Math.round((onTime / (onTime + moved)) * 100) : 100,
          continuityPct: continuityTotal ? Math.round((continuityHits / continuityTotal) * 100) : 100,
          travelMinutes: travelTotal,
        },
      };
    }),

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
        requireRole(sc, ...ROTA_WRITE_ROLES);
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
            resolutionLog: {
              nearMisses: (result.unassigned.find((u) => u.visitId === vid)?.reasons ?? []).map((r) => ({
                staffId: r.staffId,
                reason: r.reason,
              })),
            } as never,
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

  reassignments: authedQuery.query(async ({ ctx }) => {
    requireRole(await getStaff(ctx), ...ROTA_PLANNER_ROLES);
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
    const attendance = await db.from("visitAttendance")
      .eq("staffId", sc.staff.id)
      .order("clockInAt", "desc")
      .limit(200)
      .many<VisitAttendance>();
    return vts
      .filter((v) => asg.some((a) => a.visitId === v.id))
      .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime())
      .map((v) => {
        const client = clientRows.find((c) => c.id === v.clientId);
        const partner = v.callType === "double"
          ? allAsg.filter((a) => a.visitId === v.id && a.staffId !== sc.staff.id)
              .map((a) => staff.find((s2) => s2.id === a.staffId)?.fullName)[0]
          : null;
        const myAttendance = attendance.find((a) => Number(a.visitId) === Number(v.id)) ?? null;
        return {
          ...v,
          client,
          partner,
          myAssignment: asg.find((a) => a.visitId === v.id),
          myAttendance,
          clientHasGeo: !!(client?.lat && client?.lng) || !!client?.postcode,
        };
      });
  }),

  kpis: authedQuery.query(async ({ ctx }) => {
    requireRole(await getStaff(ctx), ...ROTA_PLANNER_ROLES);
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
    .query(async ({ ctx, input }) => {
      requireRole(await getStaff(ctx), ...ROTA_PLANNER_ROLES);
      const sheet = await weekSheetRows(input.weekId);
      const header = ["Day", "Date", "Client", "Visit type", "Call type", "Start", "End", "Carer", "Notes"];
      const lines = [header, ...sheet.map((r) => [r.day, r.date, r.client, r.visitType, r.callType, r.start, r.end, r.carer, r.notes])];
      return { csv: lines.map((r) => r.map((c2) => `"${String(c2).replace(/"/g, '""')}"`).join(",")).join("\n") };
    }),

  /** Excel template (one row per visit), pre-filled from the current week. */
  exportWeekExcel: authedQuery
    .input(z.object({ weekId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireRole(await getStaff(ctx), ...ROTA_PLANNER_ROLES);
      const sheet = await weekSheetRows(input.weekId);
      const buf = await buildWeekWorkbook(sheet);
      return { filename: `rota-week.xlsx`, base64: buf.toString("base64") };
    }),

  /** Validate an uploaded rota template against clients, carers and hard rules. */
  previewWeekImport: authedQuery
    .input(z.object({ weekId: z.number(), base64: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      requireRole(await getStaff(ctx), ...ROTA_WRITE_ROLES);
      const week = await db.from("rotaWeeks").eq("id", input.weekId).first<RotaWeeks>();
      if (!week) throw new TRPCError({ code: "NOT_FOUND", message: "Rota week not found" });
      if (week.status !== "draft") {
        throw new TRPCError({ code: "CONFLICT", message: "Only draft weeks can be imported into. Unlock/regenerate as draft first." });
      }
      let parsed;
      try {
        parsed = await detectAndParseWorkbook(Buffer.from(input.base64, "base64"));
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "Could not read workbook" });
      }
      const preview = await validateImportRows(week, parsed.rows);
      return { ...preview, sheetUsed: parsed.sheetUsed, warnings: parsed.warnings };
    }),

  /** Apply a validated rota template to the draft week (replaces visit assignments for matched rows). */
  applyWeekImport: authedQuery
    .input(z.object({ weekId: z.number(), base64: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...ROTA_WRITE_ROLES);
      const week = await db.from("rotaWeeks").eq("id", input.weekId).first<RotaWeeks>();
      if (!week) throw new TRPCError({ code: "NOT_FOUND", message: "Rota week not found" });
      if (week.status !== "draft") {
        throw new TRPCError({ code: "CONFLICT", message: "Only draft weeks can be imported into." });
      }
      let parsedWb;
      try {
        parsedWb = await detectAndParseWorkbook(Buffer.from(input.base64, "base64"));
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "Could not read workbook" });
      }
      const preview = await validateImportRows(week, parsedWb.rows);
      if (preview.errorCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Fix ${preview.errorCount} row error(s) before applying.`,
        });
      }
      let applied = 0;
      for (const row of preview.rows) {
        if (!row.ok || !row.parsed) continue;
        const p = row.parsed;
        let visit = (await db.from("visits").eq("rotaWeekId", week.id).many<Visits>())
          .find((v) =>
            Number(v.clientId) === p.clientId
            && new Date(v.scheduledStart).toISOString().slice(0, 16) === p.startIso.slice(0, 16));
        if (!visit) {
          const [created] = await db.from("visits").insert<Visits>({
            rotaWeekId: week.id,
            clientId: p.clientId,
            scheduledStart: new Date(p.startIso),
            scheduledEnd: new Date(p.endIso),
            callType: p.callType,
            visitType: p.visitType,
            status: "unassigned",
            notes: p.notes || null,
          });
          visit = created;
        } else {
          await db.from("visits").eq("id", visit.id).update({
            scheduledStart: new Date(p.startIso),
            scheduledEnd: new Date(p.endIso),
            callType: p.callType,
            visitType: p.visitType,
            notes: p.notes || null,
          });
        }
        await db.from("visitAssignments")
          .eq("visitId", visit.id)
          .in("status", ["assigned", "accepted"])
          .update({ status: "reassigned" });
        if (p.staffIds.length) {
          for (let i = 0; i < p.staffIds.length; i++) {
            await db.from("visitAssignments").insert({
              visitId: visit.id,
              staffId: p.staffIds[i],
              slot: i === 0 ? "lead" : "second",
              assignedBy: "import",
              assignmentReason: "Imported from rota template",
            });
          }
          await db.from("visits").eq("id", visit.id).update({
            status: p.callType === "double" && p.staffIds.length < 2 ? "partially_assigned" : "assigned",
          });
        } else {
          await db.from("visits").eq("id", visit.id).update({ status: "unassigned" });
        }
        applied++;
      }
      await audit(sc.staff.fullName, "rota_imported", "rota_weeks", week.id, { rows: applied });
      return { ok: true, applied };
    }),
});

async function weekSheetRows(weekId: number) {
  const vts = await db.from("visits").eq("rotaWeekId", weekId).order("scheduledStart", "asc").many<Visits>();
  const asg = await db.from("visitAssignments").in("status", ["assigned", "accepted"]).many<VisitAssignments>();
  const clientRows = await db.from("clients").many<Clients>();
  const staff = await db.from("staffProfiles").many<StaffProfiles>();
  return vts.map((v) => {
    const c = clientRows.find((x) => x.id === v.clientId);
    const names = asg.filter((a) => a.visitId === v.id)
      .map((a) => staff.find((s2) => s2.id === a.staffId)?.fullName ?? "")
      .filter(Boolean)
      .join(" & ");
    const start = new Date(v.scheduledStart);
    return {
      day: dayNameFromDate(start),
      date: start.toLocaleDateString("en-GB"),
      client: c ? `${c.firstName} ${c.lastName}` : "",
      visitType: (v.visitType ?? "visit").replace(/_/g, " "),
      callType: v.callType,
      start: start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }),
      end: new Date(v.scheduledEnd).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }),
      carer: names,
      notes: v.notes ?? "",
    };
  });
}

type ImportParsed = {
  clientId: number;
  staffIds: number[];
  visitType: string;
  callType: "single" | "double";
  startIso: string;
  endIso: string;
  notes: string;
};

async function validateImportRows(week: RotaWeeks, rows: WeekSheetRow[]) {
  const clients = await db.from("clients").eq("status", "active").many<Clients>();
  const staff = await db.from("staffProfiles").isNull("deletedAt").many<StaffProfiles>();
  const clientByName = new Map(clients.map((c) => [normaliseClientKey(`${c.firstName} ${c.lastName}`), c]));
  const staffByName = new Map(staff.map((s) => [normaliseClientKey(s.fullName), s]));

  const out: {
    rowNum: number;
    ok: boolean;
    errors: string[];
    summary: string;
    parsed: ImportParsed | null;
  }[] = [];

  for (const row of rows) {
    const errors: string[] = [];
    let dateIso = parseSheetDate(row.date);
    if (!dateIso && row.day && week.weekStartDate) {
      dateIso = dateFromWeekDay(week.weekStartDate, row.day);
    }
    if (!dateIso) errors.push("Invalid date (use DD/MM/YYYY) or a weekday name for this week");
    const startHm = parseTimeToHm(row.start);
    const endHm = parseTimeToHm(row.end);
    if (!startHm) errors.push("Invalid start time");
    if (!endHm) errors.push("Invalid end time");
    const client = clientByName.get(normaliseClientKey(row.client));
    if (!client) errors.push(`Unknown client "${row.client}"`);
    const callType = normaliseCallType(row.callType || (row.carer.includes("+") ? "double" : "single"));
    if (!callType) errors.push(`Invalid call type "${row.callType}"`);
    const visitType = normaliseVisitType(row.visitType || "visit");
    const carerNames = row.carer
      ? row.carer.split(/\s*(?:&|\+|\/|,)\s*/).map((n) => n.trim()).filter(Boolean)
      : [];
    const staffIds: number[] = [];
    for (const name of carerNames) {
      const s = staffByName.get(normaliseClientKey(name));
      if (!s) errors.push(`Unknown carer "${name}"`);
      else if (s.status !== "active") errors.push(`${name} is not active`);
      else staffIds.push(Number(s.id));
    }
    if (callType === "double" && staffIds.length === 1) {
      errors.push("Double-handed visit needs two carers (Name & Name)");
    }
    if (dateIso && week.weekStartDate) {
      const mon = week.weekStartDate.slice(0, 10);
      const sun = new Date(`${mon}T12:00:00Z`);
      sun.setUTCDate(sun.getUTCDate() + 6);
      const sunIso = sun.toISOString().slice(0, 10);
      if (dateIso < mon || dateIso > sunIso) {
        errors.push(`Date is outside week ${mon} → ${sunIso}`);
      }
    }

    let parsed: ImportParsed | null = null;
    if (!errors.length && client && startHm && endHm && callType && dateIso) {
      const start = londonTime(dateIso, startHm);
      const end = londonTime(dateIso, endHm);
      if (end.getTime() <= start.getTime()) errors.push("End must be after start");
      else {
        parsed = {
          clientId: Number(client.id),
          staffIds,
          visitType,
          callType,
          startIso: start.toISOString(),
          endIso: end.toISOString(),
          notes: row.notes,
        };
        for (const sid of staffIds) {
          // Temporary visit-shaped check via synthetic overlap against existing week visits
          const probe = await checkAssignmentWindow({
            staffId: sid,
            clientId: Number(client.id),
            start,
            end,
            excludeVisitId: null,
            weekId: Number(week.id),
          });
          if (!probe.ok) errors.push(probe.reason ?? "Rule breach");
        }
      }
    }
    if (errors.length) parsed = null;
    out.push({
      rowNum: row.rowNum,
      ok: errors.length === 0,
      errors,
      summary: `${row.day || "—"} ${row.date} · ${row.client} · ${row.start}–${row.end} · ${row.carer || "unassigned"}`,
      parsed,
    });
  }
  return {
    rows: out,
    errorCount: out.filter((r) => !r.ok).length,
    okCount: out.filter((r) => r.ok).length,
  };
}

/** Hard-constraint check for an existing visit + worker (manual assign / reassign). */
async function checkAssignment(visitId: number, staffId: number): Promise<{ ok: boolean; reason?: string }> {
  const visit = await db.from("visits").eq("id", visitId).first<Visits>();
  if (!visit) return { ok: false, reason: "Visit not found" };
  return checkAssignmentWindow({
    staffId,
    clientId: Number(visit.clientId),
    start: new Date(visit.scheduledStart),
    end: new Date(visit.scheduledEnd),
    excludeVisitId: Number(visit.id),
    weekId: Number(visit.rotaWeekId),
  });
}

async function checkAssignmentWindow(opts: {
  staffId: number;
  clientId: number;
  start: Date;
  end: Date;
  excludeVisitId: number | null;
  weekId: number;
}): Promise<{ ok: boolean; reason?: string }> {
  const worker = await db.from("staffProfiles").eq("id", opts.staffId).first<StaffProfiles>();
  if (!worker || worker.status !== "active") return { ok: false, reason: "Worker is not active" };

  if (await blockRotaOnExpiredMandatory()) {
    const docsOk = await staffMandatoryDocsOk(opts.staffId);
    if (!docsOk.ok) return docsOk;
  }

  const reqSkills = (await db.from("clientRequiredSkills").eq("clientId", opts.clientId).many<ClientRequiredSkills>()).map((r) => r.skill);
  const wSkills = (worker.skills as string[]) ?? [];
  const missing = reqSkills.filter((sk) => !wSkills.includes(sk));
  if (missing.length) return { ok: false, reason: `Missing required skills: ${missing.join(", ")}` };

  const pref = await db.from("clientPreferences").eq("clientId", opts.clientId).first<ClientPreferences>();
  if (pref && ((pref.excludedStaffIds as number[]) ?? []).includes(opts.staffId)) {
    return { ok: false, reason: "Client has excluded this worker" };
  }
  if (pref && pref.preferredGender !== "any" && worker.gender && pref.preferredGender !== worker.gender) {
    return { ok: false, reason: `Client prefers ${pref.preferredGender} carers` };
  }

  const start = opts.start;
  const end = opts.end;
  const dow = (start.getDay() + 6) % 7;

  const pattern = worker.workPattern ?? "six_day";
  const daysOff: number[] = [];
  if (pattern === "six_day") daysOff.push(6);
  else {
    if (worker.fixedDayOff != null) daysOff.push(Number(worker.fixedDayOff));
    daysOff.push(worker.flexibleDayOff != null ? Number(worker.flexibleDayOff) : 6);
  }
  if (daysOff.includes(dow)) return { ok: false, reason: "Worker is on a pattern day off" };

  const windows = await db.from("staffAvailability")
    .eq("staffId", opts.staffId)
    .eq("dayOfWeek", dow)
    .many<StaffAvailability>();
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  if (!windows.some((w) => toMin(w.startTime) <= startMin && toMin(w.endTime) >= endMin)) {
    return { ok: false, reason: "Outside the worker's weekly availability" };
  }

  const un = await db.from("staffUnavailability")
    .eq("staffId", opts.staffId)
    .eq("status", "approved")
    .many<StaffUnavailability>();
  if (un.some((u) => new Date(u.startsAt) < end && new Date(u.endsAt) > start)) {
    return { ok: false, reason: "Worker has approved unavailability over this time" };
  }

  const otherAsg = await db.from("visitAssignments")
    .eq("staffId", opts.staffId)
    .in("status", ["assigned", "accepted"])
    .many<VisitAssignments>();
  const TRAVEL_BUF = 15;
  for (const a of otherAsg) {
    if (opts.excludeVisitId != null && Number(a.visitId) === opts.excludeVisitId) continue;
    const ov = await db.from("visits").eq("id", a.visitId).first<Visits>();
    if (!ov) continue;
    const os = new Date(ov.scheduledStart).getTime();
    const oe = new Date(ov.scheduledEnd).getTime();
    if (os - TRAVEL_BUF * 60000 < end.getTime() && oe + TRAVEL_BUF * 60000 > start.getTime()) {
      return { ok: false, reason: "Overlaps another visit (incl. travel buffer)" };
    }
  }

  // 11-hour rest vs other duties the same / previous calendar day
  const dayStart = new Date(start); dayStart.setHours(0, 0, 0, 0);
  const prevDayStart = new Date(dayStart.getTime() - 864e5);
  const nextDayEnd = new Date(dayStart.getTime() + 2 * 864e5);
  for (const a of otherAsg) {
    if (opts.excludeVisitId != null && Number(a.visitId) === opts.excludeVisitId) continue;
    const ov = await db.from("visits").eq("id", a.visitId).first<Visits>();
    if (!ov) continue;
    const os = new Date(ov.scheduledStart);
    const oe = new Date(ov.scheduledEnd);
    if (oe < prevDayStart || os > nextDayEnd) continue;
    const gapAfter = (start.getTime() - oe.getTime()) / 60000;
    const gapBefore = (os.getTime() - end.getTime()) / 60000;
    if (gapAfter >= 0 && gapAfter < REST_BREAK_MIN && os.toDateString() !== start.toDateString()) {
      return { ok: false, reason: "Breaks the 11-hour rest rule" };
    }
    if (gapBefore >= 0 && gapBefore < REST_BREAK_MIN && os.toDateString() !== start.toDateString()) {
      return { ok: false, reason: "Breaks the 11-hour rest rule" };
    }
  }

  if (worker.isStudent) {
    const weekVisits = await db.from("visits").eq("rotaWeekId", opts.weekId).many<Visits>();
    let mins = (end.getTime() - start.getTime()) / 60000;
    for (const a of otherAsg) {
      if (opts.excludeVisitId != null && Number(a.visitId) === opts.excludeVisitId) continue;
      const ov = weekVisits.find((v) => Number(v.id) === Number(a.visitId));
      if (!ov) continue;
      mins += (new Date(ov.scheduledEnd).getTime() - new Date(ov.scheduledStart).getTime()) / 60000;
      mins += a.travelMinutesFromPrevious ?? 0;
    }
    if (mins / 60 > STUDENT_MAX_WEEKLY_HOURS) {
      return { ok: false, reason: `Student would exceed ${STUDENT_MAX_WEEKLY_HOURS}h/week (incl. travel)` };
    }
  }

  return { ok: true };
}
