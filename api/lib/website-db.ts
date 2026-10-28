import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Thin service-role helpers for the marketing website's raw snake_case tables.
 * These tables are NOT part of the portal's db.ts mapper (columns.ts) on purpose.
 * Server only — never expose to the browser.
 */

export const WEBSITE_TABLES = [
  "website_enquiries",
  "website_reviews",
  "website_applications",
  "website_subscribers",
  "website_newsletters",
  "website_posts",
  "website_audit_log",
  "website_backlinks",
] as const;

export type WebsiteTable = (typeof WEBSITE_TABLES)[number];

export class WebsiteDbError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "WebsiteDbError";
    this.code = code;
  }
}

type Scalar = string | number | boolean | null;

export type WebsiteFilter = {
  eq?: Record<string, Scalar>;
  neq?: Record<string, Scalar>;
  gt?: Record<string, string | number>;
  /** Case-insensitive contains-search across these columns. */
  search?: { columns: string[]; q: string };
};

export type WebsiteSelectOpts = WebsiteFilter & {
  columns?: string;
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
};

let client: SupabaseClient | null = null;

function supabase(): SupabaseClient {
  if (!client) {
    if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
      throw new WebsiteDbError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    }
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Strip characters that would break out of a PostgREST `or=` expression. */
function searchTerm(q: string): string {
  return q.replace(/[,()"\\%*_]/g, " ").replace(/\s+/g, " ").trim();
}

function applyFilter(query: any, f: WebsiteFilter) {
  for (const [col, v] of Object.entries(f.eq ?? {})) query = v === null ? query.is(col, null) : query.eq(col, v);
  for (const [col, v] of Object.entries(f.neq ?? {})) query = v === null ? query.not(col, "is", null) : query.neq(col, v);
  for (const [col, v] of Object.entries(f.gt ?? {})) query = query.gt(col, v);
  if (f.search) {
    const term = searchTerm(f.search.q);
    if (term && f.search.columns.length) {
      query = query.or(f.search.columns.map((c) => `${c}.ilike.%${term}%`).join(","));
    }
  }
  return query;
}

function fail(action: string, table: string, error: { message: string; code?: string }): never {
  throw new WebsiteDbError(`${action} ${table} failed: ${error.message}`, error.code);
}

export async function websiteSelect<T = Record<string, unknown>>(
  table: WebsiteTable, opts: WebsiteSelectOpts = {},
): Promise<T[]> {
  let query: any = supabase().from(table).select(opts.columns ?? "*");
  query = applyFilter(query, opts);
  if (opts.order) query = query.order(opts.order.column, { ascending: opts.order.ascending ?? false });
  if (opts.limit != null) {
    const from = opts.offset ?? 0;
    query = query.range(from, from + opts.limit - 1);
  }
  const { data, error } = await query;
  if (error) fail("Select", table, error);
  return (data ?? []) as T[];
}

export async function websiteSelectOne<T = Record<string, unknown>>(
  table: WebsiteTable, opts: WebsiteSelectOpts = {},
): Promise<T | null> {
  const rows = await websiteSelect<T>(table, { ...opts, limit: 1 });
  return rows[0] ?? null;
}

export async function websiteCount(table: WebsiteTable, filter: WebsiteFilter = {}): Promise<number> {
  let query: any = supabase().from(table).select("id", { count: "exact", head: true });
  query = applyFilter(query, filter);
  const { count, error } = await query;
  if (error) fail("Count", table, error);
  return count ?? 0;
}

export async function websiteInsert<T = Record<string, unknown>>(
  table: WebsiteTable, row: Record<string, unknown> | Record<string, unknown>[],
): Promise<T[]> {
  const { data, error } = await supabase().from(table).insert(row as never).select();
  if (error) fail("Insert", table, error);
  return (data ?? []) as T[];
}

/** Update rows matching `filter`; returns the updated rows (empty when nothing matched). */
export async function websiteUpdate<T = Record<string, unknown>>(
  table: WebsiteTable, filter: WebsiteFilter, patch: Record<string, unknown>,
): Promise<T[]> {
  let query: any = supabase().from(table).update(patch as never);
  query = applyFilter(query, filter);
  const { data, error } = await query.select();
  if (error) fail("Update", table, error);
  return (data ?? []) as T[];
}

export async function websiteDelete(table: WebsiteTable, filter: WebsiteFilter): Promise<void> {
  let query: any = supabase().from(table).delete();
  query = applyFilter(query, filter);
  const { error } = await query;
  if (error) fail("Delete", table, error);
}
