import { describe, it, expect } from "vitest";
import {
  haversineMetres,
  isInsideGeofence,
  allowedDistanceM,
  computePaidMinutes,
  GEOFENCE_RADIUS_M,
} from "./geofence";

describe("geofence", () => {
  it("haversine is ~0 for the same point", () => {
    expect(haversineMetres(51.5, -0.12, 51.5, -0.12)).toBeLessThan(0.01);
  });

  it("allows clock-in within 3m + accuracy", () => {
    // ~2m north of a point near London
    const client = { lat: 51.5074, lng: -0.1278 };
    const carer = { lat: 51.507418, lng: -0.1278 }; // ≈2m
    const r = isInsideGeofence({
      ...carer, clientLat: client.lat, clientLng: client.lng, accuracyM: 5,
    });
    expect(r.distanceM).toBeLessThan(3);
    expect(r.inside).toBe(true);
    expect(r.allowedM).toBe(GEOFENCE_RADIUS_M + 5);
  });

  it("rejects a carer clearly away from the client", () => {
    const r = isInsideGeofence({
      lat: 51.51, lng: -0.13,
      clientLat: 51.5074, clientLng: -0.1278,
      accuracyM: 10,
    });
    expect(r.inside).toBe(false);
    expect(r.distanceM).toBeGreaterThan(r.allowedM);
  });

  it("defaults accuracy to 10m when omitted", () => {
    expect(allowedDistanceM(null)).toBe(GEOFENCE_RADIUS_M + 10);
  });

  it("stops paid time when the carer left the geofence", () => {
    const clockInAt = new Date("2026-10-17T09:00:00Z");
    const leftGeofenceAt = new Date("2026-10-17T09:40:00Z");
    const clockOutAt = new Date("2026-10-17T09:55:00Z"); // 15 min unpaid grace
    const r = computePaidMinutes({ clockInAt, clockOutAt, leftGeofenceAt });
    expect(r.paidMinutes).toBe(40);
    expect(r.unpaidGraceMinutes).toBe(15);
  });

  it("pays full session when they never left the fence", () => {
    const clockInAt = new Date("2026-10-17T09:00:00Z");
    const clockOutAt = new Date("2026-10-17T09:45:00Z");
    const r = computePaidMinutes({ clockInAt, clockOutAt, leftGeofenceAt: null });
    expect(r.paidMinutes).toBe(45);
    expect(r.unpaidGraceMinutes).toBe(0);
  });
});
