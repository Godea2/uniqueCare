/**
 * Care plan review form — mirrors the paper review form template.
 */

export const REVIEW_TRIGGERS = [
  { value: "annual", label: "Annual review" },
  { value: "change_in_needs", label: "Change in needs" },
  { value: "hospital_discharge", label: "Hospital discharge" },
  { value: "incident", label: "Incident" },
  { value: "request", label: "Request (client / family / professional)" },
] as const;

export type ReviewTrigger = (typeof REVIEW_TRIGGERS)[number]["value"];

/** 21-area section-change checklist from the paper review form. */
export const REVIEW_CHECKLIST_AREAS = [
  { key: "about_me", label: "About Me" },
  { key: "accommodation_safety", label: "Accommodation Safety" },
  { key: "activities", label: "Activities" },
  { key: "allergies", label: "Allergies" },
  { key: "continence", label: "Continence" },
  { key: "cleansing_dressing", label: "Cleansing & Dressing" },
  { key: "cognitive", label: "Cognitive" },
  { key: "communication", label: "Communication" },
  { key: "eating_drinking", label: "Eating & Drinking" },
  { key: "family_friends", label: "Family & Friends" },
  { key: "fire_utility_safety", label: "Fire & Utility Safety" },
  { key: "infection_prevention", label: "Infection Prevention & Control" },
  { key: "lone_working", label: "Lone Working" },
  { key: "medication", label: "Medication" },
  { key: "mental_health_wellbeing", label: "Mental Health & Wellbeing" },
  { key: "mobility", label: "Mobility" },
  { key: "resuscitation_eol", label: "Resuscitation / End of Life" },
  { key: "sepsis", label: "Sepsis" },
  { key: "sensory", label: "Sensory" },
  { key: "skin_integrity", label: "Skin Integrity" },
  { key: "transfers", label: "Transfers" },
  { key: "other", label: "Other" },
] as const;

export type ChecklistChange = "no_change" | "changed" | "not_applicable";

export const CHECKLIST_CHANGE_OPTIONS: { value: ChecklistChange; label: string }[] = [
  { value: "no_change", label: "No change" },
  { value: "changed", label: "Changed" },
  { value: "not_applicable", label: "N/A" },
];

export type ReviewFieldType = "text" | "textarea" | "date" | "select" | "yes_no";

export type ReviewFieldDef = {
  key: string;
  label: string;
  type: ReviewFieldType;
  options?: { value: string; label: string }[];
  required?: boolean;
  help?: string;
  span?: "half" | "full";
};

export type ReviewSectionLayout = "fields" | "checklist";

export type ReviewSectionDef = {
  key: string;
  title: string;
  guidance?: string;
  required?: boolean;
  layout: ReviewSectionLayout;
  fields?: ReviewFieldDef[];
};

const yesNo = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Unknown / not assessed" },
];

const reviewMethod = [
  { value: "face_to_face", label: "Face to face" },
  { value: "virtually", label: "Virtually" },
  { value: "telephone", label: "Telephone" },
];

