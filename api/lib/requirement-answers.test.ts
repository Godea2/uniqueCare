import { describe, expect, it } from "vitest";
import {
  defaultCareWorkerForm, structuredMet, suggestRequirementSetup, syncRequirementQuestions, requirementFieldId,
  CHECKBOX_CONFIRMED, type JobRequirement,
} from "@contracts/form-schema";
import { normaliseRequirements } from "./job-form";

const req = (over: Partial<JobRequirement>): JobRequirement => ({
  key: "thing", label: "Thing", weight: 10, type: "scored", required: false, ...over,
});

describe("suggestRequirementSetup", () => {
  it("asks licences, DBS and right to work as yes / no", () => {
    expect(suggestRequirementSetup("Full UK Driving License?")).toMatchObject({
      answerType: "yes_no", question: "Do you hold a full UK driving licence?", accepted: ["yes"],
    });
    expect(suggestRequirementSetup("Enhanced DBS").answerType).toBe("yes_no");
    expect(suggestRequirementSetup("Right to work in the UK").answerType).toBe("yes_no");
  });

  it("turns years of experience into a dropdown with the bands at or above the minimum accepted", () => {
    const s = suggestRequirementSetup("2+ years experience in domiciliary care");
    expect(s.answerType).toBe("single_choice");
    expect(s.options?.length).toBeGreaterThan(2);
    expect(s.accepted).toEqual(["3_5", "5_plus"]);
  });

  it("asks availability as multiple choice and accepts the shift named in the label", () => {
    const s = suggestRequirementSetup("Weekend availability");
    expect(s.answerType).toBe("multiple_choice");
    expect(s.accepted).toEqual(["weekends"]);
  });

  it("leaves open-ended requirements as a written answer", () => {
    expect(suggestRequirementSetup("Person-centred values and communication").answerType).toBe("text");
  });
});

describe("syncRequirementQuestions with answer types", () => {
  const base = defaultCareWorkerForm();
  const fieldFor = (r: JobRequirement) =>
    syncRequirementQuestions(base, [r]).sections.flatMap((s) => s.fields).find((f) => f.id === requirementFieldId(r.key));

  it("generates the matching field type", () => {
    expect(fieldFor(req({ key: "dbs", label: "Enhanced DBS", answerType: "yes_no", question: "Do you have a DBS?" })))
      .toMatchObject({ type: "yes_no", label: "Do you have a DBS?" });
    const options = [{ value: "a", label: "A" }, { value: "b", label: "B" }];
    expect(fieldFor(req({ key: "pick", answerType: "single_choice", options }))).toMatchObject({ type: "single_choice", options });
    expect(fieldFor(req({ key: "many", answerType: "multiple_choice", options }))).toMatchObject({ type: "multiple_choice", options });
    expect(fieldFor(req({ key: "plain" }))).toMatchObject({ type: "long_text" });
  });

  it("makes a checkbox one optional tick box, so must-haves aren't forced", () => {
    const f = fieldFor(req({ key: "confirm", label: "Own PPE", required: true, answerType: "checkbox", question: "I have my own PPE" }));
    expect(f).toMatchObject({ type: "multiple_choice", required: false, options: [{ value: CHECKBOX_CONFIRMED, label: "I have my own PPE" }] });
  });

  it("rebuilds an existing generated question when its answer type changes", () => {
    const first = syncRequirementQuestions(base, [req({ key: "car" })]);
    const again = syncRequirementQuestions(first, [req({ key: "car", answerType: "yes_no" })]);
    const fields = again.sections.flatMap((s) => s.fields).filter((f) => f.requirementKey === "car");
    expect(fields).toHaveLength(1);
    expect(fields[0].type).toBe("yes_no");
  });
});

describe("structuredMet", () => {
  it("decides yes / no answers, defaulting to yes meeting it", () => {
    expect(structuredMet(req({ answerType: "yes_no" }), { type: "yes_no" }, "yes")).toBe("yes");
    expect(structuredMet(req({ answerType: "yes_no" }), { type: "yes_no" }, "no")).toBe("no");
    expect(structuredMet(req({ answerType: "yes_no", accepted: ["no"] }), { type: "yes_no" }, "no")).toBe("yes");
  });

  it("decides choices from the accepted answers, and leaves them to AI when none are set", () => {
    const r = req({ answerType: "multiple_choice", accepted: ["nights"] });
    expect(structuredMet(r, { type: "multiple_choice" }, ["weekdays", "nights"])).toBe("yes");
    expect(structuredMet(r, { type: "multiple_choice" }, ["weekdays"])).toBe("no");
    expect(structuredMet(req({ answerType: "single_choice" }), { type: "single_choice" }, "a")).toBeNull();
  });

  it("counts an unticked checkbox as not met, but an unanswered dropdown as undecided", () => {
    expect(structuredMet(req({ answerType: "checkbox" }), { type: "multiple_choice" }, [])).toBe("no");
    expect(structuredMet(req({ answerType: "checkbox" }), { type: "multiple_choice" }, [CHECKBOX_CONFIRMED])).toBe("yes");
    expect(structuredMet(req({ answerType: "single_choice", accepted: ["a"] }), { type: "single_choice" }, undefined)).toBeNull();
  });

  it("never decides a written answer", () => {
    expect(structuredMet(req({}), { type: "long_text" }, "I have a licence")).toBeNull();
  });
});

describe("normaliseRequirements", () => {
  it("gives new options values and keeps only accepted answers that exist", () => {
    const [r] = normaliseRequirements([{
      label: "Shifts", weight: 10, required: false, answerType: "multiple_choice",
      options: [{ label: "Early mornings" }, { label: "Nights" }, { label: "" }], accepted: ["nights", "bogus"],
    }]);
    expect(r.options).toEqual([{ value: "early_mornings", label: "Early mornings" }, { value: "nights", label: "Nights" }]);
    expect(r.accepted).toEqual(["nights"]);
  });

  it("refuses a dropdown with fewer than two answers", () => {
    expect(() => normaliseRequirements([{ label: "Pick", weight: 10, required: false, answerType: "single_choice", options: [{ label: "Only" }] }]))
      .toThrow(/two answers/);
  });

  it("defaults yes / no to yes, and keeps old requirements as written answers", () => {
    const [yn, old] = normaliseRequirements([
      { label: "Car driver", weight: 10, required: true, answerType: "yes_no" },
      { label: "Values", weight: 10, required: false },
    ]);
    expect(yn).toMatchObject({ answerType: "yes_no", accepted: ["yes"] });
    expect(old.answerType).toBeUndefined();
  });
});
