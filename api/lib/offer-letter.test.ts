import { describe, it, expect } from "vitest";
import { buildOfferLetter, offerPdfFileName, renderOfferPdf } from "./offer-letter";

describe("offer letter PDF", () => {
  it("builds readable offer text", () => {
    const text = buildOfferLetter({
      name: "Ada Lovelace", role: "Care Worker", salary: "£12.50/hr",
      orgName: "Unique Care UK", signatory: "Daniel Whitfield", signatoryTitle: "Registered Manager",
    });
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("Care Worker");
    expect(text).toContain("OFFER OF EMPLOYMENT");
  });

  it("renders a PDF starting with %PDF", () => {
    const text = buildOfferLetter({
      name: "Ada Lovelace", role: "Care Worker", salary: "£12.50/hr",
      orgName: "Unique Care UK", signatory: "Daniel Whitfield", signatoryTitle: "",
    });
    const pdf = renderOfferPdf(text, { title: "Offer — Ada Lovelace" });
    expect(Buffer.from(pdf.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(500);
    expect(Buffer.from(pdf).toString("latin1")).toContain("%%EOF");
  });

  it("names the download file safely", () => {
    expect(offerPdfFileName("Ada Lovelace")).toBe("Offer-Letter-Ada-Lovelace.pdf");
  });
});
