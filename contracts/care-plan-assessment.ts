/**
 * Full Assessment care plan  -  mirrors the paper care plan document.
 * Source of truth for template structure, empty content, and form rendering.
 */

export const ASSISTANCE_LEVELS = [
  { value: "independent", label: "Independent" },
  { value: "prompt", label: "Prompt / supervision" },
  { value: "some_assistance", label: "Some assistance" },
  { value: "full_assistance", label: "Full assistance" },
  { value: "not_applicable", label: "N/A" },
] as const;

export const VISIT_SLOTS = [
  { value: "morning", label: "Morning" },
  { value: "lunch", label: "Lunch" },
  { value: "tea", label: "Tea" },
  { value: "bed", label: "Bed" },
  { value: "other", label: "Other" },
] as const;

export const ASSISTANCE_DOMAINS = [
  { key: "mobility", label: "Mobility" },
  { key: "personal_care", label: "Personal care" },
  { key: "dressing", label: "Dressing" },
  { key: "toileting", label: "Toileting" },
  { key: "food_drink", label: "Food & drink" },
  { key: "housekeeping", label: "Housekeeping" },
  { key: "shopping", label: "Shopping" },
  { key: "financial_management", label: "Financial management" },
] as const;

export type CarePlanFieldType = "text" | "textarea" | "date" | "select" | "yes_no" | "number";

export type CarePlanFieldDef = {
  key: string;
  label: string;
  type: CarePlanFieldType;
  options?: { value: string; label: string }[];
  required?: boolean;
  help?: string;
  /** half = 50% width on md+, full = 100% */
  span?: "half" | "full";
};

export type CarePlanSectionLayout = "fields" | "visits" | "assistance";

export type CarePlanSectionDef = {
  key: string;
  title: string;
  guidance?: string;
  required?: boolean;
  layout: CarePlanSectionLayout;
  fields?: CarePlanFieldDef[];
};

/** Marker so the editor / API know this is the structured full assessment. */
export const CARE_PLAN_ASSESSMENT_FORMAT = "full_assessment_v1" as const;

export type CarePlanTemplateStructure = CarePlanSectionDef[] & {
  /** Stored alongside array on template  -  we use a wrapper object instead. */
};

/** Wrapper stored in document_templates.structure for assessment care plans. */
export type CarePlanAssessmentTemplate = {
  format: typeof CARE_PLAN_ASSESSMENT_FORMAT;
  sections: CarePlanSectionDef[];
};

export type VisitRow = {
  slot: (typeof VISIT_SLOTS)[number]["value"];
  days: string;
  startTime: string;
  endTime: string;
  durationMinutes: string;
  carersNeeded: string;
  tasks: string;
  careNeeds: string;
  taskMinutes: string;
};

export type AssistanceRow = {
  domain: (typeof ASSISTANCE_DOMAINS)[number]["key"];
  level: string;
  routineNotes: string;
};

export type CarePlanSectionContent = Record<string, unknown>;
export type CarePlanAssessmentContent = Record<string, CarePlanSectionContent>;

const yesNo = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Unknown / not assessed" },
];

const genderOpts = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
  { value: "other", label: "Other" },
];

const carerGenderOpts = [
  { value: "no_preference", label: "No preference" },
  { value: "female", label: "Female carer preferred" },
  { value: "male", label: "Male carer preferred" },
];

const propertyOpts = [
  { value: "house", label: "House" },
  { value: "flat", label: "Flat / apartment" },
  { value: "bungalow", label: "Bungalow" },
  { value: "sheltered", label: "Sheltered housing" },
  { value: "other", label: "Other" },
];

const dnarOpts = [
  { value: "yes", label: "DNAR in place" },
  { value: "no", label: "No DNAR" },
  { value: "unknown", label: "Unknown  -  confirm with GP/family" },
];

