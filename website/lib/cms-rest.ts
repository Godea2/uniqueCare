/**
 * Tiny helper for anon, read-only PostgREST fetches against the website CMS tables.
 * Returns `null` when Supabase isn't configured, the request fails, or the
 * response isn't an array — callers then use their static fallback.
 */
const base = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_URL ?? "";
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_ANON_KEY ?? "";

export function cmsConfigured(): boolean {
  return Boolean(base() && anonKey());
}

export async function cmsRows<T>(
  table: string,
  query: string,
  tags: string[],
  label: string,
): Promise<T[] | null> {
  if (!cmsConfigured()) return null;
  try {
    const res = await fetch(`${base()}/rest/v1/${table}?${query}`, {
      headers: { apikey: anonKey(), Authorization: `Bearer ${anonKey()}` },
      next: { revalidate: 60, tags: ["website-cms", ...tags] },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown;
    return Array.isArray(rows) ? (rows as T[]) : null;
  } catch (e) {
    console.warn(`[${label}] CMS fetch failed:`, e instanceof Error ? e.message : e);
    return null;
  }
}

export function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
