import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import { db } from "../db";
import type {
  Appraisals,
  CarePlans,
  ClientChangeEvents,
  Clients,
  ComplianceDocuments,
  DocumentTemplates,
  Incidents,
  PlanReviews,
  StaffProfiles,
  SupervisorNotes,
  TrainingEnrolments,
  VisitAssignments,
  Visits,
} from "@db/schema";
import {
  getStaff, requireRole, audit, notify, notifyRoles,
  CQC_READINESS_ROLES, CQC_INCIDENT_ROLES, CQC_PLAN_ROLES, CQC_PLAN_WRITE_ROLES, OFFICE_ROLES,
} from "../util";
import { callAI, modelName } from "../ai/provider";
import { mergeAiProvenance } from "@contracts/ai-provenance";
import { ensureCarePlanAssessmentTemplate } from "../lib/ensure-care-plan-template";
import { ensureSupportPlanTemplate } from "../lib/ensure-support-plan-template";
import {
  buildSectionGuide,
  formatClientContextForAi,
  loadClientPlanContext,
  mergeStructuredSections,
  seedCarePlanFromClient,
  seedSupportPlanFromClient,
} from "../lib/plan-ai-context";
import {
  CARE_PLAN_ASSESSMENT_SECTIONS,
  emptyCarePlanAssessmentContent,
  flattenSectionForAi,
  isCarePlanAssessmentTemplate,
  type CarePlanAssessmentContent,
} from "@contracts/care-plan-assessment";
import {
  SUPPORT_PLAN_SECTIONS,
  emptySupportPlanContent,
  flattenSupportSectionForAi,
  isSupportPlanTemplate,
  type SupportPlanContent,
} from "@contracts/support-plan";
import {
  CARE_PLAN_REVIEW_SECTIONS,
  REVIEW_CHECKLIST_AREAS,
  REVIEW_TRIGGERS,
  buildReviewSectionGuide,
  emptyCarePlanReviewContent,
  emptyChecklist,
  type CarePlanReviewContent,
  type ChecklistChange,
  type ReviewTrigger,
} from "@contracts/care-plan-review";

const AI_NO_INVENT =
  "CRITICAL RULES: Use ONLY facts from the LIVE CLIENT RECORD and assessor notes below. " +
  "Never invent medical diagnoses, medication names/doses, phone numbers, addresses, DNAR status, or personal details. " +
  "If a field is not supported by those facts, write exactly: \"⚠ Information needed: <what is missing>\". " +
  "Follow each section's Guidance note — write what an assessor would expect under that heading.";

const reviewTriggerSchema = z.enum([
  "annual", "change_in_needs", "hospital_discharge", "incident", "request",
]);

function assertReviewEditable(row: PlanReviews) {
  if (row.status === "completed" || row.lockedAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This review is locked and cannot be edited." });
  }
}

/** Free-text support plans OR nested full-assessment JSON. */
const planContentSchema = z.record(z.string(), z.unknown());