export const CARE_PLAN_ASSESSMENT_SECTIONS: CarePlanSectionDef[] = [
  {
    key: "mental_capacity",
    title: "Mental capacity",
    required: true,
    layout: "fields",
    guidance: "Mental Capacity Act  -  capacity for care decisions, best-interest arrangements, LPA/DoLS.",
    fields: [
      { key: "hasCapacityForCare", label: "Has capacity to consent to care?", type: "select", options: yesNo, span: "half", required: true },
      { key: "capacityAssessmentDate", label: "Capacity assessment date", type: "date", span: "half" },
      { key: "bestInterestDecision", label: "Best-interest decision in place?", type: "select", options: yesNo, span: "half" },
      { key: "lpaHealthWelfare", label: "LPA (health & welfare)", type: "select", options: yesNo, span: "half" },
      { key: "lpaPropertyFinance", label: "LPA (property & finance)", type: "select", options: yesNo, span: "half" },
      { key: "dols", label: "DoLS / deprivation of liberty", type: "select", options: yesNo, span: "half" },
      { key: "capacityNotes", label: "Capacity notes & how decisions are supported", type: "textarea", span: "full", required: true },
    ],
  },
  {
    key: "individual_information",
    title: "Individual information",
    required: true,
    layout: "fields",
    guidance: "Start date, household, property, pets, faith, falls, sex/gender and preferred carer gender.",
    fields: [
      { key: "careStartDate", label: "Care start date", type: "date", span: "half", required: true },
      { key: "livesWith", label: "Who the client lives with", type: "text", span: "half", required: true },
      { key: "propertyType", label: "Property type", type: "select", options: propertyOpts, span: "half" },
      { key: "pets", label: "Pets", type: "text", span: "half", help: "Type, name, any access notes" },
      { key: "faith", label: "Faith / religion / beliefs", type: "text", span: "half" },
      { key: "fallsHistory", label: "Falls history", type: "textarea", span: "full", help: "Dates, injuries, equipment in place" },
      { key: "sexGender", label: "Sex / gender", type: "select", options: genderOpts, span: "half" },
      { key: "preferredCarerGender", label: "Preferred carer gender", type: "select", options: carerGenderOpts, span: "half" },
      { key: "individualNotes", label: "Other individual information", type: "textarea", span: "full" },
    ],
  },
  {
    key: "personal_details_contacts",
    title: "Personal details & key contacts",
    required: true,
    layout: "fields",
    guidance: "Address, phone, key safe, DOB, LPA contacts, GP, pharmacy, social worker, district nurse and other professionals.",
    fields: [
      { key: "address", label: "Address", type: "textarea", span: "full", required: true },
      { key: "phone", label: "Phone", type: "text", span: "half" },
      { key: "keySafe", label: "Key safe code / location", type: "text", span: "half", help: "Treat as confidential  -  only share with assigned carers" },
      { key: "dateOfBirth", label: "Date of birth", type: "date", span: "half" },
      { key: "nhsNumber", label: "NHS number", type: "text", span: "half" },
      { key: "lpaName", label: "LPA / next of kin name", type: "text", span: "half" },
      { key: "lpaPhone", label: "LPA / next of kin phone", type: "text", span: "half" },
      { key: "lpaRelationship", label: "Relationship", type: "text", span: "half" },
      { key: "gpNameSurgery", label: "GP name & surgery", type: "text", span: "half", required: true },
      { key: "gpPhone", label: "GP phone", type: "text", span: "half" },
      { key: "pharmacy", label: "Pharmacy", type: "text", span: "half" },
      { key: "pharmacyPhone", label: "Pharmacy phone", type: "text", span: "half" },
      { key: "socialWorker", label: "Social worker", type: "text", span: "half" },
      { key: "socialWorkerPhone", label: "Social worker phone", type: "text", span: "half" },
      { key: "districtNurse", label: "District nurse", type: "text", span: "half" },
      { key: "districtNursePhone", label: "District nurse phone", type: "text", span: "half" },
      { key: "otherProfessionals", label: "Other professionals involved", type: "textarea", span: "full", help: "OT, physio, mental health, community matron, etc." },
    ],
  },
  {
    key: "property_utilities",
    title: "Property & utilities",
    required: true,
    layout: "fields",
    guidance: "Gas stop cock, electricity RCD/fuse board, water main stop. Include NHS 111 / 999 guidance for carers.",
    fields: [
      { key: "gasStopCock", label: "Gas stop cock location", type: "text", span: "full", required: true },
      { key: "electricityBoard", label: "Electricity RCD / fuse board location", type: "text", span: "full", required: true },
      { key: "waterStop", label: "Water main stop location", type: "text", span: "full", required: true },
      {
        key: "emergencyGuidance",
        label: "NHS 111 / 999 guidance for carers",
        type: "textarea",
        span: "full",
        required: true,
        help: "When to call 111 vs 999; known allergies/alerts; DNAR location if relevant",
      },
      { key: "accessNotes", label: "Access / parking / entry notes", type: "textarea", span: "full" },
    ],
  },
  {
    key: "medical_information",
    title: "Medical information",
    required: true,
    layout: "fields",
    guidance: "Health overview, history, DNAR, medication (morning / tea / PRN), consent to prompt, sharps, allergies, height/weight, smoking/drinking, cognition.",
    fields: [
      { key: "healthOverview", label: "Health overview", type: "textarea", span: "full", required: true },
      { key: "medicalHistory", label: "Medical history", type: "textarea", span: "full", required: true },
      { key: "dnarStatus", label: "DNAR status", type: "select", options: dnarOpts, span: "half", required: true },
      { key: "dnarLocation", label: "DNAR form location", type: "text", span: "half" },
      { key: "medMorning", label: "Prescribed medication  -  morning", type: "textarea", span: "full" },
      { key: "medTea", label: "Prescribed medication  -  tea / evening", type: "textarea", span: "full" },
      { key: "medPrn", label: "Prescribed medication  -  PRN", type: "textarea", span: "full" },
      { key: "consentMedicationPrompt", label: "Consent to medication prompt?", type: "select", options: yesNo, span: "half", required: true },
      { key: "sharpsBox", label: "Sharps box in property?", type: "select", options: yesNo, span: "half" },
      { key: "allergies", label: "Allergies", type: "textarea", span: "full", required: true },
      { key: "height", label: "Height", type: "text", span: "half" },
      { key: "weight", label: "Weight", type: "text", span: "half" },
      { key: "smoking", label: "Smoking", type: "text", span: "half" },
      { key: "drinking", label: "Alcohol", type: "text", span: "half" },
      { key: "cognitiveAbility", label: "Cognitive ability", type: "textarea", span: "full", required: true },
    ],
  },
  {
    key: "general_health_needs",
    title: "General health needs",
    required: true,
    layout: "fields",
    guidance: "Sight, hearing, communication, oral health, foot care, dexterity, appetite & diet, continence, pressure areas, pain.",
    fields: [
      { key: "sight", label: "Sight", type: "textarea", span: "half" },
      { key: "hearing", label: "Hearing", type: "textarea", span: "half" },
      { key: "communication", label: "Communication", type: "textarea", span: "full", required: true },
      { key: "oralHealth", label: "Oral health", type: "textarea", span: "half" },
      { key: "footCare", label: "Foot care", type: "textarea", span: "half" },
      { key: "dexterity", label: "Dexterity", type: "textarea", span: "half" },
      { key: "appetiteDiet", label: "Appetite & diet", type: "textarea", span: "half", required: true },
      { key: "continence", label: "Continence", type: "textarea", span: "full" },
      { key: "pressureAreas", label: "Pressure areas / skin", type: "textarea", span: "full" },
      { key: "painManagement", label: "Pain management", type: "textarea", span: "full" },
    ],
  },
  {
    key: "mobility",
    title: "Mobility",
    required: true,
    layout: "fields",
    guidance: "Moving & handling, transfers, equipment, falls risk.",
    fields: [
      { key: "mobilityStatus", label: "Mobility status", type: "textarea", span: "full", required: true },
      { key: "transfers", label: "Transfers", type: "textarea", span: "full" },
      { key: "equipment", label: "Equipment in use", type: "textarea", span: "full", help: "Hoist, stand-aid, wheelchair, walking frame, etc." },
      { key: "fallsRisk", label: "Falls risk & controls", type: "textarea", span: "full" },
      { key: "movingHandlingPlan", label: "Moving & handling plan summary", type: "textarea", span: "full", required: true },
    ],
  },
  {
    key: "social_activities",
    title: "Social activities",
    required: false,
    layout: "fields",
    guidance: "Hobbies, community, visitors, cultural activities.",
    fields: [
      { key: "interests", label: "Interests & hobbies", type: "textarea", span: "full" },
      { key: "communityActivities", label: "Community / day activities", type: "textarea", span: "full" },
      { key: "visitors", label: "Visitors & social contact", type: "textarea", span: "full" },
      { key: "culturalNeeds", label: "Cultural / spiritual activities", type: "textarea", span: "full" },
    ],
  },
  {
    key: "personal_care",
    title: "Personal care",
    required: true,
    layout: "fields",
    guidance: "Washing, bathing, dressing preferences and routines.",
    fields: [
      { key: "washingBathing", label: "Washing / bathing", type: "textarea", span: "full", required: true },
      { key: "dressing", label: "Dressing", type: "textarea", span: "full" },
      { key: "grooming", label: "Grooming / oral care routine", type: "textarea", span: "full" },
      { key: "preferences", label: "Preferences & dignity notes", type: "textarea", span: "full" },
    ],
  },
  {
    key: "eating_drinking",
    title: "Eating & drinking",
    required: true,
    layout: "fields",
    guidance: "Diet, fluids, swallowing, meal support, kitchen access.",
    fields: [
      { key: "diet", label: "Diet & preferences", type: "textarea", span: "full", required: true },
      { key: "fluids", label: "Fluids / hydration", type: "textarea", span: "full" },
      { key: "swallowing", label: "Swallowing / IDDSI / choking risk", type: "textarea", span: "full" },
      { key: "mealSupport", label: "Meal support needed", type: "textarea", span: "full" },
      { key: "kitchenAccess", label: "Kitchen access & food storage", type: "textarea", span: "full" },
    ],
  },
  {
    key: "visit_schedule",
    title: "Visit schedule & care needs",
    required: true,
    layout: "visits",
    guidance: "Days, start/end times, duration, tasks, minutes and carers for morning / lunch / tea / bed / other.",
  },
  {
    key: "level_of_assistance",
    title: "Level of assistance",
    required: true,
    layout: "assistance",
    guidance: "Independence level and routine notes for each domain.",
  },
  {
    key: "risks",
    title: "Risks",
    required: true,
    layout: "fields",
    guidance: "Identified risks and how they are reduced.",
    fields: [
      { key: "identifiedRisks", label: "Identified risks", type: "textarea", span: "full", required: true },
      { key: "riskControls", label: "Controls / how we reduce them", type: "textarea", span: "full", required: true },
      { key: "positiveRiskTaking", label: "Positive risk-taking (choices the person makes)", type: "textarea", span: "full" },
    ],
  },
  {
    key: "outcomes",
    title: "Outcomes",
    required: true,
    layout: "fields",
    guidance: "What good looks like for this person.",
    fields: [
      { key: "goals", label: "Outcomes & goals", type: "textarea", span: "full", required: true },
      { key: "howWeWillKnow", label: "How we will know we are succeeding", type: "textarea", span: "full" },
    ],
  },
  {
    key: "mental_health_wellbeing",
    title: "Mental health & wellbeing",
    required: true,
    layout: "fields",
    guidance: "Mood, anxiety, sleep, what helps, escalation.",
    fields: [
      { key: "moodWellbeing", label: "Mood & wellbeing", type: "textarea", span: "full", required: true },
      { key: "anxietyTriggers", label: "Anxiety / triggers", type: "textarea", span: "full" },
      { key: "sleep", label: "Sleep", type: "textarea", span: "half" },
      { key: "whatHelps", label: "What helps", type: "textarea", span: "half" },
      { key: "escalation", label: "Escalation / crisis contacts", type: "textarea", span: "full" },
    ],
  },
  {
    key: "consent",
    title: "Consent",
    required: true,
    layout: "fields",
    guidance: "Consent to care, information sharing, photography, medication support.",
    fields: [
      { key: "consentToCare", label: "Consent to care package", type: "select", options: yesNo, span: "half", required: true },
      { key: "consentInfoSharing", label: "Consent to share information with care team / GP", type: "select", options: yesNo, span: "half", required: true },
      { key: "consentPhotography", label: "Consent for photographs (e.g. skin)", type: "select", options: yesNo, span: "half" },
      { key: "consentNotes", label: "Consent notes / how consent was obtained", type: "textarea", span: "full", required: true },
    ],
  },
  {
    key: "sign_off",
    title: "Sign-off",
    required: true,
    layout: "fields",
    guidance: "Assessor, client/representative and manager sign-off.",
    fields: [
      { key: "assessorName", label: "Assessor name", type: "text", span: "half", required: true },
      { key: "assessorDate", label: "Assessment date", type: "date", span: "half", required: true },
      { key: "clientRepName", label: "Client / representative name", type: "text", span: "half" },
      { key: "clientRepDate", label: "Client / representative date", type: "date", span: "half" },
      { key: "managerName", label: "Manager / approver name", type: "text", span: "half" },
      { key: "managerDate", label: "Manager sign-off date", type: "date", span: "half" },
      { key: "signOffNotes", label: "Sign-off notes", type: "textarea", span: "full" },
    ],
  },
];

