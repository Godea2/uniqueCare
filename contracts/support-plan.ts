/**
 * Person-centred support plan - mirrors how the person wants to live and be supported.
 * Field/section shapes match care-plan-assessment so the same form renderer can be used.
 */

import type {
  CarePlanAssessmentContent,
  CarePlanSectionContent,
  CarePlanSectionDef,
  VisitRow,
} from "./care-plan-assessment";
import { emptyVisitRows, VISIT_SLOTS } from "./care-plan-assessment";

export const SUPPORT_PLAN_FORMAT = "person_centred_v1" as const;
export const SUPPORT_PLAN_NAME = "Support plan - person-centred";
export const SUPPORT_PLAN_VERSION = 2;

export type SupportPlanTemplate = {
  format: typeof SUPPORT_PLAN_FORMAT;
  sections: CarePlanSectionDef[];
};

export type SupportPlanContent = CarePlanAssessmentContent;

export const SUPPORT_PLAN_SECTIONS: CarePlanSectionDef[] = [
  {
    key: "about_me",
    title: "About me",
    required: true,
    layout: "fields",
    guidance: "Who I am, what matters to me, my story and preferences.",
    fields: [
      { key: "whoIAm", label: "Who I am", type: "textarea", span: "full", required: true },
      { key: "whatMatters", label: "What matters to me", type: "textarea", span: "full", required: true },
      { key: "likesDislikes", label: "Likes and dislikes", type: "textarea", span: "full" },
      { key: "routines", label: "My routines and how I like my day", type: "textarea", span: "full" },
      { key: "communication", label: "How I communicate", type: "textarea", span: "full" },
    ],
  },
  {
    key: "outcomes",
    title: "Outcomes I want to achieve",
    required: true,
    layout: "fields",
    guidance: "What good looks like for me - goals we are working towards.",
    fields: [
      { key: "outcomes", label: "Outcomes / goals", type: "textarea", span: "full", required: true },
      { key: "howWeKnow", label: "How we will know we are succeeding", type: "textarea", span: "full" },
      { key: "myPriorities", label: "My priorities right now", type: "textarea", span: "full" },
    ],
  },
  {
    key: "how_supported",
    title: "How I want to be supported",
    required: true,
    layout: "fields",
    guidance: "The way carers should work with me - dignity, pace, language, involvement.",
    fields: [
      { key: "supportStyle", label: "How I want to be supported", type: "textarea", span: "full", required: true },
      { key: "do", label: "Please do", type: "textarea", span: "half" },
      { key: "dont", label: "Please don't", type: "textarea", span: "half" },
      { key: "involvement", label: "How I want to be involved in decisions", type: "textarea", span: "full" },
      { key: "carerNotes", label: "Notes for carers", type: "textarea", span: "full" },
    ],
  },
  {
    key: "independence_daily_living",
    title: "Independence and daily living",
    required: true,
    layout: "fields",
    guidance: "What I can do myself, where I need a prompt or a hand.",
    fields: [
      { key: "iCanDo", label: "Things I can do myself", type: "textarea", span: "full", required: true },
      { key: "iNeedHelpWith", label: "Things I need support with", type: "textarea", span: "full", required: true },
      { key: "prompts", label: "Prompts that work for me", type: "textarea", span: "full" },
      { key: "equipment", label: "Equipment / adaptations that help", type: "textarea", span: "full" },
    ],
  },
  {
    key: "health_wellbeing",
    title: "Health & wellbeing",
    required: true,
    layout: "fields",
    guidance: "Health, mood, sleep and what keeps me well (support-focused - clinical detail sits in the care plan).",
    fields: [
      { key: "feelingWell", label: "What helps me feel well", type: "textarea", span: "full", required: true },
      { key: "healthSupport", label: "Health support I want from carers", type: "textarea", span: "full" },
      { key: "mood", label: "Mood and emotional wellbeing", type: "textarea", span: "full" },
      { key: "sleep", label: "Sleep and rest", type: "textarea", span: "half" },
      { key: "escalate", label: "When to escalate / who to call", type: "textarea", span: "half" },
    ],
  },
  {
    key: "community_relationships",
    title: "Community and relationships",
    required: false,
    layout: "fields",
    guidance: "People, places and activities that matter to me.",
    fields: [
      { key: "importantPeople", label: "Important people in my life", type: "textarea", span: "full" },
      { key: "community", label: "Community, clubs and activities", type: "textarea", span: "full" },
      { key: "faithCulture", label: "Faith, culture and identity", type: "textarea", span: "full" },
      { key: "stayingConnected", label: "How I stay connected", type: "textarea", span: "full" },
    ],
  },
  {
    key: "working_not_working",
    title: "What's working / not working",
    required: true,
    layout: "fields",
    guidance: "Honest picture of what is going well and what needs to change.",
    fields: [
      { key: "working", label: "What's working", type: "textarea", span: "full", required: true },
      { key: "notWorking", label: "What's not working", type: "textarea", span: "full", required: true },
      { key: "changesWanted", label: "Changes I want", type: "textarea", span: "full" },
    ],
  },
  {
    key: "positive_risk",
    title: "Positive risk-taking",
    required: true,
    layout: "fields",
    guidance: "Risks I choose to take, and how we support me safely to do so.",
    fields: [
      { key: "choices", label: "Choices / risks I want to take", type: "textarea", span: "full", required: true },
      { key: "howSupported", label: "How we support those choices safely", type: "textarea", span: "full", required: true },
      { key: "agreedLimits", label: "Agreed limits / what we will not do", type: "textarea", span: "full" },
    ],
  },
  {
    key: "contingency",
    title: "Contingency plans",
    required: true,
    layout: "fields",
    guidance: "What happens if I am unwell, carers cannot attend, or something goes wrong.",
    fields: [
      { key: "ifUnwell", label: "If I am unwell", type: "textarea", span: "full", required: true },
      { key: "ifCarerCannotAttend", label: "If a carer cannot attend", type: "textarea", span: "full", required: true },
      { key: "emergency", label: "Emergency contacts and actions", type: "textarea", span: "full", required: true },
      { key: "outOfHours", label: "Out-of-hours arrangement", type: "textarea", span: "full" },
    ],
  },
  {
    key: "support_visits",
    title: "Support visits",
    required: true,
    layout: "visits",
    guidance: "When support visits happen and what each visit is for (morning / lunch / tea / bed / other).",
  },
  {
    key: "review",
    title: "Review",
    required: true,
    layout: "fields",
    guidance: "How and when we review this support plan with me.",
    fields: [
      { key: "reviewDate", label: "Next review date", type: "date", span: "half", required: true },
      { key: "reviewWith", label: "Who is involved in the review", type: "text", span: "half" },
      { key: "howReviewed", label: "How we will review (meeting, call, visit)", type: "textarea", span: "full" },
      { key: "reviewNotes", label: "Review notes / agreements", type: "textarea", span: "full" },
    ],
  },
];

