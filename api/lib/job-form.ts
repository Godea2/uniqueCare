import { TRPCError } from "@trpc/server";
import { db } from "../db";
import type { ApplicationForms, ApplicationFormTemplates, ApplicationFormVersions, JobPostings } from "@db/schema";
import {
  defaultCareWorkerForm, defaultGeneralForm, formSchemaDoc, jobRequirementSchema, requirementKeyFromLabel,
  syncRequirementQuestions, LOCKED_FIELD_IDS,
  type FormSchemaDoc, type JobRequirement,
} from "@contracts/form-schema";

export const CARE_TEMPLATE_NAME = "Care Worker — Standard";
export const GENERAL_TEMPLATE_NAME = "General role — Standard";

/** Make sure the two standard templates exist, so every database can create jobs. */
export async function ensureStandardTemplates(): Promise<void> {
  const existing = await db.from("applicationFormTemplates").many<ApplicationFormTemplates>();
  const names = new Set(existing.map((t) => t.name));
  const missing = [
    { name: CARE_TEMPLATE_NAME, schema: defaultCareWorkerForm() },
    { name: GENERAL_TEMPLATE_NAME, schema: defaultGeneralForm() },
  ].filter((t) => !names.has(t.name));
  for (const t of missing) {
    await db.from("applicationFormTemplates").insert({
      name: t.name, status: "active", schemaJson: t.schema as never, createdBy: "System",
    });
  }
}

/** Core fields must exist on every form; they stay locked and required. */
export function enforceLocked(schema: FormSchemaDoc): FormSchemaDoc {
  const flat = schema.sections.flatMap((s) => s.fields);
  for (const id of LOCKED_FIELD_IDS) {
    const f = flat.find((x) => x.id === id);
    if (!f) throw new TRPCError({ code: "BAD_REQUEST", message: `Core field "${id}" cannot be removed from the form.` });
    f.locked = true;
    f.required = true;
  }
  return schema;
}

/** Validate requirements from the client and give every one a stable, readable key. */
export function normaliseRequirements(
  input: { key?: string; label: string; weight: number; type?: string; required: boolean }[],
): JobRequirement[] {
  const taken = new Set<string>();
  const out: JobRequirement[] = [];
  for (const r of input) {
    const label = r.label.trim();
    if (!label) continue;
    const wanted = (r.key ?? "").trim();
    const generic = !wanted || /^req_\d+$/.test(wanted) || !/^[a-z][a-z0-9_]*$/.test(wanted);
    const key = generic || taken.has(wanted) ? requirementKeyFromLabel(label, taken) : wanted;
    taken.add(key);
    out.push(jobRequirementSchema.parse({
      key, label, weight: Math.max(0, Math.min(100, Math.round(r.weight))),
      type: r.required ? "hard" : "scored", required: r.required,
    }));
  }
  return out;
}

export function jobRequirements(job: Pick<JobPostings, "requirements">): JobRequirement[] {
  const raw = Array.isArray(job.requirements) ? job.requirements : [];
  return raw.flatMap((r) => {
    const parsed = jobRequirementSchema.safeParse(r);
    return parsed.success ? [parsed.data] : [];
  });
}

async function templateSchema(templateId: number | null | undefined) {
  await ensureStandardTemplates();
  const tpl = templateId
    ? await db.from("applicationFormTemplates").eq("id", templateId).first<ApplicationFormTemplates>()
    : await db.from("applicationFormTemplates").eq("name", CARE_TEMPLATE_NAME).first<ApplicationFormTemplates>();
  if (templateId && !tpl) throw new TRPCError({ code: "NOT_FOUND", message: "Form template not found" });
  const parsed = tpl ? formSchemaDoc.safeParse(tpl.schemaJson) : null;
  return {
    templateId: tpl ? Number(tpl.id) : null,
    name: tpl?.name ?? CARE_TEMPLATE_NAME,
    schema: parsed?.success ? parsed.data : defaultCareWorkerForm(),
  };
}

