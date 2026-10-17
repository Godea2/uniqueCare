import { describe, it, expect } from "vitest";
import {
  batchOverlaps, intervalsOverlap, panelConflicts, slotUiState, suggestInterviewWindows,
} from "./interview-slots";

describe("slotUiState", () => {
  it("marks the candidate's choice as selected", () => {
    expect(slotUiState({ slotId: 2, capacity: 1, bookedCount: 1, myBookedSlotId: 2 })).toBe("selected");
  });
  it("marks a full slot as booked for others", () => {
    expect(slotUiState({ slotId: 1, capacity: 1, bookedCount: 1, myBookedSlotId: 9 })).toBe("booked");
  });
  it("marks open seats as available", () => {
    expect(slotUiState({ slotId: 1, capacity: 2, bookedCount: 1, myBookedSlotId: null })).toBe("available");
  });
});

describe("panelConflicts", () => {
  it("detects overlapping panel assignments", () => {
    const existing = [{
      id: 10,
      startsAt: "2026-11-01T10:00:00.000Z",
      endsAt: "2026-11-01T10:45:00.000Z",
      panelMemberIds: [1, 2],
    }];
    const hits = panelConflicts({
      panelMemberIds: [2, 3],
      startsAt: new Date("2026-11-01T10:30:00.000Z"),
      endsAt: new Date("2026-11-01T11:15:00.000Z"),
      existing,
    });
    expect(hits).toEqual([{ slotId: 10, memberIds: [2] }]);
  });
  it("ignores non-overlapping times", () => {
    expect(intervalsOverlap(
      new Date("2026-11-01T09:00:00Z"), new Date("2026-11-01T09:45:00Z"),
      new Date("2026-11-01T10:00:00Z"), new Date("2026-11-01T10:45:00Z"),
    )).toBe(false);
  });
});

describe("batchOverlaps + suggestInterviewWindows", () => {
  it("flags overlapping draft slots", () => {
    expect(batchOverlaps([
      { startsAt: new Date("2026-11-02T10:00:00Z"), endsAt: new Date("2026-11-02T10:45:00Z") },
      { startsAt: new Date("2026-11-02T10:30:00Z"), endsAt: new Date("2026-11-02T11:15:00Z") },
    ])).toEqual([[0, 1]]);
  });
  it("suggests at least three future weekday windows", () => {
    const windows = suggestInterviewWindows({ from: new Date("2026-11-06T12:00:00Z"), count: 3 }); // Friday
    expect(windows).toHaveLength(3);
    expect(windows.every((w) => w.endsAt > w.startsAt)).toBe(true);
    expect(windows.every((w) => w.startsAt.getDay() !== 0 && w.startsAt.getDay() !== 6)).toBe(true);
  });
});
