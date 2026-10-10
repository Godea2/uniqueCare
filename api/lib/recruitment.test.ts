import { describe, expect, it } from "vitest";
import { APPLICATION_STAGES } from "@db/schema";
import { canTransition, computeScore, enforceEvidence } from "./recruitment";

describe("stage rules", () => {
  const closed = ["hired", "rejected", "withdrawn", "screened_out"];
  const beforeShortlist = ["applied", "review"];

  it("lets a candidate be rejected at every active stage after shortlisting", () => {
    for (const stage of APPLICATION_STAGES) {
      if (closed.includes(stage) || beforeShortlist.includes(stage)) continue;
      expect(canTransition(stage, "rejected"), stage).toBe(true);
    }
  });

  it("screens out (not rejects) before shortlisting", () => {
    for (const stage of beforeShortlist) {
      expect(canTransition(stage as never, "screened_out")).toBe(true);
    }
  });

  it("never reopens closed applications except a screened-out one", () => {
    expect(canTransition("hired", "rejected")).toBe(false);
    expect(canTransition("rejected", "applied")).toBe(false);
    expect(canTransition("withdrawn", "applied")).toBe(false);
  });
});
import type { JobRequirement } from "@contracts/form-schema";

const reqs: JobRequirement[] = [
  { key: "right_to_work", label: "Right to work in the UK", weight: 20, type: "hard", required: true },
  { key: "experience", label: "Care experience", weight: 30, type: "scored", required: false },
  { key: "driving", label: "Full UK driving licence", weight: 10, type: "scored", required: false },
];
const formText = [
  "- Do you have the right to work in the UK?: Yes",
  "- How many years of care experience do you have?: 1–2 years",
  "- Tell us about your experience: I supported two older adults with personal care at home for 18 months.",
].join("\n");
const ctx = (over: Partial<Parameters<typeof enforceEvidence>[2]> = {}) => ({
  knockoutRequirements: new Set<string>(), formText, cvText: "", ...over,
});

describe("enforceEvidence", () => {
  it("keeps a yes whose quote is in the form, ignoring punctuation and quote marks", () => {
    const { results, flags } = enforceEvidence(reqs, [
      { requirement_key: "experience", met: "yes", evidence: "“I supported two older adults with personal care at home”", source: "form" },
    ], ctx());
    expect(results.find((r) => r.requirement_key === "experience")?.met).toBe("yes");
    expect(flags).toEqual([]);
  });

  it("accepts quotes shortened with an ellipsis", () => {
    const { results } = enforceEvidence(reqs, [
      { requirement_key: "experience", met: "yes", evidence: "I supported two older adults … for 18 months", source: "form" },
    ], ctx());
    expect(results.find((r) => r.requirement_key === "experience")?.met).toBe("yes");
  });

  it("downgrades a yes whose quote is not in the application", () => {
    const { results, flags } = enforceEvidence(reqs, [
      { requirement_key: "experience", met: "yes", evidence: "Five years as a senior carer in a nursing home", source: "form" },
    ], ctx());
    const exp = results.find((r) => r.requirement_key === "experience")!;
    expect(exp.met).toBe("partial");
    expect(exp.evidence).toBe("");
    expect(flags[0]).toMatch(/isn't in the application/);
  });

  it("downgrades a yes with no quote at all", () => {
    const { results } = enforceEvidence(reqs, [
      { requirement_key: "driving", met: "yes", evidence: "", source: "none" },
    ], ctx());
    expect(results.find((r) => r.requirement_key === "driving")?.met).toBe("partial");
  });

  it("corrects the source when the quote is in the other place", () => {
    const { results } = enforceEvidence(reqs, [
      { requirement_key: "driving", met: "yes", evidence: "Full clean UK driving licence", source: "form" },
    ], ctx({ cvText: "Skills: Full clean UK driving licence, first aid." }));
    const d = results.find((r) => r.requirement_key === "driving")!;
    expect(d.met).toBe("yes");
    expect(d.source).toBe("cv");
  });

  it("does not punish CV quotes it cannot check (PDF read directly, no extracted text)", () => {
    const { results, flags } = enforceEvidence(reqs, [
      { requirement_key: "driving", met: "yes", evidence: "Full UK licence", source: "cv" },
    ], ctx({ cvText: "" }));
    expect(results.find((r) => r.requirement_key === "driving")?.met).toBe("yes");
    expect(flags).toEqual([]);
  });

  it("forces a knockout answer to not met, whatever the model said", () => {
    const { results, flags } = enforceEvidence(reqs, [
      { requirement_key: "right_to_work", met: "yes", evidence: "British passport holder", source: "cv" },
    ], ctx({ knockoutRequirements: new Set(["right_to_work"]) }));
    expect(results.find((r) => r.requirement_key === "right_to_work")?.met).toBe("no");
    expect(flags[0]).toMatch(/rules this out/);
  });

  it("treats a requirement the model skipped as unknown", () => {
    const { results } = enforceEvidence(reqs, [], ctx());
    expect(results.map((r) => r.met)).toEqual(["unknown", "unknown", "unknown"]);
  });
});

describe("computeScore", () => {
  it("weights credit: yes 1, partial 0.5, unknown and no 0", () => {
    const { score } = computeScore(reqs, [
      { requirement_key: "right_to_work", met: "yes" },
      { requirement_key: "experience", met: "partial" },
      { requirement_key: "driving", met: "unknown" },
    ]);
    expect(score).toBe(Math.round(((20 + 15) / 60) * 100));
  });

  it("caps the score at 50 when a must-have is not met and lists the gap", () => {
    const { score, mustHaveGaps } = computeScore(reqs, [
      { requirement_key: "right_to_work", met: "no" },
      { requirement_key: "experience", met: "yes" },
      { requirement_key: "driving", met: "yes" },
    ]);
    expect(score).toBe(50);
    expect(mustHaveGaps).toEqual(["Right to work in the UK"]);
  });

  it("reports a must-have that is only partly met as a gap without capping", () => {
    const { score, mustHaveGaps } = computeScore(reqs, [
      { requirement_key: "right_to_work", met: "partial" },
      { requirement_key: "experience", met: "yes" },
      { requirement_key: "driving", met: "yes" },
    ]);
    expect(score).toBe(83);
    expect(mustHaveGaps).toEqual(["Right to work in the UK"]);
  });
});
