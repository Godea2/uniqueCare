import { describe, it, expect } from "vitest";
import { buildTrainingCertificate, buildTrainingFailLetter, trainingOutcomeFileName } from "./training-outcome";
import { renderTextPdf } from "./pdf-text";

describe("training outcomes", () => {
  it("builds a pass certificate", () => {
    const text = buildTrainingCertificate({
      name: "Ada Lovelace", courseTitle: "Safeguarding Adults Level 2",
      orgName: "Unique Care UK", when: "Monday 10 November 2026, 09:00–12:30",
      signatory: "Daniel Whitfield", certificateNo: "UC-TR-12-20261110",
    });
    expect(text).toContain("CERTIFICATE OF TRAINING");
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("Safeguarding Adults Level 2");
    const pdf = renderTextPdf(text, { title: "Certificate" });
    expect(Buffer.from(pdf.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("builds a fail outcome letter", () => {
    const text = buildTrainingFailLetter({
      name: "Ada Lovelace", courseTitle: "Moving & Handling (practical)",
      orgName: "Unique Care UK", notes: "Did not demonstrate safe techniques.",
      signatory: "Daniel Whitfield",
    });
    expect(text).toContain("TRAINING OUTCOME");
    expect(text).toContain("did not meet the required standard");
    expect(text).toContain("Did not demonstrate safe techniques.");
  });

  it("names download files", () => {
    expect(trainingOutcomeFileName("pass", "Ada Lovelace", "Safeguarding")).toContain("Training-Certificate");
    expect(trainingOutcomeFileName("fail", "Ada Lovelace", "Safeguarding")).toContain("Training-Outcome");
  });
});
