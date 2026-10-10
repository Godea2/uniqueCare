import { describe, expect, it } from "vitest";
import { registerUrl, sessionWhen, sessionWhere } from "./training";

describe("training session wording", () => {
  it("states the day and London times", () => {
    expect(sessionWhen({ startsAt: "2026-10-14T08:00:00Z", endsAt: "2026-10-14T15:00:00Z" }))
      .toBe("Wednesday 14 October, 09:00–16:00");
  });

  it("describes where the session happens", () => {
    expect(sessionWhere({ delivery: "in_person", location: "Training room 1", meetingUrl: null })).toBe("Training room 1");
    expect(sessionWhere({ delivery: "in_person", location: null, meetingUrl: null })).toBe("Our office");
    expect(sessionWhere({ delivery: "online", location: "Online", meetingUrl: "https://teams.example/x" })).toBe("Online — https://teams.example/x");
    expect(sessionWhere({ delivery: "online", location: "Online", meetingUrl: null })).toBe("Online (we will send the joining link)");
  });

  it("builds the trainer's register link", () => {
    expect(registerUrl("https://app.example", "abc")).toBe("https://app.example/training/register/abc");
  });
});
