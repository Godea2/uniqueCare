import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import { db } from "../db";
import type {
  Clients,
  StaffProfiles,
  VisitAssignments,
  VisitAttendance,
  VisitLocationProbes,
  Visits,
} from "@db/schema";
import { getStaff, requireRole, audit, notifyRoles, MANAGER_ALERT_ROLES, PAYROLL_ROLES } from "../util";
import { geocodePostcode } from "../lib/geo";
import {
  EARLY_CLOCK_OUT_REASONS,
  getGeofenceRadiusM,
  isInsideGeofence,
  LEFT_GEOFENCE_GRACE_MS,
  PROBE_INTERVAL_MS,
} from "../lib/geofence";
import { closeAttendance, notifyAutoClockOut, runAutoClockOutSweep } from "../lib/attendance-session";

/** Clock-in opens 45 minutes before the scheduled start; closes at the scheduled end. */
const CLOCK_IN_EARLY_MS = 45 * 60_000;

const coords = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(5000).optional(),
});

async function resolveClientPoint(client: Clients): Promise<{ lat: number; lng: number }> {
  if (client.lat && client.lng) {
    return { lat: Number(client.lat), lng: Number(client.lng) };
  }
  if (client.postcode) {
    const geo = await geocodePostcode(client.postcode);
    if (geo) {
      await db.from("clients").eq("id", client.id).update({
        lat: String(geo.lat), lng: String(geo.lng),
      }).catch(() => {});
      return geo;
    }
  }
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "This client's address has no map location yet. Ask the office to set a valid postcode on the client record.",
  });
}

async function assertAssigned(visitId: number, staffId: number) {
  const visit = await db.from("visits").eq("id", visitId).first<Visits>();
  if (!visit) throw new TRPCError({ code: "NOT_FOUND", message: "Visit not found" });
  if (["cancelled", "missed"].includes(visit.status)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This visit was cancelled or marked missed." });
  }
  const asg = await db.from("visitAssignments")
    .eq("visitId", visitId)
    .eq("staffId", staffId)
    .in("status", ["assigned", "accepted"])
    .first<VisitAssignments>();
  if (!asg) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this visit." });
  }
  const client = await db.from("clients").eq("id", visit.clientId).first<Clients>();
  if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
  return { visit, asg, client };
}

async function openAttendance(visitId: number, staffId: number) {
  return db.from("visitAttendance")
    .eq("visitId", visitId)
    .eq("staffId", staffId)
    .eq("status", "in_progress")
    .first<VisitAttendance>();
}