export const SUPPORT_PLAN_TEMPLATE: SupportPlanTemplate = {
  format: SUPPORT_PLAN_FORMAT,
  sections: SUPPORT_PLAN_SECTIONS,
};

export function isSupportPlanTemplate(structure: unknown): structure is SupportPlanTemplate {
  return (
    !!structure &&
    typeof structure === "object" &&
    !Array.isArray(structure) &&
    (structure as SupportPlanTemplate).format === SUPPORT_PLAN_FORMAT &&
    Array.isArray((structure as SupportPlanTemplate).sections)
  );
}

export function emptySupportPlanContent(): SupportPlanContent {
  const content: SupportPlanContent = {};
  for (const sec of SUPPORT_PLAN_SECTIONS) {
    if (sec.layout === "visits") {
      content[sec.key] = { visits: emptyVisitRows() };
    } else if (sec.layout === "assistance") {
      content[sec.key] = { domains: [] };
    } else {
      const row: CarePlanSectionContent = {};
      for (const f of sec.fields ?? []) row[f.key] = "";
      content[sec.key] = row;
    }
  }
  return content;
}

export function supportPlanHasInfoNeeded(content: SupportPlanContent): boolean {
  const walk = (v: unknown): boolean => {
    if (typeof v === "string") return v.includes("⚠ Information needed");
    if (Array.isArray(v)) return v.some(walk);
    if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).some(walk);
    return false;
  };
  return walk(content);
}

export function flattenSupportSectionForAi(sectionKey: string, sectionContent: CarePlanSectionContent): string {
  const sec = SUPPORT_PLAN_SECTIONS.find((s) => s.key === sectionKey);
  if (!sec) return JSON.stringify(sectionContent, null, 2);
  if (sec.layout === "visits") {
    const visits = (sectionContent.visits as VisitRow[] | undefined) ?? [];
    return visits
      .map((v) => {
        const label = VISIT_SLOTS.find((s) => s.value === v.slot)?.label ?? v.slot;
        return `${label}: days=${v.days || "-"} ${v.startTime || "?"}-${v.endTime || "?"} (${v.durationMinutes || "?"} min)\nTasks: ${v.tasks || "-"}\nSupport focus: ${v.careNeeds || "-"}`;
      })
      .join("\n\n");
  }
  return (sec.fields ?? [])
    .map((f) => `${f.label}: ${String(sectionContent[f.key] ?? "") || "-"}`)
    .join("\n");
}
