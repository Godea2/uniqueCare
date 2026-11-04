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

export async function getSection(
  pageKey: string,
  sectionKey: string,
): Promise<Record<string, unknown> | null> {
  const all = await getPageSections(pageKey);
  return all.find((s) => s.sectionKey === sectionKey)?.content ?? null;
}
