import { describe, expect, it } from "vitest";
import { employmentLabel, formatSalary } from "@contracts/job-display";

describe("formatSalary", () => {
  it("reads small bare amounts as hourly rates", () => {
    expect(formatSalary("17")).toBe("£17 per hour");
    expect(formatSalary("12.5")).toBe("£12.50 per hour");
    expect(formatSalary("12.50-14")).toBe("£12.50–£14.00 per hour");
  });

  it("reads large bare amounts as yearly salaries", () => {
    expect(formatSalary("25000")).toBe("£25,000 per year");
    expect(formatSalary("£25,000 - £28,000")).toBe("£25,000–£28,000 per year");
    expect(formatSalary("25k-28k")).toBe("£25,000–£28,000 per year");
  });

  it("keeps worded salaries, adding a missing £", () => {
    expect(formatSalary("£15 per hour")).toBe("£15 per hour");
    expect(formatSalary("15 per hour plus mileage")).toBe("£15 per hour plus mileage");
    expect(formatSalary("Competitive")).toBe("Competitive");
    expect(formatSalary("  ")).toBeNull();
    expect(formatSalary(null)).toBeNull();
  });
});

describe("employmentLabel", () => {
  it("names employment types for candidates", () => {
    expect(employmentLabel("full_time")).toBe("Full time");
    expect(employmentLabel("fixed_term")).toBe("Fixed term");
  });
});
