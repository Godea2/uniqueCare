import { NextResponse } from "next/server";
import { requireAdminSession } from "./auth";
import { AdminDbError } from "./db";

export async function withAdmin<T>(
  handler: () => Promise<T>,
): Promise<NextResponse> {
  try {
    await requireAdminSession();
    const data = await handler();
    return NextResponse.json(data);
  } catch (e) {
    const status = (e as { status?: number }).status
      ?? (e instanceof AdminDbError ? e.status : 500);
    const message = e instanceof Error ? e.message : "Request failed";
    if (status === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[admin api]", message);
    return NextResponse.json({ error: message }, { status: status >= 400 ? status : 500 });
  }
}

export function csvResponse(filename: string, rows: string[][]): NextResponse {
  const escape = (c: string) => {
    if (/[",\n]/.test(c)) return `"${c.replace(/"/g, '""')}"`;
    return c;
  };
  const body = rows.map((r) => r.map((c) => escape(String(c ?? ""))).join(",")).join("\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export function humaniseJobSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
