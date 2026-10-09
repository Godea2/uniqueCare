import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { COLUMN_MAP, INT_COLUMNS, TABLE_SQL, type TableKey } from "@db/columns";
import { env } from "./lib/env";

export class DbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DbError";
  }
}

type Cmp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like";

type Filter =
  | { op: Cmp; field: string; value: unknown }
  | { op: "isNull" | "notNull"; field: string }
  | { op: "in" | "notIn"; field: string; value: unknown[] }
  | { op: "or"; parts: { op: Cmp; field: string; value: unknown }[] };

let client: SupabaseClient | null = null;

function supabase(): SupabaseClient {
  if (!client) {
    if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
      throw new DbError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    }
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

function column(table: TableKey, field: string): string {
  const mapped = COLUMN_MAP[table][field];
  if (!mapped) throw new DbError(`Unknown column ${table}.${field}`);
  return mapped;
}

function prep(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function toDb(table: TableKey, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue;
    out[column(table, key)] = prep(value);
  }
  return out;
}

function fromDb<T>(table: TableKey, row: Record<string, unknown>): T {
  const inverse: Record<string, string> = {};
  for (const [js, sql] of Object.entries(COLUMN_MAP[table])) inverse[sql] = js;
  const ints = new Set(INT_COLUMNS[table]);
  const out: Record<string, unknown> = {};
  for (const [sql, value] of Object.entries(row)) {
    const js = inverse[sql] ?? sql;
    if (typeof value === "string" && ints.has(js) && /^-?\d+$/.test(value)) {
      const n = Number(value);
      out[js] = Number.isSafeInteger(n) ? n : value;
    } else {
      out[js] = value;
    }
  }
  return out as T;
}

function orLiteral(value: unknown): string {
  const prepared = prep(value);
  if (typeof prepared === "number" || typeof prepared === "boolean") return String(prepared);
  const text = prepared == null ? "" : String(prepared);
  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function inLiteral(value: unknown): string {
  const prepared = prep(value);
  if (typeof prepared === "number") return String(prepared);
  return `"${String(prepared).replaceAll('"', '\\"')}"`;
}

function apply(query: any, table: TableKey, filters: Filter[]) {
  for (const filter of filters) {
    if (filter.op === "or") {
      const parts = filter.parts.map((part) => {
        const op = part.op === "like" ? "ilike" : part.op;
        return `${column(table, part.field)}.${op}.${orLiteral(part.value)}`;
      });
      query = query.or(parts.join(","));
      continue;
    }
    const name = column(table, filter.field);
    if (filter.op === "eq") query = query.eq(name, prep(filter.value));
    else if (filter.op === "neq") query = query.neq(name, prep(filter.value));
    else if (filter.op === "gt") query = query.gt(name, prep(filter.value));
    else if (filter.op === "gte") query = query.gte(name, prep(filter.value));
    else if (filter.op === "lt") query = query.lt(name, prep(filter.value));
    else if (filter.op === "lte") query = query.lte(name, prep(filter.value));
    else if (filter.op === "like") query = query.ilike(name, String(prep(filter.value)));
    else if (filter.op === "isNull") query = query.is(name, null);
    else if (filter.op === "notNull") query = query.not(name, "is", null);
    else if (filter.op === "in") query = query.in(name, filter.value.map(prep));
    else if (filter.op === "notIn") {
      query = query.not(name, "in", `(${filter.value.map(inLiteral).join(",")})`);
    }
  }
  return query;
}

export class Query {
  private filters: Filter[] = [];
  private orders: { field: string; dir: "asc" | "desc" }[] = [];
  private lim?: number;
  private table: TableKey;

  constructor(table: TableKey) {
    this.table = table;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ op: "eq", field, value });
    return this;
  }
  neq(field: string, value: unknown) {
    this.filters.push({ op: "neq", field, value });
    return this;
  }
  gt(field: string, value: unknown) {
    this.filters.push({ op: "gt", field, value });
    return this;
  }
  gte(field: string, value: unknown) {
    this.filters.push({ op: "gte", field, value });
    return this;
  }
  lt(field: string, value: unknown) {
    this.filters.push({ op: "lt", field, value });
    return this;
  }
  lte(field: string, value: unknown) {
    this.filters.push({ op: "lte", field, value });
    return this;
  }
  /** Case-insensitive match. Pass a SQL LIKE pattern, including % wildcards. */
  like(field: string, pattern: string) {
    this.filters.push({ op: "like", field, value: pattern });
    return this;
  }
  isNull(field: string) {
    this.filters.push({ op: "isNull", field });
    return this;
  }
  notNull(field: string) {
    this.filters.push({ op: "notNull", field });
    return this;
  }
  in(field: string, values: unknown[]) {
    this.filters.push({ op: "in", field, value: values });
    return this;
  }
  notIn(field: string, values: unknown[]) {
    this.filters.push({ op: "notIn", field, value: values });
    return this;
  }
  /** OR group, combined with the other filters using AND. */
  or(parts: { op: Cmp; field: string; value: unknown }[]) {
    this.filters.push({ op: "or", parts });
    return this;
  }
  order(field: string, dir: "asc" | "desc" = "asc") {
    this.orders.push({ field, dir });
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }

  private emptyIn() {
    return this.filters.some((f) => (f.op === "in" || f.op === "notIn") && f.value.length === 0);
  }

  private guarded() {
    if (this.filters.length === 0) {
      throw new DbError(`Refusing unfiltered write on ${this.table}`);
    }
  }

  async many<T = Record<string, unknown>>(): Promise<T[]> {
    if (this.emptyIn()) return [];
    let query = supabase().from(TABLE_SQL[this.table]).select("*");
    query = apply(query, this.table, this.filters);
    for (const order of this.orders) {
      query = query.order(column(this.table, order.field), { ascending: order.dir === "asc" });
    }
    if (this.lim != null) query = query.limit(this.lim);
    const { data, error } = await query;
    if (error) throw new DbError(`${this.table}: ${error.message}`);
    return (data ?? []).map((row) => fromDb<T>(this.table, row as Record<string, unknown>));
  }

  async first<T = Record<string, unknown>>(): Promise<T | undefined> {
    const rows = await this.limit(this.lim ?? 1).many<T>();
    return rows[0];
  }

  async count(): Promise<number> {
    if (this.emptyIn()) return 0;
    let query = supabase().from(TABLE_SQL[this.table]).select("*", { count: "exact", head: true });
    query = apply(query, this.table, this.filters);
    const { count, error } = await query;
    if (error) throw new DbError(`${this.table}: ${error.message}`);
    return count ?? 0;
  }

  async insert<T = Record<string, unknown>>(values: object | object[]): Promise<T[]> {
    const rows = (Array.isArray(values) ? values : [values]) as Record<string, unknown>[];
    if (rows.length === 0) return [];
    const { data, error } = await supabase()
      .from(TABLE_SQL[this.table])
      .insert(rows.map((row) => toDb(this.table, row)))
      .select("*");
    if (error) throw new DbError(`${this.table}: ${error.message}`);
    return (data ?? []).map((row) => fromDb<T>(this.table, row as Record<string, unknown>));
  }

  async update(values: object): Promise<void> {
    this.guarded();
    let query = supabase().from(TABLE_SQL[this.table]).update(toDb(this.table, values as Record<string, unknown>));
    query = apply(query, this.table, this.filters);
    const { error } = await query;
    if (error) throw new DbError(`${this.table}: ${error.message}`);
  }

  async delete(): Promise<void> {
    this.guarded();
    let query = supabase().from(TABLE_SQL[this.table]).delete();
    query = apply(query, this.table, this.filters);
    const { error } = await query;
    if (error) throw new DbError(`${this.table}: ${error.message}`);
  }

  async upsert<T = Record<string, unknown>>(values: object, onConflict: string): Promise<T> {
    const { data, error } = await supabase()
      .from(TABLE_SQL[this.table])
      .upsert(toDb(this.table, values as Record<string, unknown>), { onConflict: column(this.table, onConflict) })
      .select("*");
    if (error) throw new DbError(`${this.table}: ${error.message}`);
    const row = (data ?? [])[0];
    if (!row) throw new DbError(`${this.table}: upsert returned no row`);
    return fromDb<T>(this.table, row as Record<string, unknown>);
  }
}

export const db = {
  from(table: TableKey) {
    return new Query(table);
  },
};
