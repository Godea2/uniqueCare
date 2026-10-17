/**
 * Weekly rota Excel template — one row per visit.
 * Columns match coordinator download/upload: Day, Date, Client, Visit type,
 * Call type, Start, End, Carer, Notes.
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

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function dayNameFromDate(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return DAY_NAMES[(d.getDay() + 6) % 7] ?? "";
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
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (v instanceof Date) {
    return `${String(v.getDate()).padStart(2, "0")}/${String(v.getMonth() + 1).padStart(2, "0")}/${v.getFullYear()}`;
  }
  if (typeof v === "object" && "text" in v && typeof (v as { text: unknown }).text === "string") {
    return (v as { text: string }).text.trim();
  }
  if (typeof v === "object" && "result" in v) return cellStr((v as { result: ExcelJS.CellValue }).result);
  return String(v).trim();
}

export async function parseWeekWorkbook(data: Buffer | Uint8Array): Promise<WeekSheetRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as never);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: WeekSheetRow[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => cellStr(row.getCell(c).value));
    if (vals.every((x) => !x)) return;
    out.push({
      rowNum,
      day: vals[0],
      date: vals[1],
      client: vals[2],
      visitType: vals[3],
      callType: vals[4],
      start: vals[5],
      end: vals[6],
      carer: vals[7],
      notes: vals[8],
    });
  });
  return out;
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
