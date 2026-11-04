const base = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_URL ?? "";
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_ANON_KEY ?? "";

export type PageSection = {
  pageKey: string;
  sectionKey: string;
  label: string;
  content: Record<string, unknown>;
};

type DbSection = {
  page_key: string;
  section_key: string;
  label: string;
  content: unknown;
};

/** Published CMS sections for a page. Empty array if none / unreachable (caller keeps static fallback). */
export async function getPageSections(pageKey: string): Promise<PageSection[]> {
  if (!base() || !anonKey()) return [];
  try {
    const res = await fetch(
      `${base()}/rest/v1/website_page_sections?page_key=eq.${encodeURIComponent(pageKey)}&status=eq.published&select=page_key,section_key,label,content&order=sort_order.asc&limit=50`,
      {
        headers: { apikey: anonKey(), Authorization: `Bearer ${anonKey()}` },
        next: { revalidate: 60, tags: ["website-cms", `website-sections-${pageKey}`] },
      },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as DbSection[];
    return rows.map((r) => ({
      pageKey: r.page_key,
      sectionKey: r.section_key,
      label: r.label,
      content: r.content && typeof r.content === "object" ? (r.content as Record<string, unknown>) : {},
    }));
  } catch (e) {
    console.warn("[sections] CMS fetch failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Content object for one published section, or null if absent (caller keeps its static fallback). */
export async function getSection(
  pageKey: string,
  sectionKey: string,
): Promise<Record<string, unknown> | null> {
  const all = await getPageSections(pageKey);
  return all.find((s) => s.sectionKey === sectionKey)?.content ?? null;
}

/** All published sections for a page keyed by `section_key` (one fetch). */
export async function getSectionMap(pageKey: string): Promise<Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const s of await getPageSections(pageKey)) out[s.sectionKey] = s.content;
  return out;
}

// ── Tolerant readers for CMS JSON (never throw; return the fallback instead) ──
type Content = Record<string, unknown> | null | undefined;

export type SectionCta = { label: string; href: string };

/** Non-empty string field or fallback. */
export function asString(c: Content, key: string, fallback: string): string {
  const v = c?.[key];
  return typeof v === "string" && v.trim() ? v : fallback;
}

/** Array of plain objects from a field (non-object entries dropped). Empty if missing. */
export function asItems(c: Content, key = "items"): Record<string, unknown>[] {
  const v = c?.[key];
  return Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
    : [];
}

/** Array of non-empty strings from a field. Empty if missing. */
export function asStrings(c: Content, key: string): string[] {
  const v = c?.[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

/** `{label, href}` CTA from a field, or `fallback` (may be null for "no CTA"). */
export function asCta<F extends SectionCta | null>(c: Content, key: string, fallback: F): SectionCta | F {
  const v = c?.[key];
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const r = v as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim() : "";
    const href = typeof r.href === "string" ? r.href.trim() : "";
    if (label && href) return { label, href };
  }
  return fallback;
}
