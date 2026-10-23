/**
 * Weekly rota Excel template — one row per visit.
 * Accepts the app's own template and the Unique Care "Rota Templates Weeks 1–4" workbook.
 */
import ExcelJS from "exceljs";

export const WEEK_SHEET_HEADERS = [
  "Day", "Date", "Client", "Visit type", "Call type", "Start", "End", "Carer", "Notes",
] as const;

export type WeekSheetRow = {
  rowNum: number;
  day: string;
  date: string;
  client: string;
  visitType: string;
  callType: string;
  start: string;
  end: string;
  carer: string;
  notes: string;
};

export type ParsedWorkbook = {
  rows: WeekSheetRow[];
  sheetUsed: string;
  warnings: string[];
};

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function dayNameFromDate(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return DAY_NAMES[(d.getDay() + 6) % 7] ?? "";
}

/** Monday-based day index from a day name (0=Mon … 6=Sun), or null. */
export function dayIndexFromName(day: string): number | null {
  const t = day.trim().toLowerCase();
  const i = DAY_NAMES.findIndex((n) => n.toLowerCase() === t || n.toLowerCase().startsWith(t.slice(0, 3)));
  return i >= 0 ? i : null;
}

/** Resolve a day name to YYYY-MM-DD within a Monday week start. */
export function dateFromWeekDay(weekStartIso: string, day: string): string | null {
  const idx = dayIndexFromName(day);
  if (idx == null) return null;
  const d = new Date(`${weekStartIso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + idx);
  return d.toISOString().slice(0, 10);
}

export function parseTimeToHm(value: string): string | null {
  const t = value.trim();
  const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min) || min > 59) return null;
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Parse DD/MM/YYYY or YYYY-MM-DD → YYYY-MM-DD */
export function parseSheetDate(value: string): string | null {
  const t = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export async function buildWeekWorkbook(rows: Omit<WeekSheetRow, "rowNum">[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UniqueCare Connect";
  const ws = wb.addWorksheet("Rota", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.addRow([...WEEK_SHEET_HEADERS]);
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCF0F9" } };
  for (const r of rows) {
    ws.addRow([r.day, r.date, r.client, r.visitType, r.callType, r.start, r.end, r.carer, r.notes]);
  }
  ws.columns = [
    { width: 12 }, { width: 12 }, { width: 22 }, { width: 16 },
    { width: 12 }, { width: 8 }, { width: 8 }, { width: 28 }, { width: 28 },
  ];
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function cellStr(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "number" && v >= 0 && v < 1) {
    // Excel time-of-day fraction
    const mins = Math.round(v * 24 * 60) % (24 * 60);
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (v instanceof Date) {
    // Time-only cells often come as Date with 1899 epoch — prefer HH:MM when date part is epoch-ish
    const y = v.getFullYear();
    if (y < 1902) {
      return `${String(v.getHours()).padStart(2, "0")}:${String(v.getMinutes()).padStart(2, "0")}`;
    }
    return `${String(v.getDate()).padStart(2, "0")}/${String(v.getMonth() + 1).padStart(2, "0")}/${v.getFullYear()}`;
  }
  if (typeof v === "object" && "text" in v && typeof (v as { text: unknown }).text === "string") {
    return (v as { text: string }).text.trim();
  }
  if (typeof v === "object" && "result" in v) return cellStr((v as { result: ExcelJS.CellValue }).result);
  return String(v).trim();
}

function sheetToAoa(ws: ExcelJS.Worksheet): unknown[][] {
  const aoa: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    const vals: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      vals[col - 1] = cellStr(cell.value);
    });
    aoa[rowNum - 1] = vals;
  });
  // Compact sparse holes
  return aoa.map((r) => r ?? []);
}

function isAppTemplateHeader(row: unknown[]): boolean {
  if (!row || row.length < WEEK_SHEET_HEADERS.length) return false;
  for (let i = 0; i < WEEK_SHEET_HEADERS.length; i++) {
    if (String(row[i] ?? "").trim().toLowerCase() !== WEEK_SHEET_HEADERS[i].toLowerCase()) return false;
  }
  return true;
}

/** Parse the app's own fill-in template. */
function parseAppTemplate(aoa: unknown[][], sheetName: string): ParsedWorkbook {
  const rows: WeekSheetRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    const vals = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => String(r[c] ?? "").trim());
    if (vals.every((x) => !x)) continue;
    rows.push({
      rowNum: i + 1,
      day: vals[0], date: vals[1], client: vals[2], visitType: vals[3],
      callType: vals[4], start: vals[5], end: vals[6], carer: vals[7], notes: vals[8],
    });
  }
  return { rows, sheetUsed: sheetName, warnings: [] };
}

const CLIENT_REQUIRED = ["service user", "team member", "start time", "end time", "day"];

interface ClientColMap {
  ref: number; day: number; area: number; serviceUser: number;
  start: number; end: number; teamMember: number; serviceCall: number;
  medication: number;
}

function clientColMap(header: unknown[]): ClientColMap | null {
  const norm = header.map((h) => String(h ?? "").trim().toLowerCase());
  const find = (name: string) => norm.indexOf(name);
  const cols: ClientColMap = {
    ref: find("ref"), day: find("day"), area: find("area"),
    serviceUser: find("service user"), start: find("start time"), end: find("end time"),
    teamMember: find("team member"), serviceCall: find("service call"), medication: find("medication"),
  };
  if (CLIENT_REQUIRED.some((name) => !norm.includes(name))) return null;
  return cols;
}

function parseClientWorkbook(sheetName: string, aoa: unknown[][]): { rows: WeekSheetRow[]; warnings: string[] } | null {
  const header = aoa[0] ?? [];
  const cols = clientColMap(header);
  if (!cols) return null;
  const warnings: string[] = [];

  interface Group { first: unknown[]; rows: unknown[][] }
  const groups = new Map<string, Group>();
  const order: string[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    if (r.every((c) => !String(c ?? "").trim())) continue;
    const ref = String(r[cols.ref] ?? "").trim();
    const key = ref || `__row${i}`;
    let g = groups.get(key);
    if (!g) { g = { first: r, rows: [] }; groups.set(key, g); order.push(key); }
    g.rows.push(r);
  }

  const rows: WeekSheetRow[] = [];
  let rowNum = 2;
  for (const key of order) {
    const g = groups.get(key)!;
    const first = g.first;
    const carers: string[] = [];
    for (const r of g.rows) {
      const name = String(r[cols.teamMember] ?? "").trim();
      if (name && !carers.includes(name)) carers.push(name);
    }
    const carer = carers.length === 0 ? "" : carers.slice(0, 2).join(" + ");
    const medication = String(first[cols.medication] ?? "").trim().toLowerCase() === "yes";
    const notes = [String(first[cols.serviceCall] ?? "").trim(), String(first[cols.area] ?? "").trim()].filter(Boolean).join(" · ");
    rows.push({
      rowNum: rowNum++,
      day: String(first[cols.day] ?? "").trim(),
      date: "", // filled from week + day during validation
      client: String(first[cols.serviceUser] ?? "").trim(),
      visitType: medication ? "medication" : "personal_care",
      callType: carers.length >= 2 ? "double" : "single",
      start: String(first[cols.start] ?? "").trim(),
      end: String(first[cols.end] ?? "").trim(),
      carer,
      notes,
    });
  }

  const emptyCarerRows = rows.filter((r) => !r.carer).length;
  if (emptyCarerRows) {
    warnings.push(`${emptyCarerRows} row${emptyCarerRows === 1 ? " has" : "s have"} no Team Member — they will need a carer assigned after import`);
  }
  return { rows, warnings };
}

/**
 * Detect workbook format and parse the right sheet.
 * 1. App template header → parseAppTemplate
 * 2. Client Weeks 1–4 header → first matching sheet
 * 3. Else throw a friendly error
 */
export async function detectAndParseWorkbook(data: Buffer | Uint8Array): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as never);

  for (const ws of wb.worksheets) {
    const aoa = sheetToAoa(ws);
    if (isAppTemplateHeader(aoa[0] ?? [])) {
      return parseAppTemplate(aoa, ws.name);
    }
  }

  const matching: { name: string; aoa: unknown[][] }[] = [];
  for (const ws of wb.worksheets) {
    const aoa = sheetToAoa(ws);
    if (clientColMap(aoa[0] ?? [])) matching.push({ name: ws.name, aoa });
  }
  if (matching.length) {
    const first = matching[0]!;
    const parsed = parseClientWorkbook(first.name, first.aoa)!;
    if (matching.length > 1) {
      const listed = matching.slice(0, 3).map((n) => `'${n.name}'`).join(", ")
        + (matching.length > 3 ? ", …" : "");
      parsed.warnings.unshift(
        `Multiple weekly sheets found (${listed}) — imported '${first.name}' only; import each week separately.`,
      );
    }
    return { rows: parsed.rows, sheetUsed: first.name, warnings: parsed.warnings };
  }

  throw new Error(
    "Unrecognised workbook — upload either the app's fill-in template "
    + "(header: Day, Date, Client, Visit type, Call type, Start, End, Carer, Notes) or a weekly sheet from the Unique Care rota "
    + "(header must include: Day, Service User, Team Member, Start Time, End Time).",
  );
}

/** @deprecated prefer detectAndParseWorkbook — kept for callers that only need the app template. */
export async function parseWeekWorkbook(data: Buffer | Uint8Array): Promise<WeekSheetRow[]> {
  const parsed = await detectAndParseWorkbook(data);
  return parsed.rows;
}

export function normaliseClientKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normaliseVisitType(raw: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "visit";
}

export function normaliseCallType(raw: string): "single" | "double" | null {
  const t = raw.trim().toLowerCase();
  if (!t || t === "single" || t === "1" || t === "one") return "single";
  if (t === "double" || t === "2" || t === "two" || t.includes("double")) return "double";
  return null;
}
