import type { InterviewBookings, InterviewSlots } from "@db/schema";

/** How a slot appears to a specific candidate (or to admins). */
export type SlotUiState = "available" | "selected" | "booked";

export const MIN_OFFERED_SLOTS = 3;

export function slotCapacity(slot: Pick<InterviewSlots, "capacity">): number {
  return Math.max(1, Number(slot.capacity ?? 1));
}

export function slotBookedCount(
  slotId: number,
  bookings: Pick<InterviewBookings, "slotId" | "status">[],
): number {
  return bookings.filter((b) => Number(b.slotId) === Number(slotId) && b.status === "booked").length;
}

/**
 * available — open, has seats, not this candidate's choice
 * selected  — this candidate's confirmed booking
 * booked    — full (no seats left) for anyone else
 */
export function slotUiState(opts: {
  slotId: number;
  capacity: number;
  bookedCount: number;
  myBookedSlotId?: number | null;
}): SlotUiState {
  if (opts.myBookedSlotId != null && Number(opts.myBookedSlotId) === Number(opts.slotId)) {
    return "selected";
  }
  if (opts.bookedCount >= opts.capacity) return "booked";
  return "available";
}

export const SLOT_STATE_LABEL: Record<SlotUiState, string> = {
  available: "Available",
  selected: "Selected",
  booked: "Booked",
};

/** True when two [start,end) intervals overlap. */
export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Panel members already booked into an overlapping slot. */
export function panelConflicts(opts: {
  panelMemberIds: number[];
  startsAt: Date;
  endsAt: Date;
  existing: Pick<InterviewSlots, "id" | "startsAt" | "endsAt" | "panelMemberIds">[];
  ignoreSlotIds?: number[];
}): { slotId: number; memberIds: number[] }[] {
  const ignore = new Set(opts.ignoreSlotIds ?? []);
  const out: { slotId: number; memberIds: number[] }[] = [];
  for (const s of opts.existing) {
    if (ignore.has(Number(s.id))) continue;
    if (!intervalsOverlap(opts.startsAt, opts.endsAt, new Date(s.startsAt), new Date(s.endsAt))) continue;
    const theirs = ((s.panelMemberIds as number[]) ?? []).map(Number);
    const overlap = opts.panelMemberIds.filter((id) => theirs.includes(id));
    if (overlap.length) out.push({ slotId: Number(s.id), memberIds: overlap });
  }
  return out;
}

/** Within a draft batch, find overlapping pairs (by index). */
export function batchOverlaps(slots: { startsAt: Date; endsAt: Date }[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (intervalsOverlap(slots[i].startsAt, slots[i].endsAt, slots[j].startsAt, slots[j].endsAt)) {
        pairs.push([i, j]);
      }
    }
  }
  return pairs;
}

/**
 * Suggest `count` weekday interview windows starting from `from` (local calendar day),
 * spreading morning / late-morning / afternoon across consecutive weekdays.
 */
export function suggestInterviewWindows(opts?: {
  from?: Date;
  count?: number;
  durationMinutes?: number;
}): { startsAt: Date; endsAt: Date }[] {
  const count = opts?.count ?? MIN_OFFERED_SLOTS;
  const duration = opts?.durationMinutes ?? 45;
  const hours = [10, 11, 14];
  const out: { startsAt: Date; endsAt: Date }[] = [];
  const cursor = new Date(opts?.from ?? Date.now());
  cursor.setHours(0, 0, 0, 0);
  // Prefer starting tomorrow so candidates always get future choices.
  cursor.setDate(cursor.getDate() + 1);

  while (out.length < count) {
    const day = cursor.getDay(); // 0 Sun … 6 Sat
    if (day !== 0 && day !== 6) {
      const hour = hours[out.length % hours.length]!;
      const startsAt = new Date(cursor);
      startsAt.setHours(hour, 0, 0, 0);
      const endsAt = new Date(startsAt.getTime() + duration * 60_000);
      if (startsAt.getTime() > Date.now()) out.push({ startsAt, endsAt });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
