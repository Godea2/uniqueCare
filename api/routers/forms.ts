import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import { db } from "../db";
import type {
  ApplicationForms,
  ApplicationFormTemplates,
  ApplicationFormVersions,
  JobPostings,
} from "@db/schema";
import { getStaff, requireRole, audit } from "../util";
import { callAI } from "../ai/provider";
import {
  formSchemaDoc, defaultCareWorkerForm, LOCKED_FIELD_IDS,
  type FormSchemaDoc,
} from "@contracts/form-schema";

/** Ensure locked core fields are present and marked locked before persisting. */
function enforceLocked(schema: FormSchemaDoc): FormSchemaDoc {
  const flat = schema.sections.flatMap((s) => s.fields);
  for (const id of LOCKED_FIELD_IDS) {
    const f = flat.find((x) => x.id === id);
    if (!f) throw new TRPCError({ code: "BAD_REQUEST", message: `Core field "${id}" cannot be removed from the form.` });
    if (!f.locked) f.locked = true;
    if (!f.required) f.required = true;
  }
  return schema;
}

const aiSuggestSchema = z.object({
  questions: z.array(z.object({
    label: z.string(),
    type: z.enum(["short_text", "long_text", "single_choice", "multiple_choice", "yes_no"]),
    options: z.array(z.string()).optional(),
    rationale: z.string().optional(),
  })).min(1).max(10),
});

