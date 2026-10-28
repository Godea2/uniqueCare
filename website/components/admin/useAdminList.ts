"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_SIZE, adminFetch, buildQuery, errorMessage } from "@/lib/admin/client";

type ListResponse<T> = {
  items: T[];
  total: number;
  hasMore: boolean;
  counts?: Record<string, number>;
};

/**
 * Paginated list loader with tab counts, search (debounced) and "show more".
 * `reload()` refetches everything currently shown without losing scroll depth.
 */
export function useAdminList<T extends { id: string | number }, X = Record<string, unknown>>(
  endpoint: string,
  opts: { status?: string; q?: string; pageSize?: number } = {},
) {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const status = opts.status ?? "all";
  const [debouncedQ, setDebouncedQ] = useState(opts.q ?? "");
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [extra, setExtra] = useState<Partial<X>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef<T[]>([]);
  const reqId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(opts.q ?? ""), 300);
    return () => clearTimeout(t);
  }, [opts.q]);

  const fetchList = useCallback(
    async (mode: "reset" | "more" | "refresh") => {
      const id = ++reqId.current;
      const offset = mode === "more" ? itemsRef.current.length : 0;
      const limit = mode === "refresh" ? Math.min(200, Math.max(itemsRef.current.length, pageSize)) : pageSize;
      if (mode === "more") setLoadingMore(true);
      else if (mode === "reset") setLoading(true);
      try {
        const query = buildQuery({ status, q: debouncedQ, limit, offset }).replace(/^\?/, "");
        const data = await adminFetch<ListResponse<T> & Partial<X>>(
          `${endpoint}${endpoint.includes("?") ? "&" : "?"}${query}`,
        );
        if (id !== reqId.current) return; // a newer request superseded this one
        const next = mode === "more" ? [...itemsRef.current, ...data.items] : data.items;
        itemsRef.current = next;
        setItems(next);
        setTotal(data.total);
        setHasMore(data.hasMore);
        if (data.counts) setCounts(data.counts);
        const { items: _i, total: _t, hasMore: _h, counts: _c, ...rest } = data;
        void _i; void _t; void _h; void _c;
        setExtra(rest as unknown as Partial<X>);
        setError(null);
      } catch (e) {
        if (id !== reqId.current) return;
        setError(errorMessage(e));
      } finally {
        if (id === reqId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [endpoint, status, debouncedQ, pageSize],
  );

  useEffect(() => {
    itemsRef.current = [];
    void fetchList("reset");
  }, [fetchList]);

  return {
    items,
    total,
    hasMore,
    counts,
    extra,
    loading,
    loadingMore,
    error,
    query: debouncedQ,
    status,
    loadMore: () => fetchList("more"),
    reload: () => fetchList("refresh"),
  };
}