export const attendanceRouter = createRouter({
  /** Open sessions for the signed-in carer (usually 0 or 1). */
  myActive: authedQuery.query(async ({ ctx }) => {
    const sc = await getStaff(ctx);
    return db.from("visitAttendance")
      .eq("staffId", sc.staff.id)
      .eq("status", "in_progress")
      .order("clockInAt", "desc")
      .many<VisitAttendance>();
  }),

  /** Office geofence settings for My Rota copy. */
  geofenceConfig: authedQuery.query(async ({ ctx }) => {
    await getStaff(ctx);
    const radiusM = await getGeofenceRadiusM();
    return {
      radiusM,
      probeIntervalMs: PROBE_INTERVAL_MS,
      leftGraceMs: LEFT_GEOFENCE_GRACE_MS,
    };
  }),

  clockIn: authedQuery
    .input(z.object({ visitId: z.number() }).merge(coords))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const { visit, asg, client } = await assertAssigned(input.visitId, Number(sc.staff.id));
      const existing = await openAttendance(input.visitId, Number(sc.staff.id));
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "You are already clocked in to this visit." });

      // One open session at a time — finish the previous visit first
      const otherOpen = await db.from("visitAttendance")
        .eq("staffId", sc.staff.id)
        .eq("status", "in_progress")
        .first<VisitAttendance>();
      if (otherOpen) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You still have another visit open. Clock out of that visit before starting a new one.",
        });
      }

      const now = new Date();
      const earliest = new Date(new Date(visit.scheduledStart).getTime() - CLOCK_IN_EARLY_MS);
      const latest = new Date(visit.scheduledEnd);
      if (now < earliest) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Too early — clock-in opens at ${earliest.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`,
        });
      }
      if (now > latest) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This visit's scheduled window has ended — ask the office if you still need to record attendance.",
        });
      }

      const radiusM = await getGeofenceRadiusM();
      const point = await resolveClientPoint(client);
      const check = isInsideGeofence({
        lat: input.lat, lng: input.lng,
        clientLat: point.lat, clientLng: point.lng,
        accuracyM: input.accuracyM,
        radiusM,
      });
      if (!check.inside) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You must be within ${radiusM} m of the client's address to clock in (about ${Math.round(check.distanceM)} m away; allowed ${Math.round(check.allowedM)} m including GPS accuracy).`,
        });
      }

      const [row] = await db.from("visitAttendance").insert<VisitAttendance>({
        visitId: visit.id,
        staffId: sc.staff.id,
        assignmentId: asg.id,
        clockInAt: now.toISOString(),
        clockInLat: String(input.lat),
        clockInLng: String(input.lng),
        clockInAccuracyM: input.accuracyM != null ? String(input.accuracyM) : null,
        status: "in_progress",
      });
      await db.from("visits").eq("id", visit.id).update({ status: "in_progress" }).catch(() => {
        // older DBs may not allow in_progress — leave as assigned
      });
      await audit(sc.staff.fullName, "visit_clock_in", "visits", visit.id, {
        distanceM: Math.round(check.distanceM), accuracyM: input.accuracyM ?? null,
      });
      return {
        attendance: row,
        distanceM: Math.round(check.distanceM),
        allowedM: Math.round(check.allowedM),
      };
    }),

  clockOut: authedQuery
    .input(z.object({
      visitId: z.number(),
      reason: z.enum(EARLY_CLOCK_OUT_REASONS).default("completed"),
      earlyReasonText: z.string().trim().max(500).optional(),
    }).merge(coords))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const { visit, client } = await assertAssigned(input.visitId, Number(sc.staff.id));
      const open = await openAttendance(input.visitId, Number(sc.staff.id));
      if (!open) throw new TRPCError({ code: "BAD_REQUEST", message: "You are not clocked in to this visit." });

      const now = new Date();
      const scheduledEnd = new Date(visit.scheduledEnd);
      const isEarly = now.getTime() < scheduledEnd.getTime() - 60_000; // 1 min tolerance
      if (isEarly) {
        if (input.reason === "completed" || input.reason === "auto_left_geofence") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This visit is still scheduled — choose an early clock-out reason.",
          });
        }
        if (!input.earlyReasonText?.trim() || input.earlyReasonText.trim().length < 3) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Please explain why you are clocking out before the scheduled end.",
          });
        }
      } else if (input.reason === "early_other" && !input.earlyReasonText?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Please say why you are clocking out early." });
      }

      const radiusM = await getGeofenceRadiusM();
      const point = await resolveClientPoint(client);
      const check = isInsideGeofence({
        lat: input.lat, lng: input.lng,
        clientLat: point.lat, clientLng: point.lng,
        accuracyM: input.accuracyM,
        radiusM,
      });
      if (!check.inside) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You must be within ${radiusM} m of the client's address to clock out (about ${Math.round(check.distanceM)} m away; allowed ${Math.round(check.allowedM)} m including GPS accuracy).`,
        });
      }

      const result = await closeAttendance(open, {
        clockOutAt: now,
        lat: input.lat,
        lng: input.lng,
        accuracyM: input.accuracyM,
        reason: input.reason,
        earlyReasonText: input.earlyReasonText ?? null,
      });
      if (isEarly) {
        await notifyRoles(MANAGER_ALERT_ROLES, {
          type: "early_clock_out",
          title: `${sc.staff.fullName} clocked out early`,
          body: `${client.firstName} ${client.lastName}: ${input.reason.replaceAll("_", " ")}${input.earlyReasonText ? ` — ${input.earlyReasonText}` : ""}. Scheduled end ${scheduledEnd.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`,
          link: "/rota/timesheets",
        });
      }
      await audit(sc.staff.fullName, "visit_clock_out", "visits", input.visitId, {
        reason: input.reason, early: isEarly, ...result,
      });
      return result;
    }),

  /**
   * 15-minute location probe while clocked in.
   * Records the reading, alerts managers on first breach, and auto-closes
   * after 15 minutes continuously outside the geofence (grace is unpaid).
   */
  probe: authedQuery
    .input(z.object({ visitId: z.number() }).merge(coords))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const { client } = await assertAssigned(input.visitId, Number(sc.staff.id));
      const open = await openAttendance(input.visitId, Number(sc.staff.id));
      if (!open) throw new TRPCError({ code: "BAD_REQUEST", message: "You are not clocked in to this visit." });

      const radiusM = await getGeofenceRadiusM();
      const point = await resolveClientPoint(client);
      const check = isInsideGeofence({
        lat: input.lat, lng: input.lng,
        clientLat: point.lat, clientLng: point.lng,
        accuracyM: input.accuracyM,
        radiusM,
      });

      let leftGeofenceAt = open.leftGeofenceAt;
      let autoClosed = false;
      let violationNotified = false;

      if (check.inside) {
        if (leftGeofenceAt) {
          await db.from("visitAttendance").eq("id", open.id).update({
            leftGeofenceAt: null, updatedAt: new Date().toISOString(),
          });
          leftGeofenceAt = null;
        }
      } else {
        if (!leftGeofenceAt) {
          leftGeofenceAt = new Date().toISOString();
          await db.from("visitAttendance").eq("id", open.id).update({
            leftGeofenceAt, updatedAt: new Date().toISOString(),
          });
          await notifyRoles(MANAGER_ALERT_ROLES, {
            type: "geofence_violation",
            title: `${sc.staff.fullName} left a visit geofence`,
            body: `${client.firstName} ${client.lastName}: about ${Math.round(check.distanceM)} m from the address (fence ${radiusM} m) during an active visit.`,
            link: "/rota/timesheets",
          });
          violationNotified = true;
        } else {
          // Still outside — re-alert managers on each 15-min probe while in violation
          await notifyRoles(MANAGER_ALERT_ROLES, {
            type: "geofence_violation",
            title: `${sc.staff.fullName} still outside visit geofence`,
            body: `${client.firstName} ${client.lastName}: still ~${Math.round(check.distanceM)} m away. Auto clock-out after 15 minutes outside (unpaid).`,
            link: "/rota/timesheets",
          });
          violationNotified = true;
          if (Date.now() - new Date(leftGeofenceAt).getTime() >= LEFT_GEOFENCE_GRACE_MS) {
            await closeAttendance(open, {
              clockOutAt: new Date(),
              lat: input.lat, lng: input.lng, accuracyM: input.accuracyM,
              reason: "auto_left_geofence",
              leftGeofenceAt,
            });
            await notifyAutoClockOut({
              staffId: Number(sc.staff.id),
              staffName: sc.staff.fullName,
              clientLabel: `${client.firstName} ${client.lastName}`,
              detail: `Left the geofence for 15+ minutes at ${client.firstName} ${client.lastName}. Those 15 minutes are unpaid.`,
            });
            await audit(sc.staff.fullName, "visit_auto_clock_out", "visits", input.visitId, {
              distanceM: Math.round(check.distanceM),
            });
            autoClosed = true;
          }
        }
      }

      await db.from("visitLocationProbes").insert<VisitLocationProbes>({
        attendanceId: open.id,
        visitId: input.visitId,
        staffId: sc.staff.id,
        at: new Date().toISOString(),
        lat: String(input.lat),
        lng: String(input.lng),
        accuracyM: input.accuracyM != null ? String(input.accuracyM) : null,
        distanceM: String(Math.round(check.distanceM * 10) / 10),
        insideGeofence: check.inside,
        violationNotified,
      });

      return {
        inside: check.inside,
        distanceM: Math.round(check.distanceM),
        allowedM: Math.round(check.allowedM),
        leftGeofenceAt,
        autoClosed,
        graceEndsAt: leftGeofenceAt && !autoClosed
          ? new Date(new Date(leftGeofenceAt).getTime() + LEFT_GEOFENCE_GRACE_MS).toISOString()
          : null,
      };
    }),

  /** Staff: own timesheet for a date range (default this week). */
  myTimesheet: authedQuery
    .input(z.object({
      from: z.string(), // YYYY-MM-DD
      to: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      await runAutoClockOutSweep().catch(() => {});
      return buildTimesheet({
        staffId: Number(sc.staff.id),
        from: input.from,
        to: input.to,
      });
    }),

  /** Admin/manager: payroll summary across staff. */
  payrollSummary: authedQuery
    .input(z.object({
      from: z.string(),
      to: z.string(),
      staffId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...PAYROLL_ROLES);
      await runAutoClockOutSweep().catch(() => {});
      return payrollSummaryData(input);
    }),

  /** Full visit session + 15-minute location trail (admin/manager, or own session). */
  sessionDetail: authedQuery
    .input(z.object({ attendanceId: z.number() }))
    .query(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const row = await db.from("visitAttendance").eq("id", input.attendanceId).first<VisitAttendance>();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Timesheet session not found" });
      const privileged = PAYROLL_ROLES.includes(sc.staff.role as typeof PAYROLL_ROLES[number]);
      if (!privileged && Number(row.staffId) !== Number(sc.staff.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only view your own location trail." });
      }
      const visit = await db.from("visits").eq("id", row.visitId).first<Visits>();
      const client = visit
        ? await db.from("clients").eq("id", visit.clientId).first<Clients>()
        : null;
      const staff = await db.from("staffProfiles").eq("id", row.staffId).first<StaffProfiles>();
      const probes = await db.from("visitLocationProbes")
        .eq("attendanceId", row.id)
        .order("at", "asc")
        .many<VisitLocationProbes>();
      return {
        session: {
          id: Number(row.id),
          visitId: Number(row.visitId),
          staffId: Number(row.staffId),
          staffName: staff?.fullName ?? "",
          clientName: client ? `${client.firstName} ${client.lastName}` : `Visit #${row.visitId}`,
          clientAddress: client
            ? [client.addressLine1, client.town, client.postcode].filter(Boolean).join(", ")
            : null,
          clockInAt: row.clockInAt,
          clockOutAt: row.clockOutAt,
          clockInLat: row.clockInLat,
          clockInLng: row.clockInLng,
          clockOutLat: row.clockOutLat,
          clockOutLng: row.clockOutLng,
          leftGeofenceAt: row.leftGeofenceAt,
          paidMinutes: row.paidMinutes,
          unpaidGraceMinutes: row.unpaidGraceMinutes,
          status: row.status,
          reason: row.clockOutReason,
          earlyReasonText: row.earlyReasonText,
          hourlyRateSnapshot: row.hourlyRateSnapshot,
        },
        probes: probes.map((p) => ({
          id: Number(p.id),
          at: p.at,
          lat: p.lat,
          lng: p.lng,
          accuracyM: p.accuracyM,
          distanceM: p.distanceM,
          insideGeofence: p.insideGeofence,
          violationNotified: p.violationNotified,
        })),
      };
    }),

  /** CSV for the payroll provider — one row per staff member in the period. */
  payrollExportCsv: authedQuery
    .input(z.object({
      from: z.string(),
      to: z.string(),
      staffId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...PAYROLL_ROLES);
      await runAutoClockOutSweep().catch(() => {});
      const summary = await payrollSummaryData(input);
      const header = [
        "Staff ID", "Employee no", "Full name", "Period from", "Period to",
        "Paid hours", "Unpaid grace hours", "Clock hours", "Hourly rate", "Gross pay", "Visits",
        "Auto closed", "Early clock-outs",
      ];
      const lines = [header];
      for (const s of summary.staff) {
        const rate = s.hourlyRate != null ? Number(s.hourlyRate) : 0;
        lines.push([
          String(s.staffId),
          s.employeeNo ?? "",
          s.fullName,
          input.from,
          input.to,
          (s.paidMinutes / 60).toFixed(2),
          (s.unpaidGraceMinutes / 60).toFixed(2),
          (s.clockMinutes / 60).toFixed(2),
          rate.toFixed(2),
          s.grossPay.toFixed(2),
          String(s.visits),
          String(s.autoClosed),
          String(s.early),
        ]);
      }
      lines.push([
        "", "", "TOTAL", input.from, input.to,
        (summary.totals.paidMinutes / 60).toFixed(2),
        (summary.totals.unpaidGraceMinutes / 60).toFixed(2),
        (summary.totals.clockMinutes / 60).toFixed(2),
        "",
        summary.totals.grossPay.toFixed(2),
        String(summary.totals.visits),
        String(summary.totals.autoClosed),
        String(summary.totals.early),
      ]);
      const csv = lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      await audit(sc.staff.fullName, "payroll_exported", "organisations", undefined, {
        from: input.from, to: input.to, staff: summary.staff.length,
      });
      return {
        filename: `payroll-${input.from}_${input.to}.csv`,
        csv,
      };
    }),

  setHourlyRate: authedQuery
    .input(z.object({
      staffId: z.number(),
      hourlyRate: z.number().min(0).max(500).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "care_coordinator");
      await db.from("staffProfiles").eq("id", input.staffId).update({
        hourlyRate: input.hourlyRate == null ? null : String(input.hourlyRate),
      });
      await audit(sc.staff.fullName, "staff_hourly_rate_updated", "staff_profile", input.staffId, {
        hourlyRate: input.hourlyRate,
      });
      return { ok: true };
    }),
});

