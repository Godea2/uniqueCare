import { db } from "../db";
import type {
  Clients,
  StaffProfiles,
  VisitAssignments,
  VisitAttendance,
  Visits,
} from "@db/schema";
import { computePaidMinutes } from "./geofence";
import { audit, notifyRoles, MANAGER_ALERT_ROLES } from "../util";

export async function closeAttendance(
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

/** Server-side sweep when the phone/tab is closed and probes stop. */
export async function runAutoClockOutSweep(): Promise<{ closed: number; forgotten: number }> {
  const { LEFT_GEOFENCE_GRACE_MS } = await import("./geofence");
  const now = Date.now();
  const open = await db.from("visitAttendance").eq("status", "in_progress").many<VisitAttendance>();
  let closed = 0;
  let forgotten = 0;

  for (const row of open) {
    const visit = await db.from("visits").eq("id", row.visitId).first<Visits>();
    const staff = await db.from("staffProfiles").eq("id", row.staffId).first<StaffProfiles>();
    const client = visit
      ? await db.from("clients").eq("id", visit.clientId).first<Clients>()
      : null;
    const clientLabel = client
      ? `${client.firstName} ${client.lastName}`
      : `Visit #${row.visitId}`;
    const staffName = staff?.fullName ?? "Staff";

    // A) Left fence recorded and grace elapsed
    if (row.leftGeofenceAt) {
      const leftAt = new Date(row.leftGeofenceAt).getTime();
      if (now - leftAt >= LEFT_GEOFENCE_GRACE_MS) {
        const clockOutAt = new Date(leftAt + LEFT_GEOFENCE_GRACE_MS);
        await closeAttendance(row, {
          clockOutAt,
          reason: "auto_left_geofence",
          leftGeofenceAt: row.leftGeofenceAt,
        });
        await notifyRoles([...MANAGER_ALERT_ROLES], {
          type: "geofence_auto_clockout",
          title: `${staffName} auto clocked out`,
          body: `Left the geofence for 15+ minutes at ${clientLabel}. Those 15 minutes are unpaid. (Server sweep — app was not open.)`,
          link: "/rota/timesheets",
        });
        await audit("System", "visit_auto_clock_out", "visits", row.visitId, {
          staffId: row.staffId, via: "sweep_left_geofence",
        });
        closed++;
        continue;
      }
    }

    // B) Forgotten clock-out: visit ended 15+ minutes ago and session still open
    if (visit?.scheduledEnd) {
      const endMs = new Date(visit.scheduledEnd).getTime();
      if (now - endMs >= LEFT_GEOFENCE_GRACE_MS) {
        const leftAt = row.leftGeofenceAt ?? visit.scheduledEnd;
        const clockOutAt = new Date(
          Math.min(now, new Date(leftAt).getTime() + LEFT_GEOFENCE_GRACE_MS),
        );
        await closeAttendance(row, {
          clockOutAt,
          reason: "auto_left_geofence",
          leftGeofenceAt: leftAt,
        });
        await notifyRoles([...MANAGER_ALERT_ROLES], {
          type: "geofence_auto_clockout",
          title: `${staffName} auto clocked out (forgotten)`,
          body: `Still clocked in after the scheduled end at ${clientLabel}. Paid time stopped at the leave/end time; grace is unpaid.`,
          link: "/rota/timesheets",
        });
        await audit("System", "visit_auto_clock_out", "visits", row.visitId, {
          staffId: row.staffId, via: "sweep_forgotten",
        });
        forgotten++;
      }
    }
  }

  await audit("System", "attendance_sweep_run", "visit_attendance", undefined, {
    closed, forgotten, scanned: open.length,
  });

  return { closed, forgotten };
}