export const CARE_PLAN_ASSESSMENT_TEMPLATE: CarePlanAssessmentTemplate = {
  format: CARE_PLAN_ASSESSMENT_FORMAT,
  sections: CARE_PLAN_ASSESSMENT_SECTIONS,
};

export const CARE_PLAN_ASSESSMENT_NAME = "Care plan - full assessment";
export const CARE_PLAN_ASSESSMENT_VERSION = 2;

export function isCarePlanAssessmentTemplate(structure: unknown): structure is CarePlanAssessmentTemplate {
  return (
    !!structure &&
    typeof structure === "object" &&
    !Array.isArray(structure) &&
    (structure as CarePlanAssessmentTemplate).format === CARE_PLAN_ASSESSMENT_FORMAT &&
    Array.isArray((structure as CarePlanAssessmentTemplate).sections)
  );
}

/** Support plans / legacy care plans store a plain section array. */
export function getTemplateSections(structure: unknown): CarePlanSectionDef[] | { key: string; title: string; guidance?: string; required?: boolean }[] {
  if (isCarePlanAssessmentTemplate(structure)) return structure.sections;
  if (Array.isArray(structure)) return structure as { key: string; title: string; guidance?: string; required?: boolean }[];
  return [];
}

export function emptyVisitRows(): VisitRow[] {
  return VISIT_SLOTS.map((s) => ({
    slot: s.value,
    days: "",
    startTime: "",
    endTime: "",
    durationMinutes: "",
    carersNeeded: "",
    tasks: "",
    careNeeds: "",
    taskMinutes: "",
  }));
}

