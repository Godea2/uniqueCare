/**
 * AI transparency — which sections were AI-drafted, by whom, and when.
 * Inspectors can see drafts are always subject to human approval.
 */

export type AiSectionProvenance = {
  generatedAt: string; // ISO
  model: string | null;
  actorName: string;
  source: "generate" | "regenerate" | "review_generate";
};

export type AiProvenance = {
  /** Whole-document generation timestamp (latest full generate) */
  lastGeneratedAt: string | null;
  lastModel: string | null;
  lastActorName: string | null;
  /** Per-section AI draft markers */
  sections: Record<string, AiSectionProvenance>;
};

export function emptyAiProvenance(): AiProvenance {
  return { lastGeneratedAt: null, lastModel: null, lastActorName: null, sections: {} };
}

export function mergeAiProvenance(
  existing: unknown,
  opts: {
    sectionKeys: string[];
    actorName: string;
    model: string | null;
    source: AiSectionProvenance["source"];
    at?: Date;
  },
): AiProvenance {
  const base = (existing && typeof existing === "object"
    ? { ...emptyAiProvenance(), ...(existing as AiProvenance), sections: { ...((existing as AiProvenance).sections ?? {}) } }
    : emptyAiProvenance());
  const at = (opts.at ?? new Date()).toISOString();
  base.lastGeneratedAt = at;
  base.lastModel = opts.model;
  base.lastActorName = opts.actorName;
  for (const key of opts.sectionKeys) {
    base.sections[key] = {
      generatedAt: at,
      model: opts.model,
      actorName: opts.actorName,
      source: opts.source,
    };
  }
  return base;
}

export function sectionIsAiDrafted(provenance: unknown, sectionKey: string): boolean {
  const p = provenance as AiProvenance | null | undefined;
  return !!p?.sections?.[sectionKey]?.generatedAt;
}
