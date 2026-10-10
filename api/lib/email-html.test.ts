import { describe, expect, it } from "vitest";
import { renderEmailHtml } from "./email-html";

const render = (text: string, kind = "application_confirmation") =>
  renderEmailHtml({ orgName: "Unique Care UK", subject: "Your application", text, kind });

describe("renderEmailHtml", () => {
  it("turns a line that is only a URL into a labelled button", () => {
    const html = render("Dear Ann,\n\nOpen your portal:\nhttps://example.com/portal/abc\n\nKind regards,\nTeam");
    expect(html).toContain('href="https://example.com/portal/abc"');
    expect(html).toContain("Open your candidate portal");
    expect(html).toContain("Dear Ann,");
    expect(html).toContain("Kind regards,<br>Team");
  });

  it("escapes candidate-supplied text", () => {
    const html = render("Dear <script>alert(1)</script>,\n\nThanks");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("links URLs inside sentences without making a button", () => {
    const html = render("See https://example.com/help for help.", "unsuccessful");
    expect(html).toContain('<a href="https://example.com/help"');
    expect(html).not.toContain("Or copy this link");
  });

  it("uses a generic label for unknown kinds", () => {
    expect(render("Go:\nhttps://example.com", "something_else")).toContain("Open link");
  });
});
