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
