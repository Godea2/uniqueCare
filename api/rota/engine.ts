/**
 * assignRota — deterministic weekly auto-assignment engine (v2).
 *
 * Hard constraints (never broken):
 *  - worker available (weekly availability window) and not on approved unavailability
 *  - worker not on a pattern day off (fixed/flexible day off, 6-day or 5-day pattern)
 *  - worker not in client excludedStaffIds
 *  - worker has ALL client required skills
 *  - double-handed visits get exactly 2 different workers
 *  - no overlapping visits per worker, including travel time between consecutive visits
 *  - weekly hours cap (maxWeeklyHours, ignored when wtdOptOut)
 *  - students: max 20 hours/week INCLUDING travel time
 *  - 11-hour rest break between the end of one day's duties and the next day's first visit
 *  - visits only scheduled within the client's allowed time window
 *    (±60 min standard; ±30 min for time-critical / medication clients — CQC standard)
 *  - gender preference respected when set
 *
 * Soft constraints (weighted score):
 *  - continuity of care (primary/preferred workers, heavily weighted)
 *  - minimise travel time (geographic optimisation)
 *  - keep visits at the client's preferred time (penalty per minute moved)
 *  - spread hours fairly vs contracted hours
 *  - language match
 *
 * Pure function: no DB access — the caller supplies everything.
 */

export const REST_BREAK_MIN = 11 * 60; // 11 hours
export const STUDENT_MAX_WEEKLY_HOURS = 20; // inclusive of travel
export const DEFAULT_WINDOW_MIN = 60;
export const TIME_CRITICAL_WINDOW_MIN = 30;

export interface EngineWorker {
  id: number;
  gender: string | null;
  languages: string[];
  skills: string[];
  drives: boolean;
  contractedHours: number;
  maxWeeklyHours: number;
  wtdOptOut: boolean;
  /** student workers are capped at 20h/week including travel time */
  isStudent?: boolean;
  /** days of week (0=Mon..6=Sun) the worker must not work this week (pattern days off) */
  daysOff?: number[];
  /** end of the worker's last duty before this week, in week-minutes (<= 0). Null = unknown/none. */
  prevDutyEndMin?: number | null;
  /** dayOfWeek(0=Mon) -> windows in minutes from midnight */
  availability: Record<number, { start: number; end: number }[]>;
  /** approved unavailability: [startMin, endMin] in week-minutes */
  unavailability: { startMin: number; endMin: number }[];
  /** hours already assigned this week */
  assignedHours: number;
  /** Keys of mandatory compliance docs that are missing or expired — hard-blocks assignment */
  expiredDocKeys?: string[];
}

export interface EngineVisit {
  id: number;
  clientId: number;
  dayOfWeek: number;
  startMin: number; // minutes from week start (Mon 00:00) — the client's PREFERRED time
  endMin: number;
  callType: "single" | "double";
  /** allowed shift either side of preferred start (60 standard / 30 time-critical). Default 60. */
  windowMin?: number;
  requiredSkills: string[];
  excludedStaffIds: number[];
  preferredStaffIds: number[];
  primaryStaffId: number | null;
  preferredGender: "any" | "female" | "male";
  preferredLanguage: string | null;
  /** fixed assignments that must not change (e.g. already accepted) */
  lockedStaffIds: number[];
}

export interface AssignmentOut {
  visitId: number;
  staffId: number;
  slot: "lead" | "second";
  reason: string;
  travelMinutes: number;
  /** minutes the visit was moved from the client's preferred time (0 = on time) */
  movedByMin: number;
}

export interface EngineResult {
  assignments: AssignmentOut[];
  unassigned: { visitId: number; reasons: { staffId: number; reason: string }[] }[];
}

const DAY = 24 * 60;
const travelKey = (a: number, b: number) => `${a}->${b}`;

function effMaxHours(w: EngineWorker) {
  return w.isStudent ? Math.min(w.maxWeeklyHours, STUDENT_MAX_WEEKLY_HOURS) : w.maxWeeklyHours;
}

