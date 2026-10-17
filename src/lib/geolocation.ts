/** Browser geolocation helper for visit clock-in / probes. */

/** Match server PROBE_INTERVAL_MS — probe while a visit is open. */
export const PROBE_INTERVAL_MS = 15 * 60 * 1000;

export type GeoReading = { lat: number; lng: number; accuracyM: number };

export function readLocation(opts?: { timeoutMs?: number; highAccuracy?: boolean }): Promise<GeoReading> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("Location is not available on this device. Use a phone or enable location services."));
  }
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
              ? "Could not get your location in time. Try again outdoors or near a window."
              : "Could not read your location. Check that GPS is on and try again.";
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: opts?.highAccuracy !== false,
        timeout: opts?.timeoutMs ?? 20000,
        maximumAge: 5000,
      },
    );
  });
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
