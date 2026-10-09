/**
 * assignRota — deterministic weekly auto-assignment engine.
 *
 * Hard constraints (never broken):
 *  - worker available (weekly availability window) and not on approved unavailability
 *  - worker not in client excludedStaffIds
 *  - worker has ALL client required skills
 *  - double-handed visits get exactly 2 different workers
 *  - no overlapping visits per worker, including travel time between consecutive visits
 *  - weekly hours cap (maxWeeklyHours, ignored when wtdOptOut)
 *  - gender preference respected when set
 *
 * Soft constraints (weighted score):
 *  - continuity of care (primary/preferred workers)
 *  - minimise travel time
 *  - spread hours fairly vs contracted hours
 *  - language match
 *
 * Pure function: no DB access — the caller supplies everything.
 */

export interface EngineWorker {
  id: number;
  gender: string | null;
  languages: string[];
  skills: string[];
  drives: boolean;
  contractedHours: number;
  maxWeeklyHours: number;
  wtdOptOut: boolean;
  /** dayOfWeek(0=Mon) -> windows in minutes from midnight */
  availability: Record<number, { start: number; end: number }[]>;
  /** approved unavailability: [startMin, endMin] in week-minutes */
  unavailability: { startMin: number; endMin: number }[];
  /** hours already assigned this week */
  assignedHours: number;
}

export interface EngineVisit {
  id: number;
  clientId: number;
  dayOfWeek: number;
  startMin: number; // minutes from week start (Mon 00:00)
  endMin: number;
  callType: "single" | "double";
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
}

export interface EngineResult {
  assignments: AssignmentOut[];
  unassigned: { visitId: number; reasons: { staffId: number; reason: string }[] }[];
}

const DAY = 24 * 60;
const travelKey = (a: number, b: number) => `${a}->${b}`;

function eligible(
  w: EngineWorker,
  v: EngineVisit,
  weeklyHours: Map<number, number>,
): { ok: boolean; reason?: string } {
  if (v.lockedStaffIds.includes(w.id) === false && v.excludedStaffIds.includes(w.id))
    return { ok: false, reason: "Client has excluded this worker" };
  if (v.preferredGender !== "any" && w.gender && w.gender !== v.preferredGender)
    return { ok: false, reason: `Client prefers ${v.preferredGender} carers` };
  const missing = v.requiredSkills.filter((s) => !w.skills.includes(s));
  if (missing.length) return { ok: false, reason: `Missing skills: ${missing.join(", ")}` };
  const windows = w.availability[v.dayOfWeek] ?? [];
  const startInDay = v.startMin % DAY;
  const endInDay = v.endMin % DAY;
  const inWindow = windows.some((win) => win.start <= startInDay && win.end >= endInDay);
  if (!inWindow) return { ok: false, reason: "Outside weekly availability" };
  if (w.unavailability.some((u) => u.startMin < v.endMin && u.endMin > v.startMin))
    return { ok: false, reason: "Approved unavailability overlaps" };
  const hours = (v.endMin - v.startMin) / 60;
  const cur = weeklyHours.get(w.id) ?? w.assignedHours;
  if (!w.wtdOptOut && cur + hours > w.maxWeeklyHours)
    return { ok: false, reason: `Would exceed max weekly hours (${w.maxWeeklyHours}h)` };
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
    // p before v: need p.end + travel <= v.start
    if (p.endMin + tAB <= v.startMin) continue;
    // v before p: need v.end + travel <= p.start
    if (v.endMin + tBA <= p.startMin) {
      travelFromPrev = tAB;
      continue;
    }
    return { ok: false, travelFromPrev: 0 };
  }
  // travel from the visit immediately before
  const prev = mine.filter((p) => p.endMin <= v.startMin).pop();
  if (prev) travelFromPrev = travel.get(travelKey(prev.clientId, v.clientId)) ?? 15;
  return { ok: true, travelFromPrev };
}

