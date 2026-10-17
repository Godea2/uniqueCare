import { describe, it, expect } from "vitest";
import { isRemovedComplianceKey, resolveComplianceRequirement } from "./compliance-docs";

describe("compliance document form", () => {
  it("retires qualifications and employment history", () => {
    expect(isRemovedComplianceKey("qualifications")).toBe(true);
    expect(isRemovedComplianceKey("employment_history")).toBe(true);
    expect(isRemovedComplianceKey("bank_details")).toBe(false);
  });

  it("uses text input for bank, references and right to work", () => {
    expect(resolveComplianceRequirement({ key: "bank_details", label: "Bank" }).inputKind).toBe("text");
    expect(resolveComplianceRequirement({ key: "reference_1", label: "Ref" }).inputKind).toBe("text");
    expect(resolveComplianceRequirement({ key: "reference_2", label: "Ref" }).inputKind).toBe("text");
    expect(resolveComplianceRequirement({ key: "right_to_work", label: "RTW" }).guidance).toBe("Enter Share Code");
  });

  it("labels driving docs and proof of address guidance", () => {
    expect(resolveComplianceRequirement({ key: "driving_docs", label: "old" }).label).toBe("Driver's License Document");
    expect(resolveComplianceRequirement({ key: "proof_of_address", label: "PoA" }).guidance).toBe("Utility Bill");
  });
});
