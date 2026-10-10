/** UK postcode → coordinates via postcodes.io (free, no key). Returns null when the lookup fails. */
export async function geocodePostcode(postcode: string): Promise<{ lat: number; lng: number } | null> {
  const pc = postcode.replace(/\s+/g, "").toUpperCase();
  if (!pc) return null;
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: { latitude?: number; longitude?: number } };
    const lat = body.result?.latitude;
    const lng = body.result?.longitude;
    return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
  } catch {
    return null;
  }
}

/** Offset of Europe/London from UTC, in minutes, at the given instant (0 in winter, 60 in summer). */
function londonOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The instant a UK wall-clock time happens: londonTime("2026-10-12", "07:30"). Works on a UTC server. */
export function londonTime(date: string, hhmm: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, h, min));
  return new Date(guess.getTime() - londonOffsetMinutes(guess) * 60000);
}
