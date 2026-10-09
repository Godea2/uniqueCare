import { describe, it, expect } from "vitest";
import { assignRota, type EngineVisit, type EngineWorker } from "./engine";

const DAY = 24 * 60;
const mkWorker = (id: number, over: Partial<EngineWorker> = {}): EngineWorker => ({
  id,
  gender: "female",
  languages: ["English"],
  skills: ["dementia", "medication_level_2"],
  drives: true,
  contractedHours: 37.5,
  maxWeeklyHours: 48,
  wtdOptOut: false,
  availability: { 0: [{ start: 6 * 60, end: 23 * 60 }], 1: [{ start: 6 * 60, end: 23 * 60 }] },
  unavailability: [],
  assignedHours: 0,
  ...over,
});
const mkVisit = (id: number, over: Partial<EngineVisit> = {}): EngineVisit => ({
  id,
  clientId: id,
  dayOfWeek: 0,
  startMin: 8 * 60,
  endMin: 9 * 60,
  callType: "single",
  requiredSkills: [],
  excludedStaffIds: [],
  preferredStaffIds: [],
  primaryStaffId: null,
  preferredGender: "any",
  preferredLanguage: null,
  lockedStaffIds: [],
  ...over,
});

describe("assignRota", () => {
  it("assigns a simple visit to an eligible worker", () => {
    const r = assignRota({ visits: [mkVisit(1)], workers: [mkWorker(1)], travel: new Map() });
    expect(r.assignments).toHaveLength(1);
    expect(r.unassigned).toHaveLength(0);
  });

  it("never assigns a worker missing a required skill", () => {
    const r = assignRota({
      visits: [mkVisit(1, { requiredSkills: ["hoist"] })],
      workers: [mkWorker(1), mkWorker(2, { skills: ["hoist"] })],
      travel: new Map(),
    });
    expect(r.assignments[0].staffId).toBe(2);
  });

  it("respects excluded staff", () => {
    const r = assignRota({
      visits: [mkVisit(1, { excludedStaffIds: [1] })],
      workers: [mkWorker(1), mkWorker(2)],
      travel: new Map(),
    });
    expect(r.assignments[0].staffId).toBe(2);
  });

  it("double-handed visits get exactly two different workers", () => {
    const r = assignRota({
      visits: [mkVisit(1, { callType: "double" })],
      workers: [mkWorker(1), mkWorker(2), mkWorker(3)],
      travel: new Map(),
    });
    const asg = r.assignments.filter((a) => a.visitId === 1);
    expect(asg).toHaveLength(2);
    expect(new Set(asg.map((a) => a.staffId)).size).toBe(2);
  });

  it("reports unassigned with reasons when double-handed cannot be filled", () => {
    const r = assignRota({
      visits: [mkVisit(1, { callType: "double" })],
      workers: [mkWorker(1)],
      travel: new Map(),
    });
    expect(r.unassigned).toHaveLength(1);
    expect(r.assignments).toHaveLength(0);
  });

  it("never overlaps visits including travel time", () => {
    const travel = new Map([["1->2", 30]]);
    const visits = [
      mkVisit(1, { clientId: 1, startMin: 8 * 60, endMin: 9 * 60 }),
      mkVisit(2, { clientId: 2, startMin: 9 * 60 + 15, endMin: 10 * 60 }), // 15 min gap < 30 travel
    ];
    const r = assignRota({ visits, workers: [mkWorker(1), mkWorker(2)], travel });
    // with two workers both can be placed — but never the same worker on both
    const w1 = r.assignments.filter((a) => a.staffId === 1).map((a) => a.visitId);
    expect(w1.length).toBeLessThan(2);
  });

  it("honours the weekly hours cap unless opted out", () => {
    const w = mkWorker(1, { maxWeeklyHours: 1 });
    const visits = [mkVisit(1), mkVisit(2, { clientId: 2, startMin: 10 * 60, endMin: 11 * 60 })];
    const r = assignRota({ visits, workers: [w, mkWorker(2, { gender: "male" })], travel: new Map() });
    const w1count = r.assignments.filter((a) => a.staffId === 1).length;
    expect(w1count).toBeLessThanOrEqual(1);
  });

  it("respects gender preference when set", () => {
    const r = assignRota({
      visits: [mkVisit(1, { preferredGender: "female" })],
      workers: [mkWorker(1, { gender: "male" }), mkWorker(2, { gender: "female" })],
      travel: new Map(),
    });
    expect(r.assignments[0].staffId).toBe(2);
  });

  it("prefers the primary carer (continuity)", () => {
    const r = assignRota({
      visits: [mkVisit(1, { primaryStaffId: 3 })],
      workers: [mkWorker(1), mkWorker(2), mkWorker(3)],
      travel: new Map(),
    });
    expect(r.assignments[0].staffId).toBe(3);
  });

  it("respects unavailability windows", () => {
    const r = assignRota({
      visits: [mkVisit(1)],
      workers: [
        mkWorker(1, { unavailability: [{ startMin: 7 * 60, endMin: 10 * 60 }] }),
        mkWorker(2),
      ],
      travel: new Map(),
    });
    expect(r.assignments[0].staffId).toBe(2);
  });

  it("handles 1,500 visits within the performance budget", () => {
    const workers = Array.from({ length: 60 }, (_, i) =>
      mkWorker(i + 1, { skills: i % 3 === 0 ? ["hoist", "dementia"] : ["dementia"] }),
    );
    const visits = Array.from({ length: 1500 }, (_, i) =>
      mkVisit(i + 1, {
        clientId: (i % 100) + 1,
        dayOfWeek: i % 2,
        startMin: (i % 2) * DAY + (6 + (i % 12)) * 60,
        endMin: (i % 2) * DAY + (7 + (i % 12)) * 60,
        requiredSkills: i % 5 === 0 ? ["hoist"] : [],
        callType: i % 10 === 0 ? "double" : "single",
      }),
    );
    const t0 = Date.now();
    const r = assignRota({ visits, workers, travel: new Map() });
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(10000);
    expect(r.assignments.length).toBeGreaterThan(0);
  });
});
