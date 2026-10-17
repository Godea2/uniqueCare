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
import { getStaff, requireRole, audit, notifyRoles } from "../util";
import { geocodePostcode } from "../lib/geo";
import {
  computePaidMinutes,
  EARLY_CLOCK_OUT_REASONS,
  isInsideGeofence,
  LEFT_GEOFENCE_GRACE_MS,
} from "../lib/geofence";

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

async function closeAttendance(
  row: VisitAttendance,
  opts: {
    clockOutAt: Date;
    lat?: number;
    lng?: number;
    accuracyM?: number;
    reason: string;
    earlyReasonText?: string | null;
    leftGeofenceAt?: string | null;
  },
) {
  const clockInAt = new Date(row.clockInAt);
  const leftAt = opts.leftGeofenceAt != null
    ? new Date(opts.leftGeofenceAt)
    : (row.leftGeofenceAt ? new Date(row.leftGeofenceAt) : null);
  const { paidMinutes, unpaidGraceMinutes } = computePaidMinutes({
    clockInAt, clockOutAt: opts.clockOutAt, leftGeofenceAt: leftAt,
  });
  const staff = await db.from("staffProfiles").eq("id", row.staffId).first<StaffProfiles>();
  const rate = staff?.hourlyRate ?? null;
  const status = opts.reason === "auto_left_geofence" ? "auto_closed" : "completed";
  await db.from("visitAttendance").eq("id", row.id).update({
    clockOutAt: opts.clockOutAt.toISOString(),
    clockOutLat: opts.lat != null ? String(opts.lat) : null,
    clockOutLng: opts.lng != null ? String(opts.lng) : null,
    clockOutAccuracyM: opts.accuracyM != null ? String(opts.accuracyM) : null,
    clockOutReason: opts.reason,
    earlyReasonText: opts.earlyReasonText ?? null,
    status,
    leftGeofenceAt: leftAt ? leftAt.toISOString() : row.leftGeofenceAt,
    paidMinutes,
    unpaidGraceMinutes,
    hourlyRateSnapshot: rate,
    updatedAt: new Date().toISOString(),
  });

  // Mark visit completed when every assigned carer has clocked out
  const assignments = await db.from("visitAssignments")
    .eq("visitId", row.visitId)
    .in("status", ["assigned", "accepted"])
    .many<VisitAssignments>();
  const sessions = await db.from("visitAttendance").eq("visitId", row.visitId).many<VisitAttendance>();
  const allDone = assignments.every((a) =>
    sessions.some((s) => Number(s.staffId) === Number(a.staffId) && s.status !== "in_progress"));
  if (allDone) {
    await db.from("visits").eq("id", row.visitId).update({ status: "completed" });
  }

  return { paidMinutes, unpaidGraceMinutes, status, hourlyRateSnapshot: rate };
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

      const point = await resolveClientPoint(client);
      const check = isInsideGeofence({
        lat: input.lat, lng: input.lng,
        clientLat: point.lat, clientLng: point.lng,
        accuracyM: input.accuracyM,
      });
      if (!check.inside) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You must be at the client's address to clock in (about ${Math.round(check.distanceM)} m away; allowed ${Math.round(check.allowedM)} m including GPS accuracy).`,
        });
      }

      const now = new Date();
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
    }).merge(coords.partial()))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      await assertAssigned(input.visitId, Number(sc.staff.id));
      const open = await openAttendance(input.visitId, Number(sc.staff.id));
      if (!open) throw new TRPCError({ code: "BAD_REQUEST", message: "You are not clocked in to this visit." });

      if (input.reason !== "completed" && input.reason !== "auto_left_geofence" && !input.earlyReasonText
        && (input.reason === "early_other")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Please say why you are clocking out early." });
      }

      // Prefer an at-address clock-out when coords are provided
      if (input.lat != null && input.lng != null) {
        const { client } = await assertAssigned(input.visitId, Number(sc.staff.id));
        const point = await resolveClientPoint(client);
        const check = isInsideGeofence({
          lat: input.lat, lng: input.lng,
          clientLat: point.lat, clientLng: point.lng,
          accuracyM: input.accuracyM,
        });
        // Early / completed clock-out is allowed outside the fence, but we record left_geofence_at
        if (!check.inside && !open.leftGeofenceAt) {
          await db.from("visitAttendance").eq("id", open.id).update({
            leftGeofenceAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          open.leftGeofenceAt = new Date().toISOString();
        }
      }

      const result = await closeAttendance(open, {
        clockOutAt: new Date(),
        lat: input.lat,
        lng: input.lng,
        accuracyM: input.accuracyM,
        reason: input.reason,
        earlyReasonText: input.earlyReasonText ?? null,
      });
      await audit(sc.staff.fullName, "visit_clock_out", "visits", input.visitId, {
        reason: input.reason, ...result,
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

      const point = await resolveClientPoint(client);
      const check = isInsideGeofence({
        lat: input.lat, lng: input.lng,
        clientLat: point.lat, clientLng: point.lng,
        accuracyM: input.accuracyM,
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
          await notifyRoles(["super_admin", "care_coordinator"], {
            type: "geofence_violation",
            title: `${sc.staff.fullName} left a visit geofence`,
            body: `${client.firstName} ${client.lastName}: about ${Math.round(check.distanceM)} m from the address during an active visit.`,
            link: "/rota/timesheets",
          });
          violationNotified = true;
        } else if (Date.now() - new Date(leftGeofenceAt).getTime() >= LEFT_GEOFENCE_GRACE_MS) {
          await closeAttendance(open, {
            clockOutAt: new Date(),
            lat: input.lat, lng: input.lng, accuracyM: input.accuracyM,
            reason: "auto_left_geofence",
            leftGeofenceAt,
          });
          await notifyRoles(["super_admin", "care_coordinator"], {
            type: "geofence_auto_clockout",
            title: `${sc.staff.fullName} auto clocked out`,
            body: `Left the geofence for 15+ minutes at ${client.firstName} ${client.lastName}. Grace period is unpaid.`,
            link: "/rota/timesheets",
          });
          await audit(sc.staff.fullName, "visit_auto_clock_out", "visits", input.visitId, {
            distanceM: Math.round(check.distanceM),
          });
          autoClosed = true;
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
      return buildTimesheet({
        staffId: Number(sc.staff.id),
        from: input.from,
        to: input.to,
      });
    }),

  /** Admin/coordinator: payroll summary across staff. */
  payrollSummary: authedQuery
    .input(z.object({
      from: z.string(),
      to: z.string(),
      staffId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "care_coordinator");
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
          hourlyRate: s.hourlyRate,
          ...sheet.totals,
          days: sheet.days,
        });
      }
      const totals = rows.reduce(
        (acc, r) => ({
          paidMinutes: acc.paidMinutes + r.paidMinutes,
          unpaidGraceMinutes: acc.unpaidGraceMinutes + r.unpaidGraceMinutes,
          grossPay: acc.grossPay + r.grossPay,
          visits: acc.visits + r.visits,
        }),
        { paidMinutes: 0, unpaidGraceMinutes: 0, grossPay: 0, visits: 0 },
      );
      return { from: input.from, to: input.to, staff: rows, totals };
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

async function buildTimesheet(opts: { staffId: number; from: string; to: string }) {
  const fromIso = `${opts.from}T00:00:00.000Z`;
  const toIso = `${opts.to}T23:59:59.999Z`;
  const sessions = await db.from("visitAttendance")
    .eq("staffId", opts.staffId)
    .gte("clockInAt", fromIso)
    .lte("clockInAt", toIso)
    .order("clockInAt", "asc")
    .many<VisitAttendance>();
  const closed = sessions.filter((s) => s.status !== "in_progress");
  const visits = await db.from("visits").many<Visits>();
  const clients = await db.from("clients").many<Clients>();

  type DayRow = {
    date: string;
    sessions: {
      id: number;
      visitId: number;
      clientName: string;
      clockInAt: string;
      clockOutAt: string | null;
      paidMinutes: number;
      unpaidGraceMinutes: number;
      hourlyRate: number;
      grossPay: number;
      reason: string | null;
      status: string;
    }[];
    paidMinutes: number;
    unpaidGraceMinutes: number;
    grossPay: number;
  };

  const byDay = new Map<string, DayRow>();
  for (const s of closed) {
    const date = new Date(s.clockInAt).toISOString().slice(0, 10);
    const visit = visits.find((v) => v.id === s.visitId);
    const client = clients.find((c) => c.id === visit?.clientId);
    const rate = Number(s.hourlyRateSnapshot ?? 0);
    const paid = s.paidMinutes ?? 0;
    const unpaid = s.unpaidGraceMinutes ?? 0;
    const gross = Math.round((paid / 60) * rate * 100) / 100;
    const day = byDay.get(date) ?? {
      date, sessions: [], paidMinutes: 0, unpaidGraceMinutes: 0, grossPay: 0,
    };
    day.sessions.push({
      id: Number(s.id),
      visitId: Number(s.visitId),
      clientName: client ? `${client.firstName} ${client.lastName}` : `Visit #${s.visitId}`,
      clockInAt: s.clockInAt,
      clockOutAt: s.clockOutAt,
      paidMinutes: paid,
      unpaidGraceMinutes: unpaid,
      hourlyRate: rate,
      grossPay: gross,
      reason: s.clockOutReason,
      status: s.status,
    });
    day.paidMinutes += paid;
    day.unpaidGraceMinutes += unpaid;
    day.grossPay = Math.round((day.grossPay + gross) * 100) / 100;
    byDay.set(date, day);
  }

  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const totals = days.reduce(
    (acc, d) => ({
      paidMinutes: acc.paidMinutes + d.paidMinutes,
      unpaidGraceMinutes: acc.unpaidGraceMinutes + d.unpaidGraceMinutes,
      grossPay: Math.round((acc.grossPay + d.grossPay) * 100) / 100,
      visits: acc.visits + d.sessions.length,
    }),
    { paidMinutes: 0, unpaidGraceMinutes: 0, grossPay: 0, visits: 0 },
  );
  return {
    from: opts.from,
    to: opts.to,
    openSessions: sessions.filter((s) => s.status === "in_progress").length,
    days,
    totals,
  };
}