/** Hours this visit costs the worker; for students travel time counts toward the cap. */
function hourCost(w: EngineWorker, v: { startMin: number; endMin: number }, travelMin: number) {
  return (v.endMin - v.startMin) / 60 + (w.isStudent ? travelMin / 60 : 0);
}

function eligible(
  w: EngineWorker,
  v: EngineVisit,
  weeklyHours: Map<number, number>,
): { ok: boolean; reason?: string } {
  if (w.expiredDocKeys?.length)
    return { ok: false, reason: `expired mandatory document: ${w.expiredDocKeys.join(", ")}` };
  if (v.lockedStaffIds.includes(w.id) === false && v.excludedStaffIds.includes(w.id))
    return { ok: false, reason: "Client has excluded this worker" };
  if (v.preferredGender !== "any" && w.gender && w.gender !== v.preferredGender)
    return { ok: false, reason: `Client prefers ${v.preferredGender} carers` };
  const missing = v.requiredSkills.filter((s) => !w.skills.includes(s));
  if (missing.length) return { ok: false, reason: `Missing skills: ${missing.join(", ")}` };
  const dow = Math.floor(v.startMin / DAY);
  if ((w.daysOff ?? []).includes(dow))
    return { ok: false, reason: "Pattern day off" };
  const windows = w.availability[dow] ?? [];
  const startInDay = v.startMin % DAY;
  const endInDay = v.endMin % DAY;
  const inWindow = windows.some((win) => win.start <= startInDay && win.end >= endInDay);
  if (!inWindow) return { ok: false, reason: "Outside weekly availability" };
  if (w.unavailability.some((u) => u.startMin < v.endMin && u.endMin > v.startMin))
    return { ok: false, reason: "Approved unavailability overlaps" };
  const cur = weeklyHours.get(w.id) ?? w.assignedHours;
  if (!w.wtdOptOut && cur + hourCost(w, v, 0) > effMaxHours(w))
    return { ok: false, reason: w.isStudent
      ? `Would exceed student cap (${STUDENT_MAX_WEEKLY_HOURS}h incl. travel)`
      : `Would exceed max weekly hours (${w.maxWeeklyHours}h)` };
  return { ok: true };
}

function overlapsExisting(
  w: EngineWorker,
  v: EngineVisit,
  placed: Map<number, { startMin: number; endMin: number; clientId: number }[]>,
  travel: Map<string, number>,
): { ok: boolean; travelFromPrev: number } {
  const mine = (placed.get(w.id) ?? []).slice().sort((a, b) => a.startMin - b.startMin);
  let travelFromPrev = 0;
  for (const p of mine) {
    if (p.clientId === v.clientId && p.endMin === v.startMin) continue;
    const tAB = travel.get(travelKey(p.clientId, v.clientId)) ?? 15;
    const tBA = travel.get(travelKey(v.clientId, p.clientId)) ?? 15;
    if (p.endMin + tAB <= v.startMin) continue; // p before v
    if (v.endMin + tBA <= p.startMin) { // v before p
      travelFromPrev = tAB;
      continue;
    }
    return { ok: false, travelFromPrev: 0 };
  }
  const prev = mine.filter((p) => p.endMin <= v.startMin).pop();
  if (prev) travelFromPrev = travel.get(travelKey(prev.clientId, v.clientId)) ?? 15;
  return { ok: true, travelFromPrev };
}

/**
 * 11-hour rest break: for consecutive working days, the gap between the last
 * visit of day D and the first visit of day D+1 must be >= 11 hours.
 * The previous week's final duty (prevDutyEndMin) counts toward Monday.
 */
