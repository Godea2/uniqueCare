/**
 * Applicant availability_grid ↔ staff rota windows.
 *
 * Form layout (Apply): days mon…sun × mornings | afternoons | evenings | nights
 * Rota engine: staff_availability rows { dayOfWeek 0=Mon…6=Sun, startTime, endTime }
 */

import {
  AVAILABILITY_COLS,
  AVAILABILITY_ROWS,
  type FormAnswers,
  type FormSchemaDoc,
} from "./form-schema";

export type AvailabilityDay = (typeof AVAILABILITY_ROWS)[number];
export type AvailabilitySlot = (typeof AVAILABILITY_COLS)[number];
export type AvailabilityGridValue = Partial<Record<AvailabilityDay, AvailabilitySlot[]>>;

export const DAY_LABELS: Record<AvailabilityDay, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};
export const DAY_LABELS_FULL: Record<AvailabilityDay, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};
export const SLOT_LABELS: Record<AvailabilitySlot, string> = {
  mornings: "Mornings",
  afternoons: "Afternoons",
  evenings: "Evenings",
  nights: "Nights",
};

/** day key → rota dayOfWeek (Mon=0) */
export const DAY_TO_DOW: Record<AvailabilityDay, number> = {
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6,
};
export const DOW_TO_DAY: AvailabilityDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * Clock bands for each form slot (UK domiciliary care).
 * Nights span midnight: late portion on the selected day + early portion the next morning.
 */
export const SLOT_BANDS: Record<AvailabilitySlot, { start: string; end: string }[]> = {
  mornings: [{ start: "06:00", end: "12:00" }],
  afternoons: [{ start: "12:00", end: "17:00" }],
  evenings: [{ start: "17:00", end: "22:00" }],
  nights: [{ start: "22:00", end: "23:59" }],
};

/** Extra windows added on the following calendar day for "nights". */
export const NIGHT_NEXT_DAY = { start: "00:00", end: "06:00" } as const;

export interface StaffAvailabilityWindow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Parse / normalise a stored availability_grid answer. */
export function parseAvailabilityGrid(value: unknown): AvailabilityGridValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: AvailabilityGridValue = {};
  let any = false;
  for (const day of AVAILABILITY_ROWS) {
    const raw = (value as Record<string, unknown>)[day];
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const slots = AVAILABILITY_COLS.filter((c) => raw.map(String).includes(c));
    if (slots.length) {
      out[day] = slots;
      any = true;
    }
  }
  return any ? out : null;
}

/** Find the availability_grid answer on an application (schema-aware, then common ids). */
export function findAvailabilityAnswer(
  answers: FormAnswers,
  schema?: FormSchemaDoc | null,
): unknown {
  if (schema) {
    for (const section of schema.sections) {
      for (const field of section.fields) {
        if (field.type === "availability_grid" && answers[field.id] != null) {
          return answers[field.id];
        }
      }
    }
  }
  for (const key of ["availability", "when_available", "available_to_work"]) {
    if (answers[key] != null) return answers[key];
  }
  return null;
}

/**
 * Map form ticks → merged staff_availability windows.
 * Adjacent/overlapping bands on the same day collapse (e.g. mornings+afternoons → 06:00–17:00).
 */
export function gridToStaffWindows(grid: AvailabilityGridValue): StaffAvailabilityWindow[] {
  const byDay = new Map<number, { start: number; end: number }[]>();

  const push = (dow: number, start: string, end: string) => {
    const day = ((dow % 7) + 7) % 7;
    const arr = byDay.get(day) ?? [];
    arr.push({ start: toMinutes(start), end: toMinutes(end) });
    byDay.set(day, arr);
  };

  for (const day of AVAILABILITY_ROWS) {
    const slots = grid[day];
    if (!slots?.length) continue;
    const dow = DAY_TO_DOW[day];
    for (const slot of slots) {
      for (const band of SLOT_BANDS[slot]) push(dow, band.start, band.end);
      if (slot === "nights") push(dow + 1, NIGHT_NEXT_DAY.start, NIGHT_NEXT_DAY.end);
    }
  }

  const out: StaffAvailabilityWindow[] = [];
  for (const [dow, ranges] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    ranges.sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      // merge if overlapping or touching (incl. 12:00/12:00 boundary)
      if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
      else merged.push({ ...r });
    }
    for (const m of merged) {
      out.push({
        dayOfWeek: dow,
        startTime: fromMinutes(m.start),
        endTime: m.end >= 24 * 60 - 1 ? "23:59" : fromMinutes(m.end),
      });
    }
  }
  return out;
}

/** Compact plain-text summary (AI / CSV); prefer AvailabilityGridView in UI. */
export function formatAvailabilitySummary(grid: AvailabilityGridValue | null): string {
  if (!grid) return "";
  return AVAILABILITY_ROWS
    .filter((d) => (grid[d] ?? []).length)
    .map((d) => `${DAY_LABELS[d]}: ${(grid[d] ?? []).map((s) => SLOT_LABELS[s]).join(", ")}`)
    .join(" · ");
}

/** Count ticked cells for badges. */
export function availabilityTickCount(grid: AvailabilityGridValue | null): number {
  if (!grid) return 0;
  return AVAILABILITY_ROWS.reduce((n, d) => n + (grid[d]?.length ?? 0), 0);
}
