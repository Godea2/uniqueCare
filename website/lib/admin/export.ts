import { NextResponse } from "next/server";
import { requireAdminSession } from "./auth";
import { AdminDbError } from "./db";
import { csvResponse } from "./http";
import { csvSafe } from "./mappers";

/** Auth-guarded CSV download. `build` returns [header, ...rows]. */
export async function adminCsv(
  filename: string,
  build: () => Promise<string[][]>,
): Promise<NextResponse> {
  try {
    await requireAdminSession();
    const rows = await build();
    const date = new Date().toISOString().slice(0, 10);
    return csvResponse(
      `${filename}-${date}.csv`,
      rows.map((r, i) => (i === 0 ? r : r.map((c) => csvSafe(c)))),
    );
  } catch (e) {
    const status = (e as { status?: number }).status ?? (e instanceof AdminDbError ? e.status : 500);
    if (status === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Export failed" },
      { status: status >= 400 ? status : 500 },
    );
  }
}
