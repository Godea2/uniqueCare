import { adminCount, adminSelect } from "./db";
import { listParams, orSearch } from "./params";

type ListOpts = {
  table: string;
  req: Request;
  /** Valid values for the status column (used for tab counts + filtering). */
  statuses: readonly string[];
  /** Columns searched by ?q= */
  searchColumns?: string[];
  order?: string;
  defaultLimit?: number;
  /** Extra static filters always applied. */
  baseFilters?: Record<string, string>;
};

export type ListResult<Row> = {
  rows: Row[];
  total: number;
  hasMore: boolean;
  counts: Record<string, number>;
  limit: number;
  offset: number;
};

/** Paginated select with per-status tab counts. */
export async function listWithCounts<Row>(o: ListOpts): Promise<ListResult<Row>> {
  const { limit, offset, status, q } = listParams(o.req, o.defaultLimit ?? 20);
  const filters: Record<string, string> = { ...(o.baseFilters ?? {}) };
  if (status !== "all" && o.statuses.includes(status)) filters.status = `eq.${status}`;
  const or = orSearch(o.searchColumns ?? [], q);
  if (or) filters.or = or;

  // Counts ignore the status filter (so tabs always show totals) but honour search.
  const countBase: Record<string, string> = { ...(o.baseFilters ?? {}) };
  if (or) countBase.or = or;

  const [rows, total, all, ...perStatus] = await Promise.all([
    adminSelect<Row>(o.table, { order: o.order ?? "created_at.desc", limit, offset, filters }),
    adminCount(o.table, filters),
    adminCount(o.table, countBase),
    ...o.statuses.map((s) => adminCount(o.table, { ...countBase, status: `eq.${s}` })),
  ]);

  const counts: Record<string, number> = { all };
  o.statuses.forEach((s, i) => {
    counts[s] = perStatus[i] ?? 0;
  });

  return { rows, total, hasMore: offset + rows.length < total, counts, limit, offset };
}

/** Rows for CSV export (capped) honouring ?status= and ?q=. */
export async function exportRows<Row>(o: Omit<ListOpts, "defaultLimit">): Promise<Row[]> {
  const { status, q } = listParams(o.req, 5000);
  const filters: Record<string, string> = { ...(o.baseFilters ?? {}) };
  if (status !== "all" && o.statuses.includes(status)) filters.status = `eq.${status}`;
  const or = orSearch(o.searchColumns ?? [], q);
  if (or) filters.or = or;
  return adminSelect<Row>(o.table, { order: o.order ?? "created_at.desc", limit: 5000, filters });
}