export const CARE_PLAN_REVIEW_SECTIONS: ReviewSectionDef[] = [
  {
    key: "consent_mental_capacity",
    title: "Consent & mental capacity",
    required: true,
    layout: "fields",
    guidance: "MCA, verbal consent, sharing consent, DoLS, LPA/IMCA, resuscitation wishes and DNACPR location.",
    fields: [
      { key: "hasCapacity", label: "Mental capacity for this review (MCA)", type: "select", options: yesNo, span: "half", required: true },
      { key: "verbalConsent", label: "Verbal consent to review obtained?", type: "select", options: yesNo, span: "half", required: true },
      { key: "sharingConsent", label: "Consent to share review outcomes with care team / GP?", type: "select", options: yesNo, span: "half", required: true },
      { key: "dols", label: "DoLS in place?", type: "select", options: yesNo, span: "half" },
      { key: "lpaImca", label: "LPA / IMCA involved", type: "textarea", span: "full", help: "Name, role, how involved" },
      { key: "resuscitationWishes", label: "Resuscitation wishes", type: "textarea", span: "full", required: true },
      { key: "dnacprLocation", label: "DNACPR form location", type: "text", span: "full" },
      { key: "capacityNotes", label: "Capacity / consent notes", type: "textarea", span: "full" },
    ],
  },
  {
    key: "attendees_method",
    title: "Attendees & review method",
    required: true,
    layout: "fields",
    guidance: "Who attended and how the review was held (face to face / virtually / telephone).",
    fields: [
      { key: "reviewMethod", label: "Review method", type: "select", options: reviewMethod, span: "half", required: true },
      { key: "reviewDate", label: "Review date", type: "date", span: "half", required: true },
      { key: "attendees", label: "Attendees", type: "textarea", span: "full", required: true, help: "Client, family, staff, professionals" },
      { key: "locationOrPlatform", label: "Location / platform", type: "text", span: "full" },
    ],
  },
  {
    key: "incidents_events",
    title: "Incidents & events since last review",
    required: true,
    layout: "fields",
    guidance: "Hospital stays, falls, safeguarding, medication changes, family concerns — cross-check change events on file.",
    fields: [
      { key: "eventsSummary", label: "Incidents & events summary", type: "textarea", span: "full", required: true },
      { key: "impactOnCare", label: "Impact on care needs", type: "textarea", span: "full" },
    ],
  },
  {
    key: "effectiveness",
    title: "Effectiveness of service provision",
    required: true,
    layout: "fields",
    guidance: "Is the package meeting outcomes? Continuity, punctuality, quality of care.",
    fields: [
      { key: "meetingOutcomes", label: "Is the service meeting agreed outcomes?", type: "select", options: yesNo, span: "half", required: true },
      { key: "effectivenessNotes", label: "Effectiveness notes", type: "textarea", span: "full", required: true },
      { key: "whatWorksWell", label: "What is working well", type: "textarea", span: "half" },
      { key: "whatNeedsImprove", label: "What needs to improve", type: "textarea", span: "half" },
    ],
  },
  {
    key: "carer_requirements",
    title: "Carer requirements & feedback",
    required: true,
    layout: "fields",
    guidance: "Gender preference, skills, continuity, feedback from client/family and carers.",
    fields: [
      { key: "carerRequirements", label: "Carer requirements", type: "textarea", span: "full", required: true },
      { key: "clientFamilyFeedback", label: "Client / family feedback", type: "textarea", span: "full", required: true },
      { key: "carerFeedback", label: "Carer / staff feedback", type: "textarea", span: "full" },
    ],
  },
  {
    key: "changes_to_care",
    title: "Changes to care provision",
    required: true,
    layout: "fields",
    guidance: "Hours, visit pattern, tasks, equipment, double-up, or package changes agreed.",
    fields: [
      { key: "changesAgreed", label: "Changes agreed", type: "textarea", span: "full", required: true },
      { key: "packageImpact", label: "Impact on care package / rota", type: "textarea", span: "full" },
    ],
  },
  {
    key: "about_me_updates",
    title: "About Me updates",
    required: false,
    layout: "fields",
    guidance: "Updates to identity, preferences, routines and what matters.",
    fields: [
      { key: "aboutMeUpdates", label: "About Me updates", type: "textarea", span: "full" },
    ],
  },
  {
    key: "section_change_checklist",
    title: "Section-change checklist (21 areas)",
    required: true,
    layout: "checklist",
    guidance: "Mark each care-plan area as No change, Changed, or N/A. Default is No change unless the reviewer's notes say otherwise.",
  },
  {
    key: "manual_handling",
    title: "Manual handling observation",
    required: true,
    layout: "fields",
    guidance: "Observation of moving & handling practice against the current plan.",
    fields: [
      { key: "observationDate", label: "Observation date", type: "date", span: "half" },
      { key: "observedBy", label: "Observed by", type: "text", span: "half" },
      { key: "observationNotes", label: "Observation notes", type: "textarea", span: "full", required: true },
      { key: "planStillValid", label: "Moving & handling plan still valid?", type: "select", options: yesNo, span: "half", required: true },
      { key: "mhActions", label: "Actions required", type: "textarea", span: "full" },
    ],
  },
  {
    key: "risk_assessments",
    title: "Risk assessments reviewed",
    required: true,
    layout: "fields",
    guidance: "Which risk assessments were reviewed and any updates needed.",
    fields: [
      { key: "assessmentsReviewed", label: "Risk assessments reviewed", type: "textarea", span: "full", required: true },
      { key: "updatesRequired", label: "Updates required", type: "textarea", span: "full" },
    ],
  },
  {
    key: "client_folder",
    title: "Client folder checks",
    required: true,
    layout: "fields",
    guidance: "Paper / electronic folder completeness — care plan, MAR, risk assessments, DNACPR, contacts.",
    fields: [
      { key: "folderComplete", label: "Client folder complete and up to date?", type: "select", options: yesNo, span: "half", required: true },
      { key: "folderGaps", label: "Gaps / actions", type: "textarea", span: "full" },
    ],
  },
  {
    key: "one_touch",
    title: "One Touch updates",
    required: false,
    layout: "fields",
    guidance: "System / One Touch (or equivalent) updates completed after the review.",
    fields: [
      { key: "oneTouchUpdated", label: "One Touch / system updated?", type: "select", options: yesNo, span: "half" },
      { key: "oneTouchNotes", label: "What was updated", type: "textarea", span: "full" },
    ],
  },
  {
    key: "summary_actions",
    title: "Summary & agreed actions",
    required: true,
    layout: "fields",
    guidance: "Overall summary and SMART actions with owners and due dates.",
    fields: [
      { key: "summary", label: "Review summary", type: "textarea", span: "full", required: true },
      { key: "agreedActions", label: "Agreed actions", type: "textarea", span: "full", required: true },
      { key: "nextReviewNotes", label: "Notes for next review", type: "textarea", span: "full" },
    ],
  },
  {
    key: "sign_off",
    title: "Compiled by / sign-off",
    required: true,
    layout: "fields",
    guidance: "Who compiled the report and sign-off details.",
    fields: [
      { key: "compiledBy", label: "Compiled by", type: "text", span: "half", required: true },
      { key: "compiledDate", label: "Date compiled", type: "date", span: "half", required: true },
      { key: "managerSignOff", label: "Manager sign-off name", type: "text", span: "half" },
      { key: "managerSignOffDate", label: "Manager sign-off date", type: "date", span: "half" },
      { key: "signOffNotes", label: "Sign-off notes", type: "textarea", span: "full" },
    ],
  },
];

