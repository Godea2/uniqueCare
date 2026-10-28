import { AdminDbError } from "./db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_RE = /^\d{1,18}$/;

function bad(message: string, status = 400): never {
  throw new AdminDbError(message, status);
}

/** Validates a uuid path param (prevents PostgREST filter injection). */
export function uuidParam(id: string): string {
  if (!UUID_RE.test(id)) bad("Invalid id");
  return id.toLowerCase();
}

/** Validates a bigint path param. */
export function intParam(id: string): string {
  if (!INT_RE.test(id)) bad("Invalid id");
  return id;
}

export type ListParams = {
  limit: number;
  offset: number;
  status: string;
  q: string;
};

/** Reads ?limit= &offset= &status= &q= from a request URL with sane bounds. */
export function listParams(req: Request, defaultLimit = 20): ListParams {
  const u = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(u.searchParams.get("limit")) || defaultLimit));
  const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
  const status = (u.searchParams.get("status") ?? "all").trim().toLowerCase();
  const q = sanitizeSearch(u.searchParams.get("q") ?? "");
  return { limit, offset, status, q };
}

/** Strip characters that have meaning inside a PostgREST `or=(...)` expression. */
export function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Builds a PostgREST `or` filter value that ILIKE-matches q across columns. */
export function orSearch(columns: string[], q: string): string | null {
  if (!q) return null;
  return `(${columns.map((c) => `${c}.ilike.*${q}*`).join(",")})`;
}

/** Reads and parses a JSON body, throwing a 400 on malformed input. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return bad("Invalid JSON body");
  }
}
