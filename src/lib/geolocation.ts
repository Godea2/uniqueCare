/** Browser geolocation helper for visit clock-in / probes. */

/** Match server PROBE_INTERVAL_MS — probe while a visit is open. */
export const PROBE_INTERVAL_MS = 15 * 60 * 1000;

export type GeoReading = { lat: number; lng: number; accuracyM: number };

export type ReadLocationOpts = {
  timeoutMs?: number;
  /** Clock-in/out: high accuracy. Probes: low accuracy + longer cache (battery). */
  purpose?: "clock" | "probe";
  /** Allow a slightly stale reading when GPS is weak (ms). */
  maximumAgeMs?: number;
};

/**
 * Read device location.
 * - clock: high accuracy, short cache (must be at the door).
 * - probe: lower accuracy, up to 60s cache — battery-friendlier on phones.
 */
export function readLocation(opts?: ReadLocationOpts): Promise<GeoReading> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("Location is not available on this device. Use a phone or enable location services."));
  }
  const purpose = opts?.purpose ?? "clock";
  const highAccuracy = purpose === "clock";
  const maximumAge = opts?.maximumAgeMs
    ?? (purpose === "probe" ? 60_000 : 5_000);
  const timeout = opts?.timeoutMs ?? (purpose === "probe" ? 25_000 : 20_000);

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy ?? 10,
        });
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Allow location access for UniqueCare to clock in at visits."
            : err.code === err.TIMEOUT
              ? "Could not get your location in time. Try again outdoors or near a window (poor GPS signal)."
              : "Could not read your location. Check that GPS is on and try again.";
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout,
        maximumAge,
      },
    );
  });
}

type ScreenWakeLock = { release: () => Promise<void> };

/** Keep the screen awake while clocked in so 15-minute probes keep firing. */
export async function requestVisitWakeLock(): Promise<ScreenWakeLock | null> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<ScreenWakeLock> };
    };
    if (!nav.wakeLock) return null;
    return await nav.wakeLock.request("screen");
  } catch {
    return null;
  }
}

export function fmtMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}