function score(w: EngineWorker, v: EngineVisit, weeklyHours: Map<number, number>, travelMin: number) {
  let s = 0;
  if (v.primaryStaffId === w.id) s += 100;
  else if (v.preferredStaffIds.includes(w.id)) s += 40;
  s += Math.max(0, 30 - travelMin); // travel
  // fairness: prefer under-utilised relative to contracted
  const cur = weeklyHours.get(w.id) ?? w.assignedHours;
  if (w.contractedHours > 0) s += Math.max(0, 20 * (1 - cur / w.contractedHours));
  if (v.preferredLanguage && w.languages.includes(v.preferredLanguage)) s += 10;
  return s;
}

export function assignRota(input: {
  visits: EngineVisit[];
  workers: EngineWorker[];
  /** travel minutes between client ids (haversine-derived) */
  travel: Map<string, number>;
}): EngineResult {
  const { visits, workers, travel } = input;
  const placed = new Map<number, { startMin: number; endMin: number; clientId: number }[]>();
  const weeklyHours = new Map<number, number>();
  for (const w of workers) weeklyHours.set(w.id, w.assignedHours);

  // pre-place locked assignments
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

  // hardest first: double-handed, then rare skills, then tight duration
  const skillFreq = new Map<string, number>();
  for (const w of workers) for (const sk of w.skills) skillFreq.set(sk, (skillFreq.get(sk) ?? 0) + 1);
  const difficulty = (v: EngineVisit) => {
    let d = v.callType === "double" ? 1000 : 0;
    for (const sk of v.requiredSkills) d += 500 / Math.max(1, skillFreq.get(sk) ?? 1);
    if (v.preferredGender !== "any") d += 200;
    d += (v.endMin - v.startMin) / 10;
    return d;
  };
  const ordered = visits.slice().sort((a, b) => difficulty(b) - difficulty(a));

  const assignments: AssignmentOut[] = [];
  const unassigned: EngineResult["unassigned"] = [];

  for (const v of ordered) {
    const locked = lockedByVisit.get(v.id) ?? [];
    const needed = (v.callType === "double" ? 2 : 1) - locked.length;
    if (needed <= 0) continue;

    const cands: { w: EngineWorker; s: number; travelMin: number }[] = [];
    const fails: { staffId: number; reason: string }[] = [];
    for (const w of workers) {
      if (locked.includes(w.id)) continue;
      const e = eligible(w, v, weeklyHours);
      if (!e.ok) {
        fails.push({ staffId: w.id, reason: e.reason! });
        continue;
      }
      const ov = overlapsExisting(w, v, placed, travel);
      if (!ov.ok) {
        fails.push({ staffId: w.id, reason: "Would overlap another visit (incl. travel)" });
        continue;
      }
      cands.push({ w, s: score(w, v, weeklyHours, ov.travelFromPrev), travelMin: ov.travelFromPrev });
    }
    cands.sort((a, b) => b.s - a.s);

    if (cands.length < needed) {
      unassigned.push({ visitId: v.id, reasons: fails.slice(0, 5) });
      continue;
    }
    for (let i = 0; i < needed; i++) {
      const c = cands[i];
      const slot: "lead" | "second" = locked.length + i === 0 ? "lead" : "second";
      const bits: string[] = [];
      if (v.primaryStaffId === c.w.id) bits.push("Primary carer for client");
      else if (v.preferredStaffIds.includes(c.w.id)) bits.push("Preferred worker for client");
      bits.push(`${c.travelMin} min from previous visit`);
      const matched = v.requiredSkills.filter((sk) => c.w.skills.includes(sk));
      if (matched.length) bits.push(`has ${matched.join(", ")} skill${matched.length > 1 ? "s" : ""}`);
      assignments.push({
        visitId: v.id, staffId: c.w.id, slot, travelMinutes: c.travelMin,
        reason: bits.join("; ") + ".",
      });
      const arr = placed.get(c.w.id) ?? [];
      arr.push({ startMin: v.startMin, endMin: v.endMin, clientId: v.clientId });
      placed.set(c.w.id, arr);
      weeklyHours.set(c.w.id, (weeklyHours.get(c.w.id) ?? 0) + (v.endMin - v.startMin) / 60);
    }
  }
  return { assignments, unassigned };
}