function isEarlyClockOut(reason: string | null | undefined, earlyText: string | null | undefined) {
  if (!reason) return false;
  if (reason.startsWith("early_")) return true;
  return !!earlyText?.trim();
}

async function payrollSummaryData(input: { from: string; to: string; staffId?: number }) {
  const staff = await db.from("staffProfiles").isNull("deletedAt").many<StaffProfiles>();
  const targets = input.staffId
    ? staff.filter((s) => Number(s.id) === input.staffId)
    : staff.filter((s) => ["care_worker", "team_leader", "supervisor"].includes(s.role));
  const rows = [];
  for (const s of targets) {
    const sheet = await buildTimesheet({
      staffId: Number(s.id), from: input.from, to: input.to,
    });
    rows.push({
      staffId: Number(s.id),
      fullName: s.fullName,
      employeeNo: s.employeeNo,
      hourlyRate: s.hourlyRate,
      ...sheet.totals,
      days: sheet.days,
    });
  }
  const totals = rows.reduce(
    (acc, r) => ({
      paidMinutes: acc.paidMinutes + r.paidMinutes,
      unpaidGraceMinutes: acc.unpaidGraceMinutes + r.unpaidGraceMinutes,
      clockMinutes: acc.clockMinutes + r.clockMinutes,
      grossPay: acc.grossPay + r.grossPay,
      visits: acc.visits + r.visits,
      autoClosed: acc.autoClosed + r.autoClosed,
      early: acc.early + r.early,
    }),
    { paidMinutes: 0, unpaidGraceMinutes: 0, clockMinutes: 0, grossPay: 0, visits: 0, autoClosed: 0, early: 0 },
  );
  return { from: input.from, to: input.to, staff: rows, totals };
}

