/**
 * Service-role PostgREST helpers for website admin.
 * Never import this into client components.
 */

const base = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_URL ?? "";
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function adminDbConfigured(): boolean {
  return Boolean(base() && serviceKey());
}

export class AdminDbError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

type QueryOpts = {
  select?: string;
  order?: string;
  limit?: number;
  offset?: number;
  filters?: Record<string, string>;
  single?: boolean;
};

function qs(opts: QueryOpts = {}): string {
  const p = new URLSearchParams();
  p.set("select", opts.select ?? "*");
  if (opts.order) p.set("order", opts.order);
  if (opts.limit != null) p.set("limit", String(opts.limit));
  if (opts.offset != null) p.set("offset", String(opts.offset));
  for (const [k, v] of Object.entries(opts.filters ?? {})) p.set(k, v);
  return p.toString();
}

async function rest(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  if (!adminDbConfigured()) throw new AdminDbError("Admin database is not configured (need SUPABASE_SERVICE_ROLE_KEY).", 503);
  const res = await fetch(`${base()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey(),
      Authorization: `Bearer ${serviceKey()}`,
      "Content-Type": "application/json",
      Prefer: init.headers?.Prefer ?? "return=representation",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  return res;
}

export async function adminSelect<T>(table: string, opts: QueryOpts = {}): Promise<T[]> {
  const res = await rest(`${table}?${qs(opts)}`);
  if (!res.ok) throw new AdminDbError(`Select ${table} failed: ${await res.text()}`, res.status);
  return (await res.json()) as T[];
}

export async function adminSelectOne<T>(table: string, opts: QueryOpts = {}): Promise<T | null> {
  const rows = await adminSelect<T>(table, { ...opts, limit: 1 });
  return rows[0] ?? null;
}

export async function adminCount(table: string, filters: Record<string, string> = {}): Promise<number> {
  const p = new URLSearchParams();
  p.set("select", "id");
  for (const [k, v] of Object.entries(filters)) p.set(k, v);
  const res = await rest(`${table}?${p.toString()}`, {
    method: "GET",
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  const range = res.headers.get("content-range") ?? "";
  const m = range.match(/\/(\d+)/);
  if (m) return Number(m[1]);
  const rows = await adminSelect<{ id: string | number }>(table, { select: "id", filters });
  return rows.length;
}

export async function adminInsert<T extends Record<string, unknown>>(table: string, row: T | T[]): Promise<T[]> {
  const res = await rest(table, {
    method: "POST",
    body: JSON.stringify(row),
    headers: { Prefer: "return=representation" },
  });
  if (!res.ok) throw new AdminDbError(`Insert ${table} failed: ${await res.text()}`, res.status);
  return (await res.json()) as T[];
}

export async function adminUpdate<T>(
  table: string,
  filter: string,
  patch: Record<string, unknown>,
): Promise<T[]> {
  const res = await rest(`${table}?${filter}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    headers: { Prefer: "return=representation" },
  });
  if (!res.ok) throw new AdminDbError(`Update ${table} failed: ${await res.text()}`, res.status);
  return (await res.json()) as T[];
}

export async function adminDelete(table: string, filter: string): Promise<void> {
  const res = await rest(`${table}?${filter}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  if (!res.ok) throw new AdminDbError(`Delete ${table} failed: ${await res.text()}`, res.status);
}
