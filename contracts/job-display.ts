const money = (n: number, pence: boolean) =>
  `£${n.toLocaleString("en-GB", { minimumFractionDigits: pence ? 2 : 0, maximumFractionDigits: pence ? 2 : 0 })}`;

/**
 * Salary as candidates should read it. Admins often type just "17" or "25000-28000";
 * bare amounts under £100 are hourly rates and amounts of £1,000 or more are yearly.
 * Anything already worded ("£12 per hour", "Competitive") is kept, with a £ added if missing.
 */
export function formatSalary(text: string | null | undefined): string | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const bare = /^£?\s*\d[\d,.]*\s*k?(\s*(-|–|to)\s*£?\s*\d[\d,.]*\s*k?)?$/i.test(raw);
  if (!bare) return /^\d/.test(raw) ? `£${raw}` : raw;

  const amounts = [...raw.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k?)/gi)].map(([, n, k]) => {
    const v = Number(n.replace(/,/g, ""));
    return k ? v * 1000 : v;
  });
  if (amounts.some((n) => !Number.isFinite(n))) return raw;
  const top = Math.max(...amounts);
  const hourly = top < 100;
  const pence = hourly && amounts.some((n) => !Number.isInteger(n));
  const range = amounts.map((n) => money(n, pence)).join("–");
  if (hourly) return `${range} per hour`;
  if (top >= 1000) return `${range} per year`;
  return range;
}

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full time", part_time: "Part time", bank: "Bank / flexible", contract: "Contract",
  temporary: "Temporary", permanent: "Permanent", zero_hours: "Zero hours",
};

export function employmentLabel(type: string | null | undefined): string {
  if (!type) return "";
  const known = EMPLOYMENT_LABELS[type];
  if (known) return known;
  const words = type.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