function restBreakOk(
  w: EngineWorker,
  startMin: number,
  endMin: number,
  placed: Map<number, { startMin: number; endMin: number; clientId: number }[]>,
): boolean {
  const mine = (placed.get(w.id) ?? []).concat({ startMin, endMin, clientId: -1 });
  if (w.prevDutyEndMin != null)
    mine.push({ startMin: w.prevDutyEndMin - 1, endMin: w.prevDutyEndMin, clientId: -1 });
  const byDay = new Map<number, { first: number; last: number }>();
  for (const p of mine) {
    const d = Math.floor(p.startMin / DAY);
    const g = byDay.get(d) ?? { first: Infinity, last: -Infinity };
    g.first = Math.min(g.first, p.startMin);
    g.last = Math.max(g.last, p.endMin);
    byDay.set(d, g);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] + 1) {
      const gap = byDay.get(days[i])!.first - byDay.get(days[i - 1])!.last;
      if (gap < REST_BREAK_MIN) return false;
    }
  }
  return true;
}

function score(
  w: EngineWorker,
  v: EngineVisit,
  weeklyHours: Map<number, number>,
  travelMin: number,
  movedByMin: number,
) {
  let s = 0;
  // continuity of care — the strongest signal
  if (v.primaryStaffId === w.id) s += 150;
  else if (v.preferredStaffIds.includes(w.id)) s += 60;
  s += Math.max(0, 40 - travelMin) * 1.5; // geographic optimisation
  s -= movedByMin / 3; // stay as close to the preferred time as possible
  // fairness: prefer under-utilised relative to contracted
  const cur = weeklyHours.get(w.id) ?? w.assignedHours;
  if (w.contractedHours > 0) s += Math.max(0, 20 * (1 - cur / w.contractedHours));
  if (v.preferredLanguage && w.languages.includes(v.preferredLanguage)) s += 10;
  return s;
}

/** Candidate offsets within the client's window, best-first (0, +15, -15, +30, -30, …). */
function offsetsFor(windowMin: number): number[] {
  const out = [0];
  for (let o = 15; o <= windowMin; o += 15) out.push(o, -o);
  return out;
}