async function buildTimesheet(opts: { staffId: number; from: string; to: string }) {
  const fromIso = `${opts.from}T00:00:00.000Z`;
  const toIso = `${opts.to}T23:59:59.999Z`;
  const sessions = await db.from("visitAttendance")
    .eq("staffId", opts.staffId)
    .gte("clockInAt", fromIso)
    .lte("clockInAt", toIso)
    .order("clockInAt", "asc")
    .many<VisitAttendance>();
  const visits = await db.from("visits").many<Visits>();
  const clients = await db.from("clients").many<Clients>();
  const staff = await db.from("staffProfiles").eq("id", opts.staffId).first<StaffProfiles>();

  type DayRow = {
    date: string;
    sessions: {
      id: number;
      visitId: number;
      clientName: string;
      clockInAt: string;
      clockOutAt: string | null;
      clockMinutes: number;
      paidMinutes: number;
      unpaidGraceMinutes: number;
      hourlyRate: number;
      grossPay: number;
      reason: string | null;
      status: string;
    }[];
    paidMinutes: number;
    unpaidGraceMinutes: number;
    clockMinutes: number;
    grossPay: number;
  };

  const byDay = new Map<string, DayRow>();
  for (const s of sessions) {
    const date = new Date(s.clockInAt).toISOString().slice(0, 10);
    const visit = visits.find((v) => v.id === s.visitId);
    const client = clients.find((c) => c.id === visit?.clientId);
    const rate = Number(s.hourlyRateSnapshot ?? staff?.hourlyRate ?? 0);
    const inProgress = s.status === "in_progress";
    const clockEnd = s.clockOutAt ? new Date(s.clockOutAt) : new Date();
    const clockMinutes = Math.max(0, Math.round((clockEnd.getTime() - new Date(s.clockInAt).getTime()) / 60000));
    let paid = s.paidMinutes ?? 0;
    let unpaid = s.unpaidGraceMinutes ?? 0;
    if (inProgress) {
      // Provisional: full elapsed so far counts as unpaid until clock-out finalises
      paid = 0;
      unpaid = 0;
      if (s.leftGeofenceAt) {
        paid = Math.max(0, Math.round((new Date(s.leftGeofenceAt).getTime() - new Date(s.clockInAt).getTime()) / 60000));
      } else {
        paid = clockMinutes;
      }
    }
    const gross = Math.round((paid / 60) * rate * 100) / 100;
    const day = byDay.get(date) ?? {
      date, sessions: [], paidMinutes: 0, unpaidGraceMinutes: 0, clockMinutes: 0, grossPay: 0,
    };
    day.sessions.push({
      id: Number(s.id),
      visitId: Number(s.visitId),
      clientName: client ? `${client.firstName} ${client.lastName}` : `Visit #${s.visitId}`,
      clockInAt: s.clockInAt,
      clockOutAt: s.clockOutAt,
      clockMinutes,
      paidMinutes: paid,
      unpaidGraceMinutes: unpaid,
      hourlyRate: rate,
      grossPay: gross,
      reason: s.clockOutReason,
      status: s.status,
    });
    // Only closed sessions roll into payroll totals
    if (!inProgress) {
      day.paidMinutes += paid;
      day.unpaidGraceMinutes += unpaid;
      day.grossPay = Math.round((day.grossPay + gross) * 100) / 100;
    }
    day.clockMinutes += clockMinutes;
    byDay.set(date, day);
  }

  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const closed = sessions.filter((s) => s.status !== "in_progress");
  const autoClosed = closed.filter((s) => s.status === "auto_closed" || s.clockOutReason === "auto_left_geofence").length;
  const early = closed.filter((s) => isEarlyClockOut(s.clockOutReason, s.earlyReasonText)).length;
  const totals = days.reduce(
    (acc, d) => ({
      paidMinutes: acc.paidMinutes + d.paidMinutes,
      unpaidGraceMinutes: acc.unpaidGraceMinutes + d.unpaidGraceMinutes,
      clockMinutes: acc.clockMinutes + d.clockMinutes,
      grossPay: Math.round((acc.grossPay + d.grossPay) * 100) / 100,
      visits: acc.visits + d.sessions.filter((s) => s.status !== "in_progress").length,
    }),
    { paidMinutes: 0, unpaidGraceMinutes: 0, clockMinutes: 0, grossPay: 0, visits: 0 },
  );
  return {
    from: opts.from,
    to: opts.to,
    openSessions: sessions.filter((s) => s.status === "in_progress").length,
    days,
    totals: { ...totals, autoClosed, early },
  };
}
