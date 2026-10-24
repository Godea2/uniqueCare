import { describe, it, expect } from "vitest";
import {
  complianceKeyTracksExpiry,
  isHrOnlyComplianceKey,
  isNonExpiringComplianceKey,
  isRemovedComplianceKey,
  resolveComplianceRequirement,
  shouldRequestComplianceFromCandidate,
} from "./compliance-docs";

describe("compliance document form", () => {
  it("retires qualifications, employment history and health declaration", () => {
    expect(isRemovedComplianceKey("qualifications")).toBe(true);
    expect(isRemovedComplianceKey("employment_history")).toBe(true);
    expect(isRemovedComplianceKey("health_declaration")).toBe(true);
    expect(isRemovedComplianceKey("bank_details")).toBe(false);
  });

  it("treats bank, contract, references and proof of address as non-expiring", () => {
    for (const key of ["bank_details", "signed_contract", "reference_1", "reference_2", "proof_of_address"]) {
      expect(isNonExpiringComplianceKey(key)).toBe(true);
      expect(complianceKeyTracksExpiry(key)).toBe(false);
    }
    expect(complianceKeyTracksExpiry("dbs_enhanced")).toBe(true);
    expect(complianceKeyTracksExpiry("right_to_work")).toBe(true);
    expect(complianceKeyTracksExpiry("photo_id")).toBe(true);
  });

  it("keeps signed contract and DBS as office-led, not candidate uploads", () => {
    expect(isHrOnlyComplianceKey("signed_contract")).toBe(true);
    expect(isHrOnlyComplianceKey("dbs_enhanced")).toBe(true);
    expect(shouldRequestComplianceFromCandidate("signed_contract")).toBe(false);
    expect(shouldRequestComplianceFromCandidate("dbs_enhanced")).toBe(false);
  });

  it("only asks for driving docs when the candidate holds a licence", () => {
    expect(shouldRequestComplianceFromCandidate("driving_docs", { hasDrivingLicence: false })).toBe(false);
    expect(shouldRequestComplianceFromCandidate("driving_docs", { hasDrivingLicence: true })).toBe(true);
    expect(shouldRequestComplianceFromCandidate("photo_id")).toBe(true);
    expect(shouldRequestComplianceFromCandidate("bank_details")).toBe(true);
  });

  it("uses text input for bank, references and right to work", () => {
    expect(resolveComplianceRequirement({ key: "bank_details", label: "Bank" }).inputKind).toBe("text");
    expect(resolveComplianceRequirement({ key: "reference_1", label: "Ref" }).inputKind).toBe("text");
    expect(resolveComplianceRequirement({ key: "reference_2", label: "Ref" }).inputKind).toBe("text");
    expect(resolveComplianceRequirement({ key: "right_to_work", label: "RTW" }).guidance).toBe("Enter Share Code");
  });

  it("labels driving docs and proof of address guidance", () => {
    expect(resolveComplianceRequirement({ key: "driving_docs", label: "old" }).label).toBe("Driver's Licence");
    expect(resolveComplianceRequirement({ key: "proof_of_address", label: "PoA" }).guidance).toBe("Utility Bill");
  });
});