export function assignRota(input: {
  visits: EngineVisit[];
  workers: EngineWorker[];
  /** travel minutes between client ids (travel-cache / haversine-derived) */
  travel: Map<string, number>;
}): EngineResult {
  const { visits, workers, travel } = input;
  const placed = new Map<number, { startMin: number; endMin: number; clientId: number }[]>();
  const weeklyHours = new Map<number, number>();
  for (const w of workers) weeklyHours.set(w.id, w.assignedHours);

  // pre-place locked assignments (kept exactly as scheduled)
  const lockedByVisit = new Map<number, number[]>();
  for (const v of visits) {
    lockedByVisit.set(v.id, []);
    for (const sid of v.lockedStaffIds) {
      const arr = placed.get(sid) ?? [];
      arr.push({ startMin: v.startMin, endMin: v.endMin, clientId: v.clientId });
      placed.set(sid, arr);
      weeklyHours.set(sid, (weeklyHours.get(sid) ?? 0) + (v.endMin - v.startMin) / 60);
      lockedByVisit.get(v.id)!.push(sid);
    }
  }

  // hardest first: double-handed, then rare skills, then time-critical (tight window), then duration
  const skillFreq = new Map<string, number>();
  for (const w of workers) for (const sk of w.skills) skillFreq.set(sk, (skillFreq.get(sk) ?? 0) + 1);
  const difficulty = (v: EngineVisit) => {
    let d = v.callType === "double" ? 1000 : 0;
    for (const sk of v.requiredSkills) d += 500 / Math.max(1, skillFreq.get(sk) ?? 1);
    if (v.preferredGender !== "any") d += 200;
    d += 300 * (1 - (v.windowMin ?? DEFAULT_WINDOW_MIN) / DEFAULT_WINDOW_MIN); // tighter window = harder
    d += (v.endMin - v.startMin) / 10;
    return d;
  };
  const ordered = visits.slice().sort((a, b) => difficulty(b) - difficulty(a));

  const assignments: AssignmentOut[] = [];
  const unassigned: EngineResult["unassigned"] = [];

  for (const v0 of ordered) {
    const locked = lockedByVisit.get(v0.id) ?? [];
    const needed = (v0.callType === "double" ? 2 : 1) - locked.length;
    if (needed <= 0) continue;

    const windowMin = v0.windowMin ?? DEFAULT_WINDOW_MIN;
    const cands: { w: EngineWorker; s: number; travelMin: number; off: number }[] = [];
    const fails: { staffId: number; reason: string }[] = [];

    for (const w of workers) {
      if (locked.includes(w.id)) continue;
      // try the preferred time first, then shift within the client's window
      let placed_ok = false;
      for (const off of offsetsFor(windowMin)) {
        const startMin = v0.startMin + off;
        if (Math.floor(startMin / DAY) !== v0.dayOfWeek) continue; // never cross midnight
        const v: EngineVisit = { ...v0, startMin, endMin: v0.endMin + off };
        const e = eligible(w, v, weeklyHours);
        if (!e.ok) {
          if (off === 0) fails.push({ staffId: w.id, reason: e.reason! });
          // shifting within the window can only fix availability timing, never skills/exclusions/days off
          if (e.reason === "Outside weekly availability") continue;
          break;
        }
        const ov = overlapsExisting(w, v, placed, travel);
        if (!ov.ok) continue; // another offset may still fit
        if (!restBreakOk(w, v.startMin, v.endMin, placed)) {
          if (off === 0) fails.push({ staffId: w.id, reason: "Would break the 11-hour rest rule" });
          continue;
        }
        // recheck hours cap with travel included (students)
        const cur = weeklyHours.get(w.id) ?? w.assignedHours;
        if (!w.wtdOptOut && cur + hourCost(w, v, ov.travelFromPrev) > effMaxHours(w)) {
          if (off === 0) fails.push({ staffId: w.id, reason: w.isStudent
            ? `Would exceed student cap (${STUDENT_MAX_WEEKLY_HOURS}h incl. travel)`
            : `Would exceed max weekly hours (${w.maxWeeklyHours}h)` });
          break;
        }
        cands.push({ w, s: score(w, v, weeklyHours, ov.travelFromPrev, Math.abs(off)), travelMin: ov.travelFromPrev, off });
        placed_ok = true;
        break; // best (smallest) feasible offset for this worker
      }
      if (!placed_ok && !fails.some((f) => f.staffId === w.id))
        fails.push({ staffId: w.id, reason: "No feasible slot within the client's time window (incl. travel/rest)" });
    }
    cands.sort((a, b) => b.s - a.s);

    if (cands.length < needed) {
      unassigned.push({ visitId: v0.id, reasons: fails.slice(0, 5) });
      continue;
    }
    for (let i = 0; i < needed; i++) {
      const c = cands[i];
      const slot: "lead" | "second" = locked.length + i === 0 ? "lead" : "second";
      const bits: string[] = [];
      if (v0.primaryStaffId === c.w.id) bits.push("Primary carer for client (continuity of care)");
      else if (v0.preferredStaffIds.includes(c.w.id)) bits.push("Preferred worker for client (continuity of care)");
      bits.push(`${c.travelMin} min from previous visit`);
      if (c.off !== 0)
        bits.push(`moved ${Math.abs(c.off)} min ${c.off > 0 ? "later" : "earlier"} within the client's ±${windowMin} min window`);
      const matched = v0.requiredSkills.filter((sk) => c.w.skills.includes(sk));
      if (matched.length) bits.push(`has ${matched.join(", ")} skill${matched.length > 1 ? "s" : ""}`);
      const startMin = v0.startMin + c.off;
      assignments.push({
        visitId: v0.id, staffId: c.w.id, slot, travelMinutes: c.travelMin,
        movedByMin: c.off,
        reason: bits.join("; ") + ".",
      });
      const arr = placed.get(c.w.id) ?? [];
      arr.push({ startMin, endMin: v0.endMin + c.off, clientId: v0.clientId });
      placed.set(c.w.id, arr);
      weeklyHours.set(c.w.id, (weeklyHours.get(c.w.id) ?? 0) + hourCost(c.w, { startMin, endMin: v0.endMin + c.off }, c.travelMin));
    }
  }
  return { assignments, unassigned };
}