export type ReviewChecklistContent = Record<string, { change: ChecklistChange; notes: string }>;
export type ReviewSectionContent = Record<string, unknown>;
export type CarePlanReviewContent = Record<string, ReviewSectionContent>;

export function emptyChecklist(): ReviewChecklistContent {
  const out: ReviewChecklistContent = {};
  for (const a of REVIEW_CHECKLIST_AREAS) {
    out[a.key] = { change: "no_change", notes: "" };
  }
  return out;
}

export function emptyCarePlanReviewContent(): CarePlanReviewContent {
  const content: CarePlanReviewContent = {};
  for (const sec of CARE_PLAN_REVIEW_SECTIONS) {
    if (sec.layout === "checklist") {
      content[sec.key] = { areas: emptyChecklist() };
    } else {
      const row: ReviewSectionContent = {};
      for (const f of sec.fields ?? []) row[f.key] = "";
      content[sec.key] = row;
    }
  }
  return content;
}

export function reviewHasInfoNeeded(content: CarePlanReviewContent): boolean {
  const walk = (v: unknown): boolean => {
    if (typeof v === "string") return v.includes("⚠ Information needed");
    if (Array.isArray(v)) return v.some(walk);
    if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).some(walk);
    return false;
  };
  return walk(content);
}

export function buildReviewSectionGuide(): string {
  return CARE_PLAN_REVIEW_SECTIONS.map((s) => {
    if (s.layout === "checklist") {
      const areas = REVIEW_CHECKLIST_AREAS.map((a) => `    - ${a.key}: ${a.label}`).join("\n");
      return `## ${s.key} — ${s.title}\nGuidance: ${s.guidance}\nChecklist areas (return change: no_change|changed|not_applicable + optional notes):\n${areas}`;
    }
    const fields = (s.fields ?? []).map((f) => `    - ${f.key}: ${f.label}`).join("\n");
    return `## ${s.key} — ${s.title}\nGuidance: ${s.guidance ?? ""}\nFields:\n${fields}`;
  }).join("\n\n");
}