export const cqcRouter = createRouter({
  // ── Templates ──
  templates: authedQuery.query(async ({ ctx }) => {
    requireRole(await getStaff(ctx), ...OFFICE_ROLES);
    return db.from("documentTemplates").order("id", "desc").many<DocumentTemplates>();
  }),

  updateTemplateStructure: authedQuery
    .input(z.object({
      id: z.number(),
      structure: z.array(z.object({ key: z.string(), title: z.string(), guidance: z.string().optional(), required: z.boolean().optional() })),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const existing = await db.from("documentTemplates").eq("id", input.id).first<DocumentTemplates>();
      if (existing && (isCarePlanAssessmentTemplate(existing.structure) || isSupportPlanTemplate(existing.structure))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Structured care/support plan templates are managed in code and cannot be edited here.",
        });
      }
      await db.from("documentTemplates").eq("id", input.id).update({ structure: input.structure as never });
      await audit(sc.staff.fullName, "template_updated", "document_templates", input.id);
      return { ok: true };
    }),

  extractTemplateStructure: authedQuery
    .input(z.object({ text: z.string().min(20), kind: z.enum(["care_plan", "support_plan", "supervisor_note", "offer_letter", "appraisal"]) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const result = await callAI({
        feature: "extractTemplateStructure", promptVersion: "1.0", temperature: 0.2,
        validate: (r) => r.sections.length > 0,
        schema: z.object({
          name: z.string(),
          sections: z.array(z.object({
            key: z.string(), title: z.string(), guidance: z.string().optional(), required: z.boolean().optional(),
          })),
        }),
        system: "Extract the section structure of a care document template. Keys must be snake_case. Reply in strict JSON.",
        user: `Template kind: ${input.kind}\n\nDocument text:\n${input.text.slice(0, 6000)}`,
      });
      const latest = await db.from("documentTemplates").eq("kind", input.kind).order("version", "desc").first<DocumentTemplates>();
      const [row] = await db.from("documentTemplates").insert<DocumentTemplates>({
        kind: input.kind, version: (latest?.version ?? 0) + 1,
        name: result.name, structure: result.sections as never, active: false,
      });
      await audit(sc.staff.fullName, "template_extracted", "document_templates", row.id);
      return { id: row.id, name: result.name, sections: result.sections };
    }),

  activateTemplate: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const tpl = await db.from("documentTemplates").eq("id", input.id).first<DocumentTemplates>();
      if (!tpl) throw new TRPCError({ code: "NOT_FOUND" });
      await db.from("documentTemplates").eq("kind", tpl.kind).update({ active: false });
      await db.from("documentTemplates").eq("id", input.id).update({ active: true });
      return { ok: true };
    }),

  // ── Plans ──
  plans: authedQuery
    .input(z.object({ planType: z.enum(["care", "support"]).optional() }))
    .query(async ({ ctx, input }) => {
      requireRole(await getStaff(ctx), ...CQC_PLAN_ROLES);
      let query = db.from("carePlans").isNull("deletedAt").order("updatedAt", "desc");
      if (input.planType) query = query.eq("planType", input.planType);
      const rows = await query.many<CarePlans>();
      const clientRows = await db.from("clients").many<Clients>();
      return rows.map((p) => ({ ...p, client: clientRows.find((c) => c.id === p.clientId) }));
    }),

  planDetail: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requireRole(await getStaff(ctx), ...CQC_PLAN_ROLES);
      const plan = await db.from("carePlans").eq("id", input.id).first<CarePlans>();
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      const client = await db.from("clients").eq("id", plan.clientId).first<Clients>();
      const template = plan.templateId
        ? await db.from("documentTemplates").eq("id", plan.templateId).first<DocumentTemplates>()
        : null;
      const versions = await db.from("carePlans")
        .eq("clientId", plan.clientId).eq("planType", plan.planType).isNull("deletedAt")
        .order("version", "desc").many<CarePlans>();
      return { plan, client, template, versions };
    }),

  /** Preview next version number before creating (for the create dialog). */
  nextPlanVersion: authedQuery
    .input(z.object({ clientId: z.number(), planType: z.enum(["care", "support"]) }))
    .query(async ({ ctx, input }) => {
      requireRole(await getStaff(ctx), ...CQC_PLAN_ROLES);
      const existing = await db.from("carePlans")
        .eq("clientId", input.clientId).eq("planType", input.planType).isNull("deletedAt")
        .many<CarePlans>();
      const nextVersion = (Math.max(0, ...existing.map((e) => e.version)) || 0) + 1;
      return { nextVersion, existingCount: existing.length };
    }),

  createPlan: authedQuery
    .input(z.object({ clientId: z.number(), planType: z.enum(["care", "support"]) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...CQC_PLAN_WRITE_ROLES);
      const client = await db.from("clients").eq("id", input.clientId).isNull("deletedAt").first<Clients>();
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });

      const tpl = input.planType === "care"
        ? await ensureCarePlanAssessmentTemplate()
        : await ensureSupportPlanTemplate();
      if (!tpl) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `No active ${input.planType} plan template is set up.` });
      }
      const existing = await db.from("carePlans")
        .eq("clientId", input.clientId).eq("planType", input.planType).isNull("deletedAt")
        .many<CarePlans>();
      const version = (Math.max(0, ...existing.map((e) => e.version)) || 0) + 1;
      const initialContent =
        input.planType === "care" && isCarePlanAssessmentTemplate(tpl.structure)
          ? emptyCarePlanAssessmentContent()
          : input.planType === "support" && isSupportPlanTemplate(tpl.structure)
            ? emptySupportPlanContent()
            : {};
      const [row] = await db.from("carePlans").insert<CarePlans>({
        clientId: input.clientId, templateId: tpl.id, planType: input.planType,
        version, status: "draft", content: initialContent as never,
      });
      await audit(sc.staff.fullName, "plan_created", "care_plans", row.id, {
        actorRole: sc.staff.role,
        planType: input.planType,
        version,
        clientRef: client.clientRef,
        clientName: `${client.firstName} ${client.lastName}`,
      });
      return {
        id: row.id,
        version,
        planType: input.planType,
        clientName: `${client.firstName} ${client.lastName}`,
      };
    }),

  /** Live client facts the AI will use (for the Generate dialog preview). */
  planAiContext: authedQuery
    .input(z.object({ planId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireRole(await getStaff(ctx), ...CQC_PLAN_ROLES);
      const plan = await db.from("carePlans").eq("id", input.planId).first<CarePlans>();
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      const context = await loadClientPlanContext(plan.clientId);
      if (!context) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      return {
        planType: plan.planType,
        status: plan.status,
        context,
        factsText: formatClientContextForAi(context),
      };
    }),

  generatePlan: authedQuery
    .input(z.object({
      planId: z.number(),
      /** Optional assessor notes — live client record is always included automatically. */
      inputs: z.record(z.string(), z.string()).optional().default({}),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...CQC_PLAN_WRITE_ROLES);
      const plan = await db.from("carePlans").eq("id", input.planId).first<CarePlans>();
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      if (!["draft", "ai_generated"].includes(plan.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "AI draft can only be generated while the plan is in draft or AI-generated status. Save/approve flows use Save for review.",
        });
      }
      const tpl = plan.templateId
        ? await db.from("documentTemplates").eq("id", plan.templateId).first<DocumentTemplates>()
        : null;
      const clientCtx = await loadClientPlanContext(plan.clientId);
      if (!clientCtx) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      const factsBlock = formatClientContextForAi(clientCtx);
      const assessorNotes = input.inputs ?? {};
      const notesBlock = Object.keys(assessorNotes).length
        ? JSON.stringify(assessorNotes, null, 2)
        : "(No additional assessor notes supplied — use live client record only; flag gaps.)";
      const mdl = modelName();

      if (tpl && isCarePlanAssessmentTemplate(tpl.structure)) {
        const schema = z.object({
          sections: z.record(z.string(), z.record(z.string(), z.string())),
        });
        const result = await callAI({
          feature: "generateCarePlanAssessment", promptVersion: "2.0", temperature: 0.25, schema,
          validate: (r) => Object.keys(r.sections).length > 0,
          system: `You complete a UK domiciliary care FULL ASSESSMENT care plan. Return JSON { sections: { [sectionKey]: { [fieldKey]: string } } }. ${AI_NO_INVENT} Do not invent visit times or medication charts. Leave visit_schedule and level_of_assistance empty (manager fills those tables).`,
          user: `LIVE CLIENT RECORD:\n${factsBlock}\n\nASSESSOR NOTES:\n${notesBlock}\n\nSECTION GUIDANCE (follow each heading):\n${buildSectionGuide("care")}`,
        });
        const seeded = seedCarePlanFromClient(clientCtx);
        const fieldKeys = CARE_PLAN_ASSESSMENT_SECTIONS.filter((s) => s.layout === "fields").map((s) => s.key);
        const content = mergeStructuredSections(seeded, result.sections, new Set(fieldKeys));
        const aiProvenance = mergeAiProvenance(plan.aiProvenance, {
          sectionKeys: fieldKeys, actorName: sc.staff.fullName, model: mdl, source: "generate",
        });
        await db.from("carePlans").eq("id", plan.id).update({
          status: "ai_generated", inputs: assessorNotes as never,
          content: content as never, aiModel: mdl, aiGeneratedAt: new Date(),
          aiProvenance: aiProvenance as never,
        });
        await audit(sc.staff.fullName, "plan_ai_generated", "care_plans", plan.id, {
          actorRole: sc.staff.role, planType: plan.planType, sections: fieldKeys, model: mdl,
        });
        return { content, status: "ai_generated" as const, aiProvenance };
      }

      if (tpl && isSupportPlanTemplate(tpl.structure)) {
        const schema = z.object({
          sections: z.record(z.string(), z.record(z.string(), z.string())),
        });
        const result = await callAI({
          feature: "generateSupportPlan", promptVersion: "2.0", temperature: 0.3, schema,
          validate: (r) => Object.keys(r.sections).length > 0,
          system: `You write a UK domiciliary care PERSON-CENTRED SUPPORT PLAN in the person's voice ("I like…", "I want…") where suitable. Return JSON { sections: { [sectionKey]: { [fieldKey]: string } } }. ${AI_NO_INVENT} Leave support_visits empty (manager fills the visit table).`,
          user: `LIVE CLIENT RECORD:\n${factsBlock}\n\nASSESSOR / CONVERSATION NOTES:\n${notesBlock}\n\nSECTION GUIDANCE (follow each heading):\n${buildSectionGuide("support")}`,
        });
        const seeded = seedSupportPlanFromClient(clientCtx);
        const fieldKeys = SUPPORT_PLAN_SECTIONS.filter((s) => s.layout === "fields").map((s) => s.key);
        const content = mergeStructuredSections(seeded, result.sections, new Set(fieldKeys));
        const aiProvenance = mergeAiProvenance(plan.aiProvenance, {
          sectionKeys: fieldKeys, actorName: sc.staff.fullName, model: mdl, source: "generate",
        });
        await db.from("carePlans").eq("id", plan.id).update({
          status: "ai_generated", inputs: assessorNotes as never,
          content: content as never, aiModel: mdl, aiGeneratedAt: new Date(),
          aiProvenance: aiProvenance as never,
        });
        await audit(sc.staff.fullName, "plan_ai_generated", "care_plans", plan.id, {
          actorRole: sc.staff.role, planType: plan.planType, sections: fieldKeys, model: mdl,
        });
        return { content, status: "ai_generated" as const, aiProvenance };
      }

      const structure = (tpl?.structure as { key: string; title: string; guidance?: string }[]) ?? [];
      const schema = z.object({ sections: z.record(z.string(), z.string()) });
      const result = await callAI({
        feature: "generatePlan", promptVersion: "2.0", temperature: 0.35, schema,
        validate: (r) => Object.keys(r.sections).length > 0,
        system: `You write ${plan.planType} plans for a UK domiciliary care provider. Person-centred, plain UK English. ${AI_NO_INVENT} Return strict JSON keyed by section key.`,
        user: `LIVE CLIENT RECORD:\n${factsBlock}\n\nASSESSOR NOTES:\n${notesBlock}\n\nWrite one section per key (follow guidance):\n${structure.map((s) => `- ${s.key}: ${s.title}${s.guidance ? ` — ${s.guidance}` : ""}`).join("\n")}`,
      });
      const sectionKeys = Object.keys(result.sections);
      const aiProvenance = mergeAiProvenance(plan.aiProvenance, {
        sectionKeys, actorName: sc.staff.fullName, model: mdl, source: "generate",
      });
      await db.from("carePlans").eq("id", plan.id).update({
        status: "ai_generated", inputs: assessorNotes as never,
        content: result.sections as never, aiModel: mdl, aiGeneratedAt: new Date(),
        aiProvenance: aiProvenance as never,
      });
      await audit(sc.staff.fullName, "plan_ai_generated", "care_plans", plan.id, {
        actorRole: sc.staff.role, planType: plan.planType, sections: sectionKeys, model: mdl,
      });
      return { content: result.sections, status: "ai_generated" as const, aiProvenance };
    }),

  regenerateSection: authedQuery
    .input(z.object({ planId: z.number(), sectionKey: z.string(), instruction: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...CQC_PLAN_WRITE_ROLES);
      const plan = await db.from("carePlans").eq("id", input.planId).first<CarePlans>();
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      const tpl = plan.templateId ? await db.from("documentTemplates").eq("id", plan.templateId).first<DocumentTemplates>() : null;

      const clientCtx = await loadClientPlanContext(plan.clientId);
      const factsBlock = clientCtx ? formatClientContextForAi(clientCtx) : "(client record unavailable)";
      const instruction = input.instruction?.trim() || "Improve clarity and completeness using only known facts from the live client record and assessor notes.";
      const mdl = modelName();

      async function finishRegen(content: unknown, fields?: Record<string, string>, text?: string) {
        const aiProvenance = mergeAiProvenance(plan!.aiProvenance, {
          sectionKeys: [input.sectionKey], actorName: sc.staff.fullName, model: mdl, source: "regenerate",
        });
        await db.from("carePlans").eq("id", plan!.id).update({
          content: content as never,
          aiProvenance: aiProvenance as never,
        });
        await audit(sc.staff.fullName, "plan_section_ai_regenerated", "care_plans", plan!.id, {
          actorRole: sc.staff.role, sectionKey: input.sectionKey, instruction, model: mdl,
        });
        return { text: text ?? "", fields, aiProvenance };
      }

      if (tpl && isCarePlanAssessmentTemplate(tpl.structure)) {
        const sec = CARE_PLAN_ASSESSMENT_SECTIONS.find((s) => s.key === input.sectionKey);
        if (!sec || sec.layout !== "fields") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "AI regenerate is only available for text field sections. Edit visit schedule and assistance levels directly." });
        }
        const current = (plan.content as CarePlanAssessmentContent)?.[input.sectionKey] ?? {};
        const schema = z.object({ fields: z.record(z.string(), z.string()) });
        const result = await callAI({
          feature: "regenerateCarePlanAssessmentSection", promptVersion: "2.0", temperature: 0.25, schema,
          system: `Rewrite ONE section of a UK full-assessment care plan. Return JSON { fields: { fieldKey: value } }. ${AI_NO_INVENT}`,
          user: `Section: ${sec.title}\nGuidance: ${sec.guidance ?? ""}\nFields: ${(sec.fields ?? []).map((f) => `${f.key} (${f.label})`).join(", ")}\n\nLIVE CLIENT RECORD:\n${factsBlock}\n\nAssessor notes: ${JSON.stringify(plan.inputs)}\n\nCurrent draft:\n${flattenSectionForAi(input.sectionKey, current)}\n\nInstruction: ${instruction}`,
        });
        const content = { ...((plan.content as CarePlanAssessmentContent) ?? emptyCarePlanAssessmentContent()) };
        content[input.sectionKey] = { ...current, ...result.fields };
        return finishRegen(content, result.fields, flattenSectionForAi(input.sectionKey, content[input.sectionKey]));
      }

      if (tpl && isSupportPlanTemplate(tpl.structure)) {
        const sec = SUPPORT_PLAN_SECTIONS.find((s) => s.key === input.sectionKey);
        if (!sec || sec.layout !== "fields") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "AI regenerate is only available for text field sections. Edit support visits directly." });
        }
        const current = (plan.content as SupportPlanContent)?.[input.sectionKey] ?? {};
        const schema = z.object({ fields: z.record(z.string(), z.string()) });
        const result = await callAI({
          feature: "regenerateSupportPlanSection", promptVersion: "2.0", temperature: 0.3, schema,
          system: `Rewrite ONE section of a UK person-centred support plan. Return JSON { fields: { fieldKey: value } }. ${AI_NO_INVENT}`,
          user: `Section: ${sec.title}\nGuidance: ${sec.guidance ?? ""}\nFields: ${(sec.fields ?? []).map((f) => `${f.key} (${f.label})`).join(", ")}\n\nLIVE CLIENT RECORD:\n${factsBlock}\n\nAssessor notes: ${JSON.stringify(plan.inputs)}\n\nCurrent draft:\n${flattenSupportSectionForAi(input.sectionKey, current)}\n\nInstruction: ${instruction}`,
        });
        const content = { ...((plan.content as SupportPlanContent) ?? emptySupportPlanContent()) };
        content[input.sectionKey] = { ...current, ...result.fields };
        return finishRegen(content, result.fields, flattenSupportSectionForAi(input.sectionKey, content[input.sectionKey]));
      }

      const sec = ((tpl?.structure as { key: string; title: string; guidance?: string }[]) ?? []).find((s) => s.key === input.sectionKey);
      const current = (plan.content as Record<string, string>)?.[input.sectionKey] ?? "";
      const result = await callAI({
        feature: "regeneratePlanSection", promptVersion: "2.0", temperature: 0.35,
        schema: z.object({ text: z.string() }),
        system: `Rewrite one section of a UK care/support plan. ${AI_NO_INVENT}`,
        user: `Section: ${sec?.title ?? input.sectionKey}\nGuidance: ${sec?.guidance ?? ""}\n\nLIVE CLIENT RECORD:\n${factsBlock}\n\nAssessor notes: ${JSON.stringify(plan.inputs)}\n\nCurrent draft:\n${current}\n\nInstruction: ${instruction}`,
      });
      const content = { ...((plan.content as Record<string, string>) ?? {}), [input.sectionKey]: result.text };
      return finishRegen(content, undefined, result.text);
    }),

  savePlanContent: authedQuery
    .input(z.object({ planId: z.number(), content: planContentSchema }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...CQC_PLAN_WRITE_ROLES);
      await db.from("carePlans").eq("id", input.planId).update({ content: input.content as never, status: "in_review" });
      await audit(sc.staff.fullName, "plan_submitted_for_review", "care_plans", input.planId, {
        actorRole: sc.staff.role,
      });
      return { ok: true };
    }),

  approvePlan: authedQuery
    .input(z.object({ planId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...CQC_PLAN_WRITE_ROLES);
      const plan = await db.from("carePlans").eq("id", input.planId).first<CarePlans>();
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      // supersede older approved versions
      await db.from("carePlans")
        .eq("clientId", plan.clientId).eq("planType", plan.planType).eq("status", "approved")
        .update({ status: "superseded" });
      const reviewDue = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
      await db.from("carePlans").eq("id", plan.id).update({
        status: "approved", approvedBy: sc.staff.fullName, approvedAt: new Date(), nextReviewDue: reviewDue,
      });
      await db.from("planReviews").insert({
        planType: plan.planType, planId: plan.id, clientId: plan.clientId,
        dueDate: reviewDue, trigger: "annual", status: "due",
        content: emptyCarePlanReviewContent() as never,
      });
      await audit(sc.staff.fullName, "plan_approved", "care_plans", plan.id, {
        actorRole: sc.staff.role,
        planType: plan.planType,
        version: plan.version,
        nextReviewDue: reviewDue,
        hadAiDraft: !!plan.aiGeneratedAt,
        approvedBy: sc.staff.fullName,
      });
      return { ok: true, nextReviewDue: reviewDue };
    }),

  // ── Reviews & change events ──
  reviews: authedQuery.query(async ({ ctx }) => {
    requireRole(await getStaff(ctx), ...CQC_PLAN_ROLES);
    const rows = await db.from("planReviews").order("dueDate", "asc").many<PlanReviews>();
    const clientRows = await db.from("clients").many<Clients>();
    return rows.map((r) => ({
      ...r,
      client: clientRows.find((c) => c.id === r.clientId),
      hasReport: !!(r.content && typeof r.content === "object"),
      isLocked: !!(r.lockedAt || r.status === "completed"),
    }));
  }),

  reviewDetail: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requireRole(await getStaff(ctx), ...CQC_PLAN_ROLES);
      const review = await db.from("planReviews").eq("id", input.id).first<PlanReviews>();
      if (!review) throw new TRPCError({ code: "NOT_FOUND" });
      const plan = await db.from("carePlans").eq("id", review.planId).first<CarePlans>();
      const client = review.clientId
        ? await db.from("clients").eq("id", review.clientId).first<Clients>()
        : null;
      const changeEvents = review.clientId
        ? await db.from("clientChangeEvents").eq("clientId", review.clientId).order("occurredAt", "desc").limit(50).many<ClientChangeEvents>()
        : [];
      const since = plan?.approvedAt ? new Date(plan.approvedAt) : null;
      const eventsSinceApproval = since
        ? changeEvents.filter((e) => new Date(e.occurredAt) >= since)
        : changeEvents;
      const content = (review.content as CarePlanReviewContent | null)
        ?? emptyCarePlanReviewContent();
      return {
        review,
        plan,
        client,
        changeEvents: eventsSinceApproval,
        content,
        sections: CARE_PLAN_REVIEW_SECTIONS,
        checklistAreas: REVIEW_CHECKLIST_AREAS,
        triggers: REVIEW_TRIGGERS,
        isLocked: !!(review.lockedAt || review.status === "completed"),
      };
    }),

  /**
   * Start a review from an approved plan (or resume an open due/overdue row).
   * Triggers: annual | change_in_needs | hospital_discharge | incident | request
   */
  startReviewFromPlan: authedQuery
    .input(z.object({
      planId: z.number(),
      trigger: reviewTriggerSchema.default("annual"),
      dueDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...CQC_PLAN_WRITE_ROLES);
      const plan = await db.from("carePlans").eq("id", input.planId).isNull("deletedAt").first<CarePlans>();
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      if (plan.status !== "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reviews can only be started from an approved plan." });
      }

      const open = await db.from("planReviews")
        .eq("planId", plan.id)
        .notIn("status", ["completed", "cancelled"])
        .order("dueDate", "asc")
        .first<PlanReviews>();

      if (open) {
        await db.from("planReviews").eq("id", open.id).update({
          status: "in_progress",
          content: (open.content as never) ?? (emptyCarePlanReviewContent() as never),
          updatedAt: new Date(),
        });
        await audit(sc.staff.fullName, "review_started", "plan_reviews", open.id, {
          actorRole: sc.staff.role,
          trigger: open.trigger,
          planId: plan.id,
          resumed: true,
          startedBy: sc.staff.fullName,
        });
        return { id: open.id, created: false };
      }

      const dueDate = input.dueDate
        ?? (plan.nextReviewDue || new Date().toISOString().slice(0, 10));
      const [row] = await db.from("planReviews").insert<PlanReviews>({
        planType: plan.planType,
        planId: plan.id,
        clientId: plan.clientId,
        dueDate,
        trigger: input.trigger,
        status: "in_progress",
        content: emptyCarePlanReviewContent() as never,
        meetingNotes: null,
      });
      await audit(sc.staff.fullName, "review_started", "plan_reviews", row.id, {
        actorRole: sc.staff.role,
        trigger: input.trigger,
        planId: plan.id,
        dueDate,
        startedBy: sc.staff.fullName,
      });
      return { id: row.id, created: true };
    }),

  /** Mark a scheduled review in progress (from the list). */
  startReview: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...CQC_PLAN_WRITE_ROLES);
      const row = await db.from("planReviews").eq("id", input.id).first<PlanReviews>();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Review not found" });
      assertReviewEditable(row);
      await db.from("planReviews").eq("id", input.id).update({
        status: "in_progress",
        content: (row.content as never) ?? (emptyCarePlanReviewContent() as never),
        updatedAt: new Date(),
      });
      await audit(sc.staff.fullName, "review_started", "plan_reviews", input.id, {
        actorRole: sc.staff.role,
        trigger: row.trigger,
        startedBy: sc.staff.fullName,
      });
      return { ok: true, id: row.id };
    }),

  saveReviewMeetingNotes: authedQuery
    .input(z.object({ id: z.number(), meetingNotes: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...CQC_PLAN_WRITE_ROLES);
      const row = await db.from("planReviews").eq("id", input.id).first<PlanReviews>();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      assertReviewEditable(row);
      await db.from("planReviews").eq("id", input.id).update({
        meetingNotes: input.meetingNotes,
        status: row.status === "due" || row.status === "overdue" ? "in_progress" : row.status,
        updatedAt: new Date(),
      });
      return { ok: true };
    }),

  saveReviewContent: authedQuery
    .input(z.object({ id: z.number(), content: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...CQC_PLAN_WRITE_ROLES);
      const row = await db.from("planReviews").eq("id", input.id).first<PlanReviews>();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      assertReviewEditable(row);
      await db.from("planReviews").eq("id", input.id).update({
        content: input.content as never,
        status: "in_progress",
        updatedAt: new Date(),
      });
      return { ok: true };
    }),

  /**
   * AI review report: manager notes + approved plan + change events since approval.
   * Checklist defaults to "No change" unless notes indicate otherwise.
   */
  generateReviewReport: authedQuery
    .input(z.object({
      id: z.number(),
      meetingNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...CQC_PLAN_WRITE_ROLES);
      const review = await db.from("planReviews").eq("id", input.id).first<PlanReviews>();
      if (!review) throw new TRPCError({ code: "NOT_FOUND" });
      assertReviewEditable(review);

      const plan = await db.from("carePlans").eq("id", review.planId).first<CarePlans>();
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Linked plan not found" });

      const meetingNotes = (input.meetingNotes ?? review.meetingNotes ?? "").trim();
      if (meetingNotes) {
        await db.from("planReviews").eq("id", review.id).update({ meetingNotes, updatedAt: new Date() });
      }

      const clientCtx = await loadClientPlanContext(plan.clientId);
      const factsBlock = clientCtx ? formatClientContextForAi(clientCtx) : "Client record unavailable";
      const changeEvents = await db.from("clientChangeEvents")
        .eq("clientId", plan.clientId).order("occurredAt", "desc").limit(40).many<ClientChangeEvents>();
      const since = plan.approvedAt ? new Date(plan.approvedAt) : null;
      const eventsSince = (since
        ? changeEvents.filter((e) => new Date(e.occurredAt) >= since)
        : changeEvents
      ).map((e) => ({
        type: e.type,
        description: e.description,
        occurredAt: e.occurredAt,
        reportedBy: e.reportedBy,
      }));

      const schema = z.object({
        sections: z.record(z.string(), z.record(z.string(), z.string())),
        checklist: z.record(z.string(), z.object({
          change: z.enum(["no_change", "changed", "not_applicable"]),
          notes: z.string().optional().default(""),
        })).optional().default({}),
      });

      const mdl = modelName();
      const result = await callAI({
        feature: "generateCarePlanReview", promptVersion: "1.0", temperature: 0.25, schema,
        validate: (r) => Object.keys(r.sections).length > 0,
        system: `You complete a UK domiciliary care PLAN REVIEW REPORT matching the paper review form. ` +
          `Return JSON { sections: { [sectionKey]: { [fieldKey]: string } }, checklist: { [areaKey]: { change, notes } } }. ` +
          `${AI_NO_INVENT} ` +
          `For the 21-area checklist: default EVERY area to change="no_change" with empty notes UNLESS the manager notes or change events clearly indicate that area changed — then use change="changed" and brief notes. ` +
          `Do not invent incidents. Summarise change events factually. Leave visit tables alone.`,
        user: [
          `Review trigger: ${review.trigger}`,
          `Plan type: ${plan.planType} v${plan.version} (status ${plan.status})`,
          `\nLIVE CLIENT RECORD:\n${factsBlock}`,
          `\nCURRENT APPROVED PLAN CONTENT:\n${JSON.stringify(plan.content, null, 2).slice(0, 14000)}`,
          `\nCHANGE EVENTS SINCE PLAN APPROVED:\n${eventsSince.length ? JSON.stringify(eventsSince, null, 2) : "(none recorded)"}`,
          `\nMANAGER MEETING NOTES:\n${meetingNotes || "(none supplied — use plan + change events only; flag gaps)"}`,
          `\nSECTION GUIDANCE:\n${buildReviewSectionGuide()}`,
        ].join("\n"),
      });

      const content = emptyCarePlanReviewContent();
      const draftedKeys: string[] = [];
      for (const sec of CARE_PLAN_REVIEW_SECTIONS) {
        if (sec.layout !== "fields") continue;
        const aiFields = result.sections[sec.key] ?? {};
        content[sec.key] = { ...(content[sec.key] as object), ...aiFields };
        draftedKeys.push(sec.key);
      }
      // Checklist is AI-influenced when overlay applied
      draftedKeys.push("section_change_checklist");

      // Seed sign-off compiler from current user if empty
      const signOff = content.sign_off as Record<string, string>;
      if (!signOff.compiledBy) signOff.compiledBy = sc.staff.fullName;
      if (!signOff.compiledDate) signOff.compiledDate = new Date().toISOString().slice(0, 10);

      // Checklist: start No change, overlay AI only where changed/N/A or notes
      const areas = emptyChecklist();
      for (const a of REVIEW_CHECKLIST_AREAS) {
        const ai = result.checklist?.[a.key];
        if (ai && (ai.change === "changed" || ai.change === "not_applicable" || (ai.notes && ai.notes.trim()))) {
          areas[a.key] = {
            change: ai.change as ChecklistChange,
            notes: ai.notes ?? "",
          };
        }
      }
      content.section_change_checklist = { areas };

      // Prefill attendees date
      const attendees = content.attendees_method as Record<string, string>;
      if (!attendees.reviewDate) attendees.reviewDate = new Date().toISOString().slice(0, 10);

      const aiProvenance = mergeAiProvenance(review.aiProvenance, {
        sectionKeys: draftedKeys, actorName: sc.staff.fullName, model: mdl, source: "review_generate",
      });
      await db.from("planReviews").eq("id", review.id).update({
        content: content as never,
        status: "in_progress",
        aiGeneratedAt: new Date(),
        aiModel: mdl,
        aiProvenance: aiProvenance as never,
        updatedAt: new Date(),
      });
      await audit(sc.staff.fullName, "review_ai_generated", "plan_reviews", review.id, {
        actorRole: sc.staff.role,
        sections: draftedKeys,
        model: mdl,
        trigger: review.trigger,
        generatedBy: sc.staff.fullName,
      });
      return { content, status: "in_progress" as const, aiProvenance };
    }),

  /**
   * Complete review: lock report, record manager, bump plan next review +12 months,
   * schedule next annual review.
   */
  completeReview: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, ...CQC_PLAN_WRITE_ROLES);
      const review = await db.from("planReviews").eq("id", input.id).first<PlanReviews>();
      if (!review) throw new TRPCError({ code: "NOT_FOUND" });
      if (review.status === "completed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This review is already completed." });
      }

      const now = new Date();
      const nextReviewDue = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);

      // Ensure sign-off has completer
      const content = {
        ...((review.content as CarePlanReviewContent) ?? emptyCarePlanReviewContent()),
      };
      const signOff = { ...(content.sign_off as Record<string, string>) };
      if (!signOff.managerSignOff) signOff.managerSignOff = sc.staff.fullName;
      if (!signOff.managerSignOffDate) signOff.managerSignOffDate = now.toISOString().slice(0, 10);
      content.sign_off = signOff;

      await db.from("planReviews").eq("id", review.id).update({
        status: "completed",
        completedAt: now,
        completedBy: sc.staff.fullName,
        lockedAt: now,
        content: content as never,
        updatedAt: now,
      });

      const plan = await db.from("carePlans").eq("id", review.planId).first<CarePlans>();
      if (plan) {
        await db.from("carePlans").eq("id", plan.id).update({
          nextReviewDue,
          updatedAt: now,
        });
        // Schedule next annual review (avoid duplicate open annual for same plan)
        const openAnnual = await db.from("planReviews")
          .eq("planId", plan.id)
          .eq("trigger", "annual")
          .notIn("status", ["completed", "cancelled"])
          .first<PlanReviews>();
        if (!openAnnual) {
          await db.from("planReviews").insert({
            planType: plan.planType,
            planId: plan.id,
            clientId: plan.clientId,
            dueDate: nextReviewDue,
            trigger: "annual" satisfies ReviewTrigger,
            status: "due",
            content: emptyCarePlanReviewContent() as never,
          });
        } else {
          await db.from("planReviews").eq("id", openAnnual.id).update({
            dueDate: nextReviewDue,
            updatedAt: now,
          });
        }
      }

      await audit(sc.staff.fullName, "review_completed", "plan_reviews", review.id, {
        actorRole: sc.staff.role,
        nextReviewDue,
        completedBy: sc.staff.fullName,
        trigger: review.trigger,
        planId: review.planId,
        hadAiDraft: !!review.aiGeneratedAt,
      });
      return { ok: true, nextReviewDue, completedBy: sc.staff.fullName };
    }),

  changeEvents: authedQuery.query(async () => {
    const rows = await db.from("clientChangeEvents").order("occurredAt", "desc").limit(100).many<ClientChangeEvents>();
    const clientRows = await db.from("clients").many<Clients>();
    return rows.map((r) => ({ ...r, client: clientRows.find((c) => c.id === r.clientId) }));
  }),

  logChangeEvent: authedQuery
    .input(z.object({
      clientId: z.number(),
      type: z.enum(["health_change", "mobility_change", "hospital_admission", "hospital_discharge", "medication_change", "incident", "safeguarding", "family_request", "other"]),
      description: z.string().min(5), occurredAt: z.string(), triggersReview: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const [row] = await db.from("clientChangeEvents").insert<ClientChangeEvents>({
        clientId: input.clientId, type: input.type, description: input.description,
        reportedBy: sc.staff.fullName, occurredAt: new Date(input.occurredAt), triggersReview: input.triggersReview,
      });
      if (input.triggersReview) {
        // create review task immediately + pre-filled update draft
        const plan = await db.from("carePlans")
          .eq("clientId", input.clientId).eq("planType", "care").eq("status", "approved").isNull("deletedAt")
          .order("version", "desc").first<CarePlans>();
        if (plan) {
          await db.from("planReviews").insert({
            planType: "care", planId: plan.id, clientId: input.clientId,
            dueDate: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
            trigger: input.type === "hospital_discharge" ? "hospital_discharge"
              : input.type === "incident" ? "incident"
                : input.type === "family_request" ? "request"
                  : "change_in_needs",
            status: "due",
            content: emptyCarePlanReviewContent() as never,
          });
          await db.from("carePlans").insert({
            clientId: input.clientId, templateId: plan.templateId, planType: "care",
            version: plan.version + 1, status: "draft",
            content: plan.content as never,
            changeReason: `${input.type}: ${input.description.slice(0, 200)}`,
          });
        }
        await notifyRoles(["team_leader", "admin", "super_admin", "care_coordinator"], {
          type: "cqc", title: "Change event triggers plan review",
          body: input.description.slice(0, 140), link: "/cqc/plan-reviews",
        });
      }
      await audit(sc.staff.fullName, "change_event_logged", "client_change_events", row.id);
      return { id: row.id };
    }),

  // ── Supervisor notes ──
  supervisorNotes: authedQuery
    .input(z.object({ staffId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      // Self or privileged roles may view notes for a given staff member
      const isSelf = input.staffId == null || Number(sc.staff.id) === Number(input.staffId);
      const privileged = ["super_admin", "admin", "care_coordinator", "team_leader", "supervisor"].includes(sc.staff.role);
      if (!isSelf && !privileged) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only view your own supervision notes" });
      }
      const target = input.staffId ?? (sc.staff.role === "care_worker" ? Number(sc.staff.id) : undefined);
      let query = db.from("supervisorNotes").order("createdAt", "desc").limit(100);
      if (target) query = query.eq("staffId", target);
      const rows = await query.many<SupervisorNotes>();
      const staff = await db.from("staffProfiles").many<StaffProfiles>();
      const clientRows = await db.from("clients").many<Clients>();
      return rows
        .filter((n) => sc.staff.role !== "care_worker" || n.visibleToStaff)
        .map((n) => ({
          ...n,
          staff: staff.find((s2) => s2.id === n.staffId),
          client: clientRows.find((c) => c.id === n.clientId),
        }));
    }),

  recordNote: authedQuery
    .input(z.object({
      staffId: z.number(), clientId: z.number().optional(),
      noteType: z.enum(["spot_check", "supervision", "verbal_feedback", "observation"]),
      method: z.enum(["voice", "typed"]), transcript: z.string().min(5),
      visibleToStaff: z.boolean().default(false), useAi: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "supervisor", "team_leader");
      let structured: Record<string, string> = {};
      let strengths = "", improvements = "";
      let rating: number | null = null;
      let actions: { action: string; dueDate?: string }[] = [];
      if (input.useAi) {
        const result = await callAI({
          feature: "structureSupervisorNote", promptVersion: "1.0", temperature: 0.2,
          schema: z.object({
            safe: z.string(), effective: z.string(), caring: z.string(),
            responsive: z.string(), well_led: z.string(),
            strengths: z.string(), improvements: z.string(),
            rating: z.number().min(1).max(5),
            actions: z.array(z.object({ action: z.string(), dueDate: z.string().optional() })),
          }),
          system: "Structure a supervisor's raw note about a care worker into the CQC five-key-questions format (Safe, Effective, Caring, Responsive, Well-led). Only use facts in the note. Strict JSON. Rating 1-5 from tone and content.",
          user: `Note type: ${input.noteType}\nRaw note:\n${input.transcript}`,
        });
        structured = { safe: result.safe, effective: result.effective, caring: result.caring, responsive: result.responsive, well_led: result.well_led };
        strengths = result.strengths; improvements = result.improvements;
        rating = result.rating; actions = result.actions;
      }
      const [row] = await db.from("supervisorNotes").insert<SupervisorNotes>({
        staffId: input.staffId, supervisorId: sc.staff.id, supervisorName: sc.staff.fullName,
        clientId: input.clientId ?? null, noteType: input.noteType, method: input.method,
        transcript: input.transcript, structured: structured as never,
        rating, strengths, improvements, actions: actions as never,
        visibleToStaff: input.visibleToStaff,
      });
      await audit(sc.staff.fullName, "supervisor_note_recorded", "supervisor_notes", row.id);
      if (input.visibleToStaff) {
        await notify({ staffId: input.staffId, type: "supervision", title: `New ${input.noteType.replace("_", " ")} note from ${sc.staff.fullName}`, link: "/me" });
      }
      return { id: row.id, structured, strengths, improvements, rating, actions };
    }),

  // ── Appraisals ──
  appraisals: authedQuery.query(async () => {
    const rows = await db.from("appraisals").order("createdAt", "desc").many<Appraisals>();
    const staff = await db.from("staffProfiles").many<StaffProfiles>();
    return rows.map((a) => ({ ...a, staff: staff.find((s2) => s2.id === a.staffId) }));
  }),

  createAppraisal: authedQuery
    .input(z.object({ staffId: z.number(), periodStart: z.string(), periodEnd: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "team_leader");
      const [row] = await db.from("appraisals").insert<Appraisals>({
        staffId: input.staffId, periodStart: input.periodStart, periodEnd: input.periodEnd,
        appraiserId: sc.staff.id, appraiserName: sc.staff.fullName, status: "draft",
      });
      return { id: row.id };
    }),

  draftAppraisal: authedQuery
    .input(z.object({ appraisalId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "team_leader");
      const ap = await db.from("appraisals").eq("id", input.appraisalId).first<Appraisals>();
      if (!ap) throw new TRPCError({ code: "NOT_FOUND" });
      const staff = await db.from("staffProfiles").eq("id", ap.staffId).first<StaffProfiles>();
      const notes = await db.from("supervisorNotes").eq("staffId", ap.staffId).order("createdAt", "desc").limit(30).many<SupervisorNotes>();
      const enr = await db.from("trainingEnrolments")
        .eq("personType", "staff").eq("personId", ap.staffId).many<TrainingEnrolments>();
      const asg = await db.from("visitAssignments").eq("staffId", ap.staffId).many<VisitAssignments>();
      const visitIds = asg.map((a) => a.visitId);
      const vts = visitIds.length ? await db.from("visits").many<Visits>() : [];
      const myVisits = vts.filter((v) => visitIds.includes(v.id));
      const result = await callAI({
        feature: "draftAppraisal", promptVersion: "1.0", temperature: 0.4,
        schema: z.object({
          summary: z.string(), strengths: z.string(), development: z.string(),
          objectives: z.array(z.string()), evidenceNoteIds: z.array(z.number()),
        }),
        system: "Draft a fair, evidence-based annual appraisal for a UK domiciliary care worker. Reference the evidence. Plain UK English. Strict JSON.",
        user: `Staff role: ${staff?.jobTitle}. Period: ${ap.periodStart} to ${ap.periodEnd}.\nSupervision/spot-check notes (id + summary):\n${notes.map((n) => `#${n.id} [${n.noteType}, rating ${n.rating ?? "n/a"}] ${(n.strengths ?? "")} ${(n.improvements ?? "")}`).join("\n")}\nTraining: ${enr.filter((e) => e.status === "completed").length}/${enr.length} courses completed.\nRota reliability: ${myVisits.filter((v) => v.status === "missed").length} missed of ${myVisits.length} visits.`,
      });
      await db.from("appraisals").eq("id", ap.id).update({ aiDraft: result as never, status: "scheduled" });
      await audit(sc.staff.fullName, "appraisal_drafted", "appraisals", ap.id);
      return { draft: result, notes: notes.filter((n) => result.evidenceNoteIds.includes(Number(n.id))) };
    }),

  finaliseAppraisal: authedQuery
    .input(z.object({ appraisalId: z.number(), final: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "team_leader");
      await db.from("appraisals").eq("id", input.appraisalId).update({
        final: input.final as never, status: "completed",
        nextAppraisalDue: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10),
      });
      const ap = await db.from("appraisals").eq("id", input.appraisalId).first<Appraisals>();
      await notify({ staffId: ap!.staffId, type: "hr", title: "Your appraisal is ready to acknowledge", link: "/me" });
      return { ok: true };
    }),

  acknowledgeAppraisal: authedQuery
    .input(z.object({ appraisalId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const ap = await db.from("appraisals").eq("id", input.appraisalId).first<Appraisals>();
      if (!ap || Number(ap.staffId) !== Number(sc.staff.id)) throw new TRPCError({ code: "FORBIDDEN" });
      await db.from("appraisals").eq("id", ap.id).update({ status: "signed", signedByStaffAt: new Date() });
      return { ok: true };
    }),

  // ── Incidents ──
  incidents: authedQuery.query(async ({ ctx }) => {
    requireRole(await getStaff(ctx), ...CQC_INCIDENT_ROLES);
    const rows = await db.from("incidents").order("occurredAt", "desc").limit(100).many<Incidents>();
    const clientRows = await db.from("clients").many<Clients>();
    const staff = await db.from("staffProfiles").many<StaffProfiles>();
    return rows.map((i) => ({
      ...i,
      client: clientRows.find((c) => c.id === i.clientId),
      staff: staff.find((s2) => s2.id === i.staffId),
    }));
  }),

  logIncident: authedQuery
    .input(z.object({
      clientId: z.number().optional(), staffId: z.number().optional(),
      occurredAt: z.string(), category: z.string().min(3), description: z.string().min(10),
      severity: z.enum(["low", "moderate", "serious", "severe"]), actionsTaken: z.string().optional(),
      notifiableToCqc: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const [row] = await db.from("incidents").insert<Incidents>({
        clientId: input.clientId ?? null, staffId: input.staffId ?? null,
        occurredAt: new Date(input.occurredAt), category: input.category,
        description: input.description, severity: input.severity,
        actionsTaken: input.actionsTaken ?? null, notifiableToCqc: input.notifiableToCqc,
        status: "open",
      });
      if (input.notifiableToCqc || input.severity === "serious" || input.severity === "severe") {
        await notifyRoles(["super_admin", "admin"], {
          type: "incident", title: `${input.severity.toUpperCase()} incident logged${input.notifiableToCqc ? " — notifiable to CQC" : ""}`,
          body: input.description.slice(0, 140), link: "/cqc/incidents",
        });
      }
      await audit(sc.staff.fullName, "incident_logged", "incidents", row.id);
      return { id: row.id };
    }),

  closeIncident: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "team_leader");
      await db.from("incidents").eq("id", input.id).update({ status: "closed" });
      await audit(sc.staff.fullName, "incident_closed", "incidents", input.id);
      return { ok: true };
    }),

  // ── CQC readiness dashboard ──
  readiness: authedQuery.query(async ({ ctx }) => {
    requireRole(await getStaff(ctx), ...CQC_READINESS_ROLES);
    const today = new Date().toISOString().slice(0, 10);
    const plans = await db.from("carePlans").eq("status", "approved").isNull("deletedAt").many<CarePlans>();
    const carePlansInDate = plans.filter((p) => p.planType === "care" && (!p.nextReviewDue || p.nextReviewDue >= today)).length;
    const carePlansTotal = plans.filter((p) => p.planType === "care").length;
    const supportInDate = plans.filter((p) => p.planType === "support" && (!p.nextReviewDue || p.nextReviewDue >= today)).length;
    const supportTotal = plans.filter((p) => p.planType === "support").length;
    const overdueReviews = await db.from("planReviews").eq("status", "overdue").count();
    const staff = await db.from("staffProfiles").eq("status", "active").many<StaffProfiles>();
    const docs = await db.from("complianceDocuments").eq("ownerType", "staff").many<ComplianceDocuments>();
    const enr = await db.from("trainingEnrolments").eq("personType", "staff").many<TrainingEnrolments>();
    const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const activeDocs = docs.filter((d) => d.status !== "superseded" && d.status !== "cancelled");
    let compliantStaff = 0;
    let docsValid = 0;
    let docsExpiringSoon = 0;
    let docsExpired = 0;
    for (const s2 of staff) {
      const staffDocs = activeDocs.filter((d) => Number(d.ownerId) === Number(s2.id) && d.status === "verified");
      for (const d of staffDocs) {
        if (!d.expiresAt) { docsValid++; continue; }
        if (d.expiresAt < today) docsExpired++;
        else if (d.expiresAt < in30) docsExpiringSoon++;
        else docsValid++;
      }
      const dbs = staffDocs.filter((d) => d.requirementKey === "dbs_enhanced").sort((a, b) => Number(b.id) - Number(a.id))[0];
      const rtw = staffDocs.filter((d) => d.requirementKey === "right_to_work").sort((a, b) => Number(b.id) - Number(a.id))[0];
      const dbsOk = !!dbs && (!dbs.expiresAt || dbs.expiresAt >= today);
      const rtwOk = !!rtw && (!rtw.expiresAt || rtw.expiresAt >= today);
      const training = enr.filter((e) => e.personId === s2.id);
      const trainingOk = training.length === 0 || training.filter((e) => e.status === "completed" && (!e.expiresAt || e.expiresAt >= in30)).length / training.length >= 0.8;
      if (dbsOk && rtwOk && trainingOk) compliantStaff++;
    }
    // Count overdue reviews by due date as well as stored status
    const openReviews = await db.from("planReviews").notIn("status", ["completed", "cancelled"]).many<PlanReviews>();
    const overdueByDate = openReviews.filter((r) => r.dueDate < today || r.status === "overdue").length;
    const notes90 = await db.from("supervisorNotes").gte("createdAt", new Date(Date.now() - 90 * 864e5).toISOString()).count();
    const appraisalsInDate = await db.from("appraisals").gte("nextAppraisalDue", today).count();
    const now = new Date();
    const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const weekVts = await db.from("visits").gte("scheduledStart", monday.toISOString()).many<Visits>();
    const missed = weekVts.filter((v) => v.status === "missed").length;
    const assignments = await db.from("visitAssignments").in("status", ["assigned", "accepted"]).count();
    const openIncidents = await db.from("incidents").neq("status", "closed").count();
    const openSafeguarding = await db.from("tickets").eq("category", "safeguarding_concern").notIn("status", ["resolved", "closed"]).count();
    return {
      carePlansInDate, carePlansTotal,
      carePlansPct: carePlansTotal ? Math.round((carePlansInDate / carePlansTotal) * 100) : 100,
      supportPlansPct: supportTotal ? Math.round((supportInDate / supportTotal) * 100) : 100,
      overdueReviews: Math.max(overdueReviews, overdueByDate),
      staffCompliancePct: staff.length ? Math.round((compliantStaff / staff.length) * 100) : 100,
      documentExpiry: { valid: docsValid, expiringSoon: docsExpiringSoon, expired: docsExpired },
      supervisions90d: notes90,
      appraisalsInDate,
      missedVisits: missed,
      continuityPct: 0, // computed client-side via rota.kpis if needed
      openIncidents,
      openSafeguarding,
      assignments,
    };
  }),

  /** Latest staff compliance doc per requirement — used by the matrix Renew action. */
  renewableStaffDocuments: authedQuery.query(async ({ ctx }) => {
    const sc = await getStaff(ctx);
    requireRole(sc, "super_admin", "admin", "care_coordinator");
    const rows = await db.from("complianceDocuments").eq("ownerType", "staff").many<ComplianceDocuments>();
    const latest = new Map<string, ComplianceDocuments>();
    for (const d of [...rows].sort((a, b) => Number(a.id) - Number(b.id))) {
      if (d.status === "cancelled" || d.status === "superseded") continue;
      latest.set(`${d.ownerId}:${d.requirementKey}`, d);
    }
    return [...latest.values()].map((d) => ({
      id: Number(d.id),
      ownerId: Number(d.ownerId),
      requirementKey: d.requirementKey,
      status: d.status,
      expiresAt: d.expiresAt,
      fileName: d.fileName,
      textValue: d.textValue,
    }));
  }),

  /**
   * Record a renewal: inserts a fresh verified document for the same staff member and
   * requirement with the new expiry date (and optional replacement file/text).
   * The old row is marked expired so it stops generating reminders.
   */
  renewStaffDocument: authedQuery
    .input(z.object({
      documentId: z.number().int().positive(),
      newExpiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
      fileName: z.string().trim().min(1).max(255).optional(),
      textValue: z.string().trim().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "care_coordinator");
      const old = await db.from("complianceDocuments").eq("id", input.documentId).first<ComplianceDocuments>();
      if (!old || old.ownerType !== "staff") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Staff document not found" });
      }
      const [row] = await db.from("complianceDocuments").insert<ComplianceDocuments>({
        ownerType: "staff",
        ownerId: old.ownerId,
        requirementKey: old.requirementKey,
        fileName: input.fileName ?? old.fileName ?? null,
        fileKey: old.fileKey ?? null,
        textValue: input.textValue ?? old.textValue ?? null,
        status: "verified",
        verifiedBy: sc.staff.fullName,
        verifiedAt: new Date(),
        expiresAt: input.newExpiresAt,
      });
      await db.from("complianceDocuments").eq("id", old.id).update({ status: "expired" });
      await audit(sc.staff.fullName, "document_renewed", "compliance_documents", row.id, {
        staffId: Number(old.ownerId),
        requirementKey: old.requirementKey,
        oldDocumentId: Number(old.id),
        newExpiresAt: input.newExpiresAt,
      });
      return { id: Number(row.id) };
    }),
});
