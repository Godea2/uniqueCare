/**
 * Geofence helpers for visit clock-in / location probes.
 *
 * Business fence: 3 metres from the client location (release requirement).
 * GPS phones rarely report sub-3m accuracy, so we accept a reading when the
 * carer is within (3m + reported accuracy). That still enforces "at the door"
 * without rejecting honest carers whose phone GPS is ±8–15 m.
 */

export const GEOFENCE_RADIUS_M = 3;
/** Unpaid grace after leaving the fence before auto clock-out */
export const LEFT_GEOFENCE_GRACE_MS = 15 * 60 * 1000;
/** Client should probe about every 15 minutes while on a visit */
export const PROBE_INTERVAL_MS = 15 * 60 * 1000;

export function haversineMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Allowed distance = fence radius + GPS uncertainty (accuracy). */
export function allowedDistanceM(accuracyM?: number | null): number {
  const acc = typeof accuracyM === "number" && Number.isFinite(accuracyM) && accuracyM > 0
    ? accuracyM
    : 10; // conservative default when the device omits accuracy
  return GEOFENCE_RADIUS_M + acc;
}

export function isInsideGeofence(opts: {
  lat: number;
  lng: number;
  clientLat: number;
  clientLng: number;
  accuracyM?: number | null;
}): { inside: boolean; distanceM: number; allowedM: number } {
  const distanceM = haversineMetres(opts.lat, opts.lng, opts.clientLat, opts.clientLng);
  const allowedM = allowedDistanceM(opts.accuracyM);
  return { inside: distanceM <= allowedM, distanceM, allowedM };
}

export function computePaidMinutes(opts: {
  clockInAt: Date;
  clockOutAt: Date;
  leftGeofenceAt?: Date | null;
}): { paidMinutes: number; unpaidGraceMinutes: number } {
  const paidEnd = opts.leftGeofenceAt && opts.leftGeofenceAt < opts.clockOutAt
    ? opts.leftGeofenceAt
    : opts.clockOutAt;
  const paidMs = Math.max(0, paidEnd.getTime() - opts.clockInAt.getTime());
  const unpaidMs = Math.max(0, opts.clockOutAt.getTime() - paidEnd.getTime());
  return {
    paidMinutes: Math.round(paidMs / 60000),
    unpaidGraceMinutes: Math.round(unpaidMs / 60000),
  };
}

export const EARLY_CLOCK_OUT_REASONS = [
  "completed",
  "early_client_request",
  "early_no_access",
  "early_emergency",
  "early_other",
  "auto_left_geofence",
] as const;

export type ClockOutReason = (typeof EARLY_CLOCK_OUT_REASONS)[number];