export const formsRouter = createRouter({
  /** Templates list with usage counts. */
  templates: authedQuery.query(async () => {
    const tpls = await db.from("applicationFormTemplates").order("updatedAt", "desc").many<ApplicationFormTemplates>();
    const forms = await db.from("applicationForms").many<ApplicationForms>();
    const jobs = await db.from("jobPostings").many<JobPostings>();
    return tpls.map((t) => {
      const usedBy = forms.filter((f) => f.templateId === t.id);
      return {
        ...t,
        jobsUsing: usedBy.length,
        jobTitles: usedBy.map((f) => jobs.find((j) => j.id === f.jobPostingId)?.title ?? "—"),
      };
    });
  }),

  templateDetail: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const tpl = await db.from("applicationFormTemplates").eq("id", input.id).first<ApplicationFormTemplates>();
      if (!tpl) throw new TRPCError({ code: "NOT_FOUND" });
      const forms = await db.from("applicationForms").eq("templateId", tpl.id).many<ApplicationForms>();
      const jobs = await db.from("jobPostings").many<JobPostings>();
      return {
        ...tpl,
        jobs: forms.map((f) => ({ formId: f.id, jobId: f.jobPostingId, title: jobs.find((j) => j.id === f.jobPostingId)?.title ?? "—" })),
      };
    }),

  createTemplate: authedQuery
    .input(z.object({ name: z.string().min(3).max(200), schemaJson: z.unknown().optional() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const parsed = input.schemaJson ? formSchemaDoc.safeParse(input.schemaJson) : null;
      if (input.schemaJson && !parsed!.success) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid form schema" });
      const schema = enforceLocked(parsed?.success ? parsed.data : defaultCareWorkerForm());
      const [row] = await db.from("applicationFormTemplates").insert<{ id: number }>({
        name: input.name, status: "active", schemaJson: schema as never, createdBy: sc.staff.fullName,
      });
      await audit(sc.staff.fullName, "form_template_created", "application_form_templates", row.id, { name: input.name });
      return { id: row.id };
    }),

  updateTemplate: authedQuery
    .input(z.object({ id: z.number(), name: z.string().min(3).max(200).optional(), schemaJson: z.unknown().optional(), status: z.enum(["active", "archived"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const tpl = await db.from("applicationFormTemplates").eq("id", input.id).first<ApplicationFormTemplates>();
      if (!tpl) throw new TRPCError({ code: "NOT_FOUND" });
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name) set.name = input.name;
      if (input.status) set.status = input.status;
      if (input.schemaJson !== undefined) {
        const parsed = formSchemaDoc.safeParse(input.schemaJson);
        if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid form schema" });
        set.schemaJson = enforceLocked(parsed.data) as never;
      }
      await db.from("applicationFormTemplates").eq("id", input.id).update(set);
      await audit(sc.staff.fullName, "form_template_updated", "application_form_templates", input.id);
      return { ok: true };
    }),

  /** Per-job form: draft schema, published version, template info, version history. */
  jobForm: authedQuery
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const form = await db.from("applicationForms").eq("jobPostingId", input.jobId).first<ApplicationForms>();
      if (!form) return null;
      const versions = (await db.from("applicationFormVersions")
        .eq("formId", form.id)
        .order("version", "desc")
        .many<ApplicationFormVersions>())
        .map(({ id, version, publishedBy, createdAt }) => ({ id, version, publishedBy, createdAt }));
      const published = form.publishedVersionId
        ? await db.from("applicationFormVersions").eq("id", form.publishedVersionId).first<ApplicationFormVersions>()
        : null;
      const appCount = await db.from("applications").eq("jobPostingId", input.jobId).count();
      return { form, versions, published, applicationCount: Number(appCount) };
    }),

  /** Pick a template for a job — copies the template schema into the job's form draft. */
  assignTemplate: authedQuery
    .input(z.object({ jobId: z.number(), templateId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const tpl = await db.from("applicationFormTemplates").eq("id", input.templateId).first<ApplicationFormTemplates>();
      if (!tpl) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      const schema = (tpl.schemaJson as FormSchemaDoc | null) ?? defaultCareWorkerForm();
      const existing = await db.from("applicationForms").eq("jobPostingId", input.jobId).first<ApplicationForms>();
      if (existing) {
        await db.from("applicationForms").eq("id", existing.id).update({
          templateId: tpl.id, name: tpl.name, draftSchema: schema as never, updatedAt: new Date(),
        });
        await audit(sc.staff.fullName, "form_template_assigned", "application_forms", existing.id, { template: tpl.name });
        return { formId: Number(existing.id) };
      }
      const [row] = await db.from("applicationForms").insert<{ id: number }>({
        jobPostingId: input.jobId, templateId: tpl.id, name: tpl.name, draftSchema: schema as never,
      });
      const formId = row.id;
      await db.from("jobPostings").eq("id", input.jobId).update({ applicationFormId: formId });
      await audit(sc.staff.fullName, "form_template_assigned", "application_forms", formId, { template: tpl.name });
      return { formId };
    }),

  /** Autosave draft (no publish). */
  saveDraft: authedQuery
    .input(z.object({ formId: z.number(), schemaJson: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "team_leader");
      const parsed = formSchemaDoc.safeParse(input.schemaJson);
      if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid form schema" });
      await db.from("applicationForms").eq("id", input.formId).update({
        draftSchema: enforceLocked(parsed.data) as never, updatedAt: new Date(),
      });
      return { ok: true, savedAt: new Date().toISOString() };
    }),

  /** Publish draft → new immutable version. Applications keep the version they answered. */
  publishForm: authedQuery
    .input(z.object({ formId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const form = await db.from("applicationForms").eq("id", input.formId).first<ApplicationForms>();
      if (!form) throw new TRPCError({ code: "NOT_FOUND" });
      const parsed = formSchemaDoc.safeParse(form.draftSchema);
      if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: "Draft schema is invalid — fix it before publishing." });
      const last = await db.from("applicationFormVersions")
        .eq("formId", form.id)
        .order("version", "desc")
        .first<ApplicationFormVersions>();
      const version = (last?.version ?? 0) + 1;
      const [vr] = await db.from("applicationFormVersions").insert<{ id: number }>({
        formId: form.id, version, schemaJson: enforceLocked(parsed.data) as never, publishedBy: sc.staff.fullName,
      });
      const versionId = vr.id;
      await db.from("applicationForms").eq("id", form.id).update({ publishedVersionId: versionId, updatedAt: new Date() });
      await audit(sc.staff.fullName, "form_published", "application_forms", form.id, { version });
      return { versionId, version };
    }),

  /** Save the current draft as a brand-new reusable template. */
  saveAsTemplate: authedQuery
    .input(z.object({ formId: z.number(), name: z.string().min(3).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const form = await db.from("applicationForms").eq("id", input.formId).first<ApplicationForms>();
      if (!form) throw new TRPCError({ code: "NOT_FOUND" });
      const parsed = formSchemaDoc.safeParse(form.draftSchema);
      if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: "Draft schema is invalid." });
      const [row] = await db.from("applicationFormTemplates").insert<{ id: number }>({
        name: input.name, status: "active", schemaJson: parsed.data as never, createdBy: sc.staff.fullName,
      });
      await audit(sc.staff.fullName, "form_saved_as_template", "application_form_templates", row.id, { name: input.name });
      return { id: row.id };
    }),

  /** AI assist: suggest job-specific questions from the job description. */
  suggestQuestions: authedQuery
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "team_leader");
      const job = await db.from("jobPostings").eq("id", input.jobId).first<JobPostings>();
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      const result = await callAI({
        feature: "suggestFormQuestions", promptVersion: "1.0", schema: aiSuggestSchema, temperature: 0.4,
        validate: (r) => r.questions.length > 0,
        system: `You suggest job-specific application questions for UK domiciliary care roles. Questions must be lawful, non-discriminatory and answerable by applicants. Reply with strict JSON only.`,
        user: `Job title: ${job.title}\n\nJob description:\n${(job.descriptionMd ?? "").slice(0, 5000)}\n\nSuggest 5-8 short application questions specific to THIS role (not generic eligibility, contact details or CV requests — those are already asked). For each: label (the question), type (short_text | long_text | single_choice | multiple_choice | yes_no), options (for choice types), rationale.`,
      });
      return {
        questions: result.questions.map((q, i) => ({
          id: `jq_${Date.now().toString(36)}_${i}`,
          type: q.type,
          label: q.label,
          required: false,
          locked: false,
          useInAi: true,
          options: q.options?.map((o) => ({ value: o.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "").slice(0, 40) || "option", label: o })),
          rationale: q.rationale,
        })),
      };
    }),
});