/** Publish `schema` as a new immutable version unless it matches the live one. */
export async function publishIfChanged(form: ApplicationForms, schema: FormSchemaDoc, by: string) {
  const live = form.publishedVersionId
    ? await db.from("applicationFormVersions").eq("id", form.publishedVersionId).first<ApplicationFormVersions>()
    : null;
  if (live && JSON.stringify(live.schemaJson) === JSON.stringify(schema)) {
    return { versionId: Number(live.id), version: live.version, changed: false };
  }
  const last = await db.from("applicationFormVersions").eq("formId", form.id).order("version", "desc").first<ApplicationFormVersions>();
  const version = (last?.version ?? 0) + 1;
  const [row] = await db.from("applicationFormVersions").insert<{ id: number }>({
    formId: form.id, version, schemaJson: schema as never, publishedBy: by,
  });
  await db.from("applicationForms").eq("id", form.id).update({ publishedVersionId: row.id, updatedAt: new Date() });
  return { versionId: row.id, version, changed: true };
}

/**
 * The published form a candidate sees for a live job, guaranteed to ask every
 * screening requirement. Jobs created before requirements drove the form are
 * repaired here on first view, without publishing anyone's unfinished draft.
 */
export async function liveApplicationSchema(job: JobPostings): Promise<{ schema: FormSchemaDoc; versionId: number | null }> {
  const reqs = jobRequirements(job);
  let form = job.applicationFormId
    ? await db.from("applicationForms").eq("id", job.applicationFormId).first<ApplicationForms>()
    : await db.from("applicationForms").eq("jobPostingId", job.id).first<ApplicationForms>();
  if (!form?.publishedVersionId) {
    await syncJobForm(job, { by: "System (requirements sync)", publish: true });
    form = await db.from("applicationForms").eq("jobPostingId", job.id).first<ApplicationForms>();
  }
  const live = form?.publishedVersionId
    ? await db.from("applicationFormVersions").eq("id", form.publishedVersionId).first<ApplicationFormVersions>()
    : null;
  const parsed = live ? formSchemaDoc.safeParse(live.schemaJson) : null;
  if (!form || !live || !parsed?.success) return { schema: defaultCareWorkerForm(), versionId: null };

  let synced: FormSchemaDoc;
  try {
    synced = enforceLocked(syncRequirementQuestions(parsed.data, reqs));
  } catch {
    return { schema: parsed.data, versionId: Number(live.id) };
  }
  if (JSON.stringify(synced) === JSON.stringify(parsed.data)) return { schema: parsed.data, versionId: Number(live.id) };
  const res = await publishIfChanged(form, synced, "System (requirements sync)");
  return { schema: synced, versionId: res.versionId };
}

/**
 * Keep a job's application form in step with its screening requirements.
 * Creates the form from a template when the job has none, or when `templateId` asks for a new one.
 * With `publish`, candidates see the result straight away.
 */
export async function syncJobForm(
  job: JobPostings,
  opts: { by: string; publish: boolean; templateId?: number | null },
): Promise<{ formId: number; versionId: number | null }> {
  const reqs = jobRequirements(job);
  let form = await db.from("applicationForms").eq("jobPostingId", job.id).first<ApplicationForms>();

  if (!form || opts.templateId) {
    const tpl = await templateSchema(opts.templateId);
    const draft = enforceLocked(syncRequirementQuestions(tpl.schema, reqs));
    if (form) {
      await db.from("applicationForms").eq("id", form.id).update({
        templateId: tpl.templateId, name: tpl.name, draftSchema: draft as never, updatedAt: new Date(),
      });
    } else {
      const [row] = await db.from("applicationForms").insert<{ id: number }>({
        jobPostingId: job.id, templateId: tpl.templateId, name: tpl.name, draftSchema: draft as never,
      });
      await db.from("jobPostings").eq("id", job.id).update({ applicationFormId: row.id });
    }
    form = (await db.from("applicationForms").eq("jobPostingId", job.id).first<ApplicationForms>())!;
  } else {
    const parsed = formSchemaDoc.safeParse(form.draftSchema);
    const base = parsed.success ? parsed.data : (await templateSchema(form.templateId)).schema;
    const draft = enforceLocked(syncRequirementQuestions(base, reqs));
    if (JSON.stringify(draft) !== JSON.stringify(form.draftSchema)) {
      await db.from("applicationForms").eq("id", form.id).update({ draftSchema: draft as never, updatedAt: new Date() });
      form = { ...form, draftSchema: draft as never };
    }
  }
  if (job.applicationFormId !== form.id) await db.from("jobPostings").eq("id", job.id).update({ applicationFormId: form.id });

  if (!opts.publish) return { formId: Number(form.id), versionId: form.publishedVersionId ?? null };
  const schema = formSchemaDoc.parse(form.draftSchema);
  const res = await publishIfChanged(form, schema, opts.by);
  return { formId: Number(form.id), versionId: res.versionId };
}
