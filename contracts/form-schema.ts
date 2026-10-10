import { z } from "zod";

/**
 * Shared application-form schema — used by the form builder (client),
 * the public renderer (client) and the submission validator (server).
 * The published schema JSON stored in application_form_versions.schema_json
 * must satisfy FormSchemaDoc.
 */

export const FIELD_TYPES = [
  "short_text",
  "long_text",
  "email",
  "uk_phone",
  "number",
  "date",
  "uk_postcode",
  "single_choice",
  "multiple_choice",
  "yes_no",
  "availability_grid",
  "rating",
  "file_upload",
  "consent",
  "heading",
  "paragraph",
  "image",
  "divider",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Display-only types never produce an answer. */
export const DISPLAY_TYPES: FieldType[] = ["heading", "paragraph", "image", "divider"];

/** Core fields that exist on every form and cannot be deleted. */
export const LOCKED_FIELD_IDS = [
  "first_name",
  "last_name",
  "email",
  "mobile",
  "cv_upload",
  "privacy_consent",
] as const;

export const fieldOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

export const fieldValidationSchema = z.object({
  minChars: z.number().int().min(0).optional(),
  maxChars: z.number().int().min(1).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  /** file_upload: allowed extensions, e.g. [".pdf", ".doc", ".docx"] */
  fileTypes: z.array(z.string()).optional(),
  /** file_upload: max size in MB */
  maxMb: z.number().min(0.5).max(25).optional(),
});

/** Conditional display: show this field only when another field's answer matches. */
export const fieldConditionSchema = z.object({
  fieldId: z.string().min(1),
  op: z.enum(["equals", "not_equals", "contains", "answered"]),
  value: z.string().optional(),
});

/** Knockout rule: when the answer trips the rule the application is flagged for human review (never auto-rejected). */
export const knockoutRuleSchema = z.object({
  op: z.enum(["equals", "not_equals", "contains"]),
  value: z.string(),
  message: z.string().min(3),
});

export const formFieldSchema = z.object({
  id: z.string().min(1).max(60).regex(/^[a-z][a-z0-9_]*$/, "lowercase_snake_case"),
  type: z.enum(FIELD_TYPES),
  label: z.string().min(1).max(300),
  help: z.string().max(500).optional(),
  placeholder: z.string().max(200).optional(),
  required: z.boolean().default(false),
  locked: z.boolean().default(false),
  options: z.array(fieldOptionSchema).optional(),
  validation: fieldValidationSchema.optional(),
  condition: fieldConditionSchema.optional(),
  knockoutRule: knockoutRuleSchema.optional(),
  useInAi: z.boolean().default(false),
  /** Optional mapping to a job requirement key for AI screening. */
  requirementKey: z.string().max(60).optional(),
  /** image blocks: object-storage key or data URL for the builder canvas */
  imageKey: z.string().optional(),
});

export const formSectionSchema = z.object({
  id: z.string().min(1).max(60),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  fields: z.array(formFieldSchema),
});

export const formSchemaDoc = z.object({
  introText: z.string().max(2000).optional(),
  thankYouText: z.string().max(2000).optional(),
  sections: z.array(formSectionSchema).min(1),
});

export type FormField = z.infer<typeof formFieldSchema>;
export type FormSection = z.infer<typeof formSectionSchema>;
export type FormSchemaDoc = z.infer<typeof formSchemaDoc>;

export const AVAILABILITY_ROWS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const AVAILABILITY_COLS = ["mornings", "afternoons", "evenings", "nights"] as const;

/** Answers are keyed by field id. */
export type FormAnswers = Record<string, unknown>;

/** Evaluate a field's display condition against current answers. */
export function conditionMet(field: FormField, answers: FormAnswers): boolean {
  const c = field.condition;
  if (!c) return true;
  const v = answers[c.fieldId];
  switch (c.op) {
    case "answered":
      return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
    case "equals":
      return String(v ?? "") === (c.value ?? "");
    case "not_equals":
      return String(v ?? "") !== (c.value ?? "");
    case "contains":
      if (Array.isArray(v)) return v.map(String).includes(c.value ?? "");
      return String(v ?? "").includes(c.value ?? "");
    default:
      return true;
  }
}

/** Knockout rules tripped by these answers → { fieldId, message } list. */
export function trippedKnockouts(schema: FormSchemaDoc, answers: FormAnswers) {
  const hits: { fieldId: string; label: string; message: string }[] = [];
  for (const s of schema.sections) {
    for (const f of s.fields) {
      if (!f.knockoutRule || DISPLAY_TYPES.includes(f.type)) continue;
      if (!conditionMet(f, answers)) continue;
      const v = answers[f.id];
      const rule = f.knockoutRule;
      let trip = false;
      if (rule.op === "equals") trip = String(v ?? "") === rule.value;
      else if (rule.op === "not_equals") trip = String(v ?? "") !== rule.value;
      else if (rule.op === "contains") {
        trip = Array.isArray(v) ? v.map(String).includes(rule.value) : String(v ?? "").includes(rule.value);
      }
      if (trip) hits.push({ fieldId: f.id, label: f.label, message: rule.message });
    }
  }
  return hits;
}

const UK_PHONE = /^(\+44\s?|0)\d[\d\s]{8,12}$/;
const UK_POSTCODE = /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/;

/** Validate one field's answer. Returns an error string or null. */
export function validateAnswer(field: FormField, value: unknown): string | null {
  if (DISPLAY_TYPES.includes(field.type)) return null;
  const empty =
    value === undefined || value === null || value === "" ||
    (field.type === "consent" && value === false) ||
    (Array.isArray(value) && value.length === 0) ||
    (field.type === "availability_grid" && typeof value === "object" && value !== null && Object.keys(value as object).length === 0);
  if (empty) return field.required ? "This question requires an answer" : null;

  switch (field.type) {
    case "email":
      return z.string().email().safeParse(value).success ? null : "Enter a valid email address";
    case "uk_phone":
      return UK_PHONE.test(String(value).trim()) ? null : "Enter a valid UK phone number";
    case "uk_postcode":
      return UK_POSTCODE.test(String(value).trim()) ? null : "Enter a valid UK postcode";
    case "number": {
      const n = Number(value);
      if (Number.isNaN(n)) return "Enter a number";
      if (field.validation?.min !== undefined && n < field.validation.min) return `Must be at least ${field.validation.min}`;
      if (field.validation?.max !== undefined && n > field.validation.max) return `Must be at most ${field.validation.max}`;
      return null;
    }
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? null : "Enter a valid date";
    case "short_text":
    case "long_text": {
      const len = String(value).length;
      if (field.validation?.minChars !== undefined && len < field.validation.minChars)
        return `Please write at least ${field.validation.minChars} characters`;
      if (field.validation?.maxChars !== undefined && len > field.validation.maxChars)
        return `Please keep this under ${field.validation.maxChars} characters`;
      return null;
    }
    case "single_choice":
      return (field.options ?? []).some((o) => o.value === value) ? null : "Choose an option";
    case "multiple_choice": {
      if (!Array.isArray(value)) return "Choose at least one option";
      const allowed = new Set((field.options ?? []).map((o) => o.value));
      return value.every((v) => allowed.has(String(v))) ? null : "Invalid option";
    }
    case "yes_no":
      return value === "yes" || value === "no" ? null : "Choose yes or no";
    case "rating": {
      const n = Number(value);
      return n >= 1 && n <= 5 ? null : "Choose a rating between 1 and 5";
    }
    case "consent":
      return value === true || value === "yes" ? null : "Please tick the box to continue";
    case "file_upload":
      // value is { key, fileName, size } after upload
      return typeof value === "object" && value !== null && typeof (value as { key?: unknown }).key === "string"
        ? null
        : "Please upload a file";
    case "availability_grid":
      return typeof value === "object" && value !== null ? null : "Tell us when you can work";
    default:
      return null;
  }
}

/** Validate a whole submission against a published schema. Only visible fields are checked. */
export function validateSubmission(schema: FormSchemaDoc, answers: FormAnswers) {
  const errors: Record<string, string> = {};
  for (const s of schema.sections) {
    for (const f of s.fields) {
      if (!conditionMet(f, answers)) continue;
      const err = validateAnswer(f, answers[f.id]);
      if (err) errors[f.id] = err;
    }
  }
  return errors;
}

/** How a requirement is asked on the form. Structured answers are scored in code; written answers are judged by the AI. */
export const REQUIREMENT_ANSWER_TYPES = ["text", "yes_no", "single_choice", "multiple_choice", "checkbox"] as const;
export type RequirementAnswerType = (typeof REQUIREMENT_ANSWER_TYPES)[number];
export const REQUIREMENT_ANSWER_LABELS: Record<RequirementAnswerType, string> = {
  text: "Written answer",
  yes_no: "Yes / No",
  single_choice: "Dropdown (pick one)",
  multiple_choice: "Multiple choice (pick any)",
  checkbox: "Checkbox (tick to confirm)",
};
/** The single option value a checkbox requirement records when ticked. */
export const CHECKBOX_CONFIRMED = "confirmed";

/** A screening requirement on a job posting (job_postings.requirements). */
export const jobRequirementSchema = z.object({
  key: z.string().min(1).max(50).regex(/^[a-z][a-z0-9_]*$/, "lowercase_snake_case"),
  label: z.string().min(2).max(200),
  weight: z.number().min(0).max(100),
  type: z.string().max(20).default("scored"),
  /** Must-have: candidates without it go to human review instead of being shortlisted. */
  required: z.boolean().default(false),
  /** Missing means a written answer (requirements saved before answer types existed). */
  answerType: z.enum(REQUIREMENT_ANSWER_TYPES).optional(),
  /** Question applicants see; defaults to the label. */
  question: z.string().max(300).optional(),
  /** Choices for dropdown and multiple choice. */
  options: z.array(fieldOptionSchema).max(20).optional(),
  /** Answers that meet the requirement (option values, "yes"/"no", or "confirmed"). */
  accepted: z.array(z.string()).max(20).optional(),
});
export type JobRequirement = z.infer<typeof jobRequirementSchema>;

/** The answers that meet a requirement, with sensible defaults for yes/no and checkbox. */
export function acceptedAnswers(req: Pick<JobRequirement, "answerType" | "accepted">, field?: Pick<FormField, "type">): string[] {
  if (req.accepted?.length) return req.accepted;
  const type = field?.type ?? req.answerType;
  if (type === "yes_no") return ["yes"];
  if (req.answerType === "checkbox") return [CHECKBOX_CONFIRMED];
  return [];
}

/**
 * For a structured answer, whether it meets the requirement: "yes", "no", or null when it
 * can't be decided in code (written answer, unanswered, or no accepted answers set).
 */
export function structuredMet(
  req: Pick<JobRequirement, "answerType" | "accepted">,
  field: Pick<FormField, "type">,
  value: unknown,
): "yes" | "no" | null {
  if (!["yes_no", "single_choice", "multiple_choice"].includes(field.type)) return null;
  const accepted = acceptedAnswers(req, field);
  if (accepted.length === 0) return null;
  const given = Array.isArray(value) ? value.map(String) : value === undefined || value === null || value === "" ? [] : [String(value)];
  if (given.length === 0) return req.answerType === "checkbox" ? "no" : null;
  return given.some((v) => accepted.includes(v)) ? "yes" : "no";
}

/** Option value from a label, unique within `taken`. */
export function optionValueFromLabel(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "option";
  let value = base;
  for (let n = 2; used.has(value); n++) value = `${base}_${n}`;
  return value;
}

/** The form question generated for a requirement that no template field already asks. */
export function requirementField(r: JobRequirement): FormField {
  const base = {
    id: requirementFieldId(r.key),
    label: r.question?.trim() || r.label,
    required: r.required,
    locked: true,
    useInAi: true,
    requirementKey: r.key,
  };
  switch (r.answerType) {
    case "yes_no":
      return { ...base, type: "yes_no" };
    case "single_choice":
      return { ...base, type: "single_choice", options: r.options ?? [] };
    case "multiple_choice":
      return { ...base, type: "multiple_choice", options: r.options ?? [] };
    case "checkbox":
      return {
        ...base, type: "multiple_choice", label: r.label, required: false,
        options: [{ value: CHECKBOX_CONFIRMED, label: r.question?.trim() || `I confirm: ${r.label}` }],
      };
    default:
      return {
        ...base, type: "long_text",
        help: "Tell us how you meet this. A short example helps.",
        validation: { maxChars: 1500 },
      };
  }
}

type Suggestion = Pick<JobRequirement, "answerType" | "question" | "options" | "accepted">;

const YEAR_BANDS = [
  { value: "none", label: "None yet", years: 0 },
  { value: "under_1", label: "Less than 1 year", years: 0.5 },
  { value: "1_2", label: "1–2 years", years: 1 },
  { value: "3_5", label: "3–5 years", years: 3 },
  { value: "5_plus", label: "More than 5 years", years: 5 },
];

/**
 * Best guess at how to ask a requirement, from its wording. The admin can change everything;
 * this only saves typing for the common cases (licences, DBS, experience, availability, languages).
 */
export function suggestRequirementSetup(label: string): Suggestion {
  const text = label.trim();
  const l = text.toLowerCase();
  const asQuestion = /\?$/.test(text) && /^(do|does|are|is|have|has|can|will|would|how|what|which|when)\b/i.test(text) ? text : null;

  if (/right to work/.test(l)) return { answerType: "yes_no", question: asQuestion ?? "Do you have the right to work in the UK?", accepted: ["yes"] };
  if (/driv|licen[cs]e/.test(l)) return { answerType: "yes_no", question: asQuestion ?? "Do you hold a full UK driving licence?", accepted: ["yes"] };
  if (/\bcar\b|vehicle|own transport/.test(l)) return { answerType: "yes_no", question: asQuestion ?? "Do you have access to a car for work?", accepted: ["yes"] };
  if (/\bdbs\b/.test(l)) {
    return { answerType: "yes_no", question: asQuestion ?? "Do you have a current enhanced DBS check, or are you on the DBS Update Service?", accepted: ["yes"] };
  }

  const years = l.match(/(\d+)\s*\+?\s*(?:years?|yrs?)/);
  if (years || (/experience/.test(l) && !/describe|tell|explain/.test(l))) {
    const min = years ? Number(years[1]) : 1;
    const topic = l.replace(/\(.*?\)/g, "").replace(/[?.!]+$/, "").trim();
    return {
      answerType: "single_choice",
      question: asQuestion ?? (years ? "How many years of relevant experience do you have?" : `How much ${topic} do you have?`),
      options: YEAR_BANDS.map(({ value, label: optionLabel }) => ({ value, label: optionLabel })),
      accepted: YEAR_BANDS.filter((b) => b.years >= min).map((b) => b.value),
    };
  }

  if (/availab|weekend|night|evening|shift|days? a week/.test(l)) {
    const options = [
      { value: "weekdays", label: "Weekdays" },
      { value: "weekends", label: "Weekends" },
      { value: "early_mornings", label: "Early mornings" },
      { value: "evenings", label: "Evenings" },
      { value: "nights", label: "Nights" },
    ];
    const wanted = options.filter((o) => l.includes(o.value.replace("_", " ").replace(/s$/, ""))).map((o) => o.value);
    return {
      answerType: "multiple_choice",
      question: asQuestion ?? "When are you available to work?",
      options,
      accepted: wanted.length ? wanted : options.map((o) => o.value),
    };
  }

  if (/english|language|speak|fluen/.test(l)) {
    return {
      answerType: "single_choice",
      question: asQuestion ?? (/english/.test(l) ? "How well do you speak English?" : `How well do you speak ${text}?`),
      options: [
        { value: "basic", label: "Basic" },
        { value: "conversational", label: "Conversational" },
        { value: "fluent", label: "Fluent" },
        { value: "native", label: "Native speaker" },
      ],
      accepted: ["fluent", "native"],
    };
  }

  if (/certificate|qualification|nvq|qcf|level \d|diploma|degree|first aid|registered|registration|\bpin\b/.test(l)) {
    return { answerType: "yes_no", question: asQuestion ?? `Do you hold ${text.replace(/^(a|an|the)\s+/i, "")}?`, accepted: ["yes"] };
  }
  if (/^(willing|able|happy|prepared|available) to/.test(l)) {
    return { answerType: "yes_no", question: asQuestion ?? `Are you ${l}?`, accepted: ["yes"] };
  }
  if (asQuestion && /^(do|does|are|is|have|has|can|will|would)\b/i.test(text)) {
    return { answerType: "yes_no", question: asQuestion, accepted: ["yes"] };
  }
  if (/\?$/.test(text) && text.split(/\s+/).length <= 8) {
    return { answerType: "yes_no", question: text, accepted: ["yes"] };
  }
  return { answerType: "text", question: asQuestion ?? undefined };
}

/** Section that holds the questions generated from a job's screening requirements. */
export const REQUIREMENT_SECTION_ID = "job_questions";
/** Prefix of generated requirement question ids. */
export const REQUIREMENT_FIELD_PREFIX = "rq_";

export const requirementFieldId = (key: string) => `${REQUIREMENT_FIELD_PREFIX}${key}`.slice(0, 60);
export const isRequirementField = (f: Pick<FormField, "id">) => f.id.startsWith(REQUIREMENT_FIELD_PREFIX);

/** Turn a label into a requirement key that is unique within `taken`. */
export function requirementKeyFromLabel(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = (label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "requirement")
    .replace(/^(\d)/, "r_$1");
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}_${n}`;
  return key;
}

/**
 * Make the form ask about every screening requirement.
 * A requirement already covered by a template field (same requirementKey) reuses that field;
 * every other requirement gets one generated question in the job-questions section.
 * Generated questions for removed requirements are dropped. Pure: returns a new document.
 */
export function syncRequirementQuestions(schema: FormSchemaDoc, requirements: JobRequirement[]): FormSchemaDoc {
  const doc: FormSchemaDoc = JSON.parse(JSON.stringify(schema));
  const byKey = new Map(requirements.map((r) => [r.key, r]));

  const coveredByTemplate = new Set<string>();
  for (const s of doc.sections) {
    for (const f of s.fields) {
      if (isRequirementField(f) || !f.requirementKey) continue;
      const req = byKey.get(f.requirementKey);
      if (!req) continue;
      coveredByTemplate.add(req.key);
      f.useInAi = true;
      if (req.required) f.required = true;
    }
  }

  const existing = new Map<string, FormField>();
  for (const s of doc.sections) {
    s.fields = s.fields.filter((f) => {
      if (!isRequirementField(f)) return true;
      const key = f.requirementKey ?? "";
      if (!byKey.has(key) || coveredByTemplate.has(key) || existing.has(key)) return false;
      existing.set(key, f);
      return true;
    });
  }

  const missing = requirements.filter((r) => !coveredByTemplate.has(r.key) && !existing.has(r.key));
  for (const s of doc.sections) {
    s.fields = s.fields.map((f) => {
      if (!isRequirementField(f)) return f;
      const r = byKey.get(f.requirementKey ?? "");
      return r ? { ...requirementField(r), id: f.id, condition: f.condition } : f;
    });
  }
  if (missing.length === 0) return doc;

  let section = doc.sections.find((s) => s.id === REQUIREMENT_SECTION_ID);
  if (!section) {
    section = {
      id: REQUIREMENT_SECTION_ID,
      title: "About this role",
      description: "Tell us how you meet what this role needs.",
      fields: [],
    };
    const consentAt = doc.sections.findIndex((s) => s.fields.some((f) => f.type === "consent"));
    doc.sections.splice(consentAt >= 0 ? consentAt : doc.sections.length, 0, section);
  }
  for (const r of missing) section.fields.push(requirementField(r));
  return doc;
}

/** Plain-text rendering of an answer for reviewers and the AI. */
export function answerText(field: FormField, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  const optLabel = (v: unknown) => field.options?.find((o) => o.value === String(v))?.label ?? String(v);
  if (Array.isArray(value)) return value.map(optLabel).join(", ");
  if (field.type === "file_upload" && typeof value === "object") return String((value as { fileName?: string }).fileName ?? "file uploaded");
  if (field.type === "availability_grid" && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([day, slots]) => `${day}: ${Array.isArray(slots) ? slots.join("/") : String(slots)}`)
      .join("; ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field.type === "yes_no") return value === "yes" ? "Yes" : value === "no" ? "No" : String(value);
  return field.options ? optLabel(value) : String(value);
}

/** Build the default "General role — Standard" template for roles outside front-line care. */
export function defaultGeneralForm(): FormSchemaDoc {
  const care = defaultCareWorkerForm();
  const pick = (sectionId: string) => care.sections.find((s) => s.id === sectionId)!;
  const rightToWork = pick("practical").fields.find((f) => f.id === "right_to_work")!;
  const earliestStart = pick("practical").fields.find((f) => f.id === "earliest_start")!;
  return formSchemaDoc.parse({
    introText:
      "Thank you for your interest in joining Unique Care UK. This short application takes about 5 minutes — your progress is saved automatically on this device.",
    thankYouText: care.thankYouText,
    sections: [
      pick("about_you"),
      pick("cv"),
      {
        id: "experience",
        title: "Your experience",
        fields: [
          { id: "current_employer", type: "short_text", label: "Current or most recent employer", required: false, useInAi: true },
          { id: "current_role", type: "short_text", label: "Your role there", required: false, useInAi: true },
          {
            id: "experience_statement", type: "long_text",
            label: "Tell us about your relevant experience and why you want this role",
            required: true, useInAi: true,
            validation: { minChars: 200, maxChars: 2000 },
            help: "Between 200 and 2000 characters.",
          },
        ],
      },
      { id: "practical", title: "Practical details", fields: [rightToWork, earliestStart] },
      { id: REQUIREMENT_SECTION_ID, title: "About this role", description: "Tell us how you meet what this role needs.", fields: [] },
      pick("consent"),
    ],
  });
}

/** Build the default "Care Worker — Standard" template (fully editable; core fields locked). */
export function defaultCareWorkerForm(): FormSchemaDoc {
  return formSchemaDoc.parse({
    introText:
      "Thank you for your interest in joining Unique Care UK. This short application takes about 5 minutes — your progress is saved automatically on this device.",
    thankYouText:
      "Thank you — your application has been received. We have emailed you a confirmation and our team will review your application shortly. You can track progress any time through your personal candidate portal.",
    sections: [
      {
        id: "about_you",
        title: "About you",
        fields: [
          { id: "first_name", type: "short_text", label: "First name", required: true, locked: true, useInAi: false },
          { id: "last_name", type: "short_text", label: "Last name", required: true, locked: true, useInAi: false },
          { id: "email", type: "email", label: "Email address", required: true, locked: true, useInAi: false, help: "We send your confirmation and updates here." },
          { id: "mobile", type: "uk_phone", label: "Mobile number", required: true, locked: true, useInAi: false },
          { id: "postcode", type: "uk_postcode", label: "Home postcode", required: true, locked: false, useInAi: false, help: "We use this to match you to nearby rounds." },
        ],
      },
      {
        id: "cv",
        title: "Your CV",
        description: "Upload your latest CV — PDF, DOC or DOCX, up to 10 MB.",
        fields: [
          {
            id: "cv_upload", type: "file_upload", label: "Upload your CV", required: true, locked: true, useInAi: true,
            validation: { fileTypes: [".pdf", ".doc", ".docx"], maxMb: 10 },
            help: "PDF, DOC or DOCX · max 10 MB",
          },
        ],
      },
      {
        id: "experience",
        title: "Your experience",
        fields: [
          {
            id: "years_experience", type: "single_choice", label: "How many years of care experience do you have?", required: true, useInAi: true, requirementKey: "experience",
            options: [
              { value: "0", label: "None yet — I'm new to care" },
              { value: "under_1", label: "Less than 1 year" },
              { value: "1_2", label: "1–2 years" },
              { value: "3_5", label: "3–5 years" },
              { value: "5_plus", label: "More than 5 years" },
            ],
          },
          {
            id: "care_settings", type: "multiple_choice", label: "Which care settings have you worked in?", required: false, useInAi: true,
            options: [
              { value: "domiciliary", label: "Domiciliary / home care" },
              { value: "residential", label: "Residential care home" },
              { value: "nursing", label: "Nursing home" },
              { value: "supported_living", label: "Supported living" },
              { value: "hospital", label: "Hospital" },
              { value: "informal", label: "Caring for a family member or friend" },
            ],
          },
          {
            id: "specialist_experience", type: "multiple_choice", label: "Any specialist experience?", required: false, useInAi: true,
            options: [
              { value: "dementia", label: "Dementia care" },
              { value: "palliative", label: "Palliative / end of life" },
              { value: "medication", label: "Medication administration" },
              { value: "moving_handling", label: "Moving and handling equipment" },
              { value: "peg_feeding", label: "PEG feeding" },
              { value: "learning_disability", label: "Learning disabilities" },
              { value: "mental_health", label: "Mental health support" },
            ],
          },
          {
            id: "qualifications", type: "multiple_choice", label: "Qualifications", required: false, useInAi: true,
            options: [
              { value: "care_certificate", label: "Care Certificate" },
              { value: "nvq2", label: "NVQ/QCF Level 2 in Health & Social Care" },
              { value: "nvq3", label: "NVQ/QCF Level 3 in Health & Social Care" },
              { value: "first_aid", label: "First Aid at Work" },
              { value: "other", label: "Other relevant qualification" },
              { value: "none", label: "None yet" },
            ],
          },
          { id: "current_employer", type: "short_text", label: "Current or most recent employer", required: false, useInAi: true },
          { id: "current_role", type: "short_text", label: "Your role there", required: false, useInAi: true },
          {
            id: "experience_statement", type: "long_text",
            label: "Tell us about your experience and why you want to work in care",
            required: true, useInAi: true, requirementKey: "values",
            validation: { minChars: 500, maxChars: 2000 },
            help: "Between 500 and 2000 characters.",
          },
        ],
      },
      {
        id: "practical",
        title: "Practical details",
        fields: [
          {
            id: "right_to_work", type: "single_choice", label: "Do you have the right to work in the UK?", required: true, useInAi: true, requirementKey: "right_to_work",
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
              { value: "sponsorship", label: "I would need sponsorship" },
            ],
            knockoutRule: { op: "equals", value: "no", message: "No right to work in the UK declared — needs human review" },
          },
          { id: "driving_licence", type: "yes_no", label: "Do you hold a full UK driving licence?", required: true, useInAi: true, requirementKey: "driving" },
          { id: "own_car", type: "yes_no", label: "Do you have access to a car for work?", required: true, useInAi: true },
          {
            id: "availability", type: "availability_grid", label: "When are you available to work?", required: true, useInAi: true,
            help: "Tick all the times you could regularly cover.",
          },
          { id: "earliest_start", type: "date", label: "Earliest start date", required: true, useInAi: false },
          {
            id: "dbs_update_service", type: "yes_no",
            label: "Are you on the DBS Update Service?", required: true, useInAi: true,
            help: "An enhanced DBS check is required for this role — we arrange it during onboarding.",
          },
        ],
      },
      {
        id: "job_questions",
        title: "A few questions about this role",
        description: "These questions are specific to this vacancy.",
        fields: [],
      },
      {
        id: "consent",
        title: "Consent",
        fields: [
          {
            id: "privacy_consent", type: "consent", required: true, locked: true, useInAi: false,
            label: "I consent to Unique Care UK processing my personal data for recruitment purposes under UK GDPR. My data is held securely and I can ask for it to be removed at any time.",
          },
          {
            id: "keep_details", type: "consent", required: false, useInAi: false,
            label: "Keep my details and contact me about similar roles in future (optional).",
          },
        ],
      },
    ],
  });
}
