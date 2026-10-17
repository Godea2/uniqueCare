import { describe, it, expect } from "vitest";
import {
  parseAvailabilityGrid,
  gridToStaffWindows,
  findAvailabilityAnswer,
  formatAvailabilitySummary,
} from "@contracts/availability";

describe("availability grid → staff windows", () => {
  it("parses a typical applicant answer", () => {
    const grid = parseAvailabilityGrid({
      fri: ["afternoons"],
      mon: ["mornings"],
      sat: ["mornings"],
      sun: ["nights", "evenings"],
      tue: ["afternoons"],
      wed: ["afternoons"],
    });
    expect(grid?.mon).toEqual(["mornings"]);
    expect(grid?.sun).toEqual(["evenings", "nights"]);
    expect(grid?.thu).toBeUndefined();
  });

  it("maps mornings to 06:00–12:00 on the correct dayOfWeek", () => {
    const windows = gridToStaffWindows({ mon: ["mornings"] });
    expect(windows).toEqual([{ dayOfWeek: 0, startTime: "06:00", endTime: "12:00" }]);
  });

  it("merges adjacent mornings + afternoons into one window", () => {
    const windows = gridToStaffWindows({ tue: ["mornings", "afternoons"] });
    expect(windows).toEqual([{ dayOfWeek: 1, startTime: "06:00", endTime: "17:00" }]);
  });

  it("adds next-morning window for nights (crosses midnight)", () => {
    const windows = gridToStaffWindows({ sun: ["nights"] });
    // Sunday late + Monday early
    expect(windows).toContainEqual({ dayOfWeek: 6, startTime: "22:00", endTime: "23:59" });
    expect(windows).toContainEqual({ dayOfWeek: 0, startTime: "00:00", endTime: "06:00" });
  });

  it("finds the grid from schema field id or fallback key", () => {
    const answers = { availability: { mon: ["mornings"] }, other: "x" };
    expect(findAvailabilityAnswer(answers)).toEqual({ mon: ["mornings"] });
    expect(findAvailabilityAnswer({ foo: 1 })).toBeNull();
  });

  it("formats a readable summary in day order", () => {
    const s = formatAvailabilitySummary({
      fri: ["afternoons"],
      mon: ["mornings"],
      sun: ["evenings", "nights"],
    });
    expect(s).toBe("Mon: Mornings · Fri: Afternoons · Sun: Evenings, Nights");
  });

  it("returns empty windows for an empty grid", () => {
    expect(gridToStaffWindows({})).toEqual([]);
  });
});