export function emptyAssistanceRows(): AssistanceRow[] {
  return ASSISTANCE_DOMAINS.map((d) => ({
    domain: d.key,
    level: "",
    routineNotes: "",
  }));
}

export function emptyCarePlanAssessmentContent(): CarePlanAssessmentContent {
  const content: CarePlanAssessmentContent = {};
  for (const sec of CARE_PLAN_ASSESSMENT_SECTIONS) {
    if (sec.layout === "visits") {
      content[sec.key] = { visits: emptyVisitRows() };
    } else if (sec.layout === "assistance") {
      content[sec.key] = { domains: emptyAssistanceRows() };
    } else {
      const row: CarePlanSectionContent = {};
      for (const f of sec.fields ?? []) row[f.key] = "";
      content[sec.key] = row;
    }
  }
  return content;
}

/** True if any string value contains the AI missing-info marker. */
export function assessmentHasInfoNeeded(content: CarePlanAssessmentContent): boolean {
  const walk = (v: unknown): boolean => {
    if (typeof v === "string") return v.includes("⚠ Information needed");
    if (Array.isArray(v)) return v.some(walk);
    if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).some(walk);
    return false;
  };
  return walk(content);
}

/** Flatten assessment content to prose for AI regenerate / display summaries. */
export function flattenSectionForAi(sectionKey: string, sectionContent: CarePlanSectionContent): string {
  const sec = CARE_PLAN_ASSESSMENT_SECTIONS.find((s) => s.key === sectionKey);
  if (!sec) return JSON.stringify(sectionContent, null, 2);
  if (sec.layout === "visits") {
    const visits = (sectionContent.visits as VisitRow[] | undefined) ?? [];
    return visits
      .map((v) => {
        const label = VISIT_SLOTS.find((s) => s.value === v.slot)?.label ?? v.slot;
        return `${label}: days=${v.days || " - "} ${v.startTime || "?"}-${v.endTime || "?"} (${v.durationMinutes || "?"} min, ${v.carersNeeded || "?"} carer(s))\nTasks: ${v.tasks || " - "}\nCare needs: ${v.careNeeds || " - "}\nTask minutes: ${v.taskMinutes || " - "}`;
      })
      .join("\n\n");
  }
  if (sec.layout === "assistance") {
    const domains = (sectionContent.domains as AssistanceRow[] | undefined) ?? [];
    return domains
      .map((d) => {
        const label = ASSISTANCE_DOMAINS.find((x) => x.key === d.domain)?.label ?? d.domain;
        const level = ASSISTANCE_LEVELS.find((l) => l.value === d.level)?.label ?? (d.level || " - ");
        return `${label}: ${level}\n${d.routineNotes || ""}`;
      })
      .join("\n\n");
  }
  return (sec.fields ?? [])
    .map((f) => `${f.label}: ${String(sectionContent[f.key] ?? "") || " - "}`)
    .join("\n");
}
