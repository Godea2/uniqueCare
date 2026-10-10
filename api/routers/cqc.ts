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
import { getStaff, requireRole, audit, notify, notifyRoles } from "../util";
import { callAI, modelName } from "../ai/provider";

const planContentSchema = z.record(z.string(), z.string());

export const cqcRouter = createRouter({
  // ── Templates ──
  templates: authedQuery.query(async () => db.from("documentTemplates").order("id", "desc").many<DocumentTemplates>()),

  updateTemplateStructure: authedQuery
    .input(z.object({
      id: z.number(),
      structure: z.array(z.object({ key: z.string(), title: z.string(), guidance: z.string().optional(), required: z.boolean().optional() })),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
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
    .query(async ({ input }) => {
      let query = db.from("carePlans").isNull("deletedAt").order("updatedAt", "desc");
      if (input.planType) query = query.eq("planType", input.planType);
      const rows = await query.many<CarePlans>();
      const clientRows = await db.from("clients").many<Clients>();
      return rows.map((p) => ({ ...p, client: clientRows.find((c) => c.id === p.clientId) }));
    }),

  planDetail: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
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

  createPlan: authedQuery
    .input(z.object({ clientId: z.number(), planType: z.enum(["care", "support"]) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "team_leader");
      const tpl = await db.from("documentTemplates")
        .eq("kind", input.planType === "care" ? "care_plan" : "support_plan")
        .eq("active", true)
        .first<DocumentTemplates>();
      if (!tpl) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `No active ${input.planType} plan template is set up. Load the document templates in Supabase first.` });
      }
      const existing = await db.from("carePlans")
        .eq("clientId", input.clientId).eq("planType", input.planType).isNull("deletedAt")
        .many<CarePlans>();
      const version = (Math.max(0, ...existing.map((e) => e.version)) || 0) + 1;
      const [row] = await db.from("carePlans").insert<CarePlans>({
        clientId: input.clientId, templateId: tpl.id, planType: input.planType,
        version, status: "draft", content: {},
      });
      await audit(sc.staff.fullName, "plan_created", "care_plans", row.id, { planType: input.planType });
      return { id: row.id };
    }),

  generatePlan: authedQuery
    .input(z.object({
      planId: z.number(),
      inputs: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "team_leader");
      const plan = await db.from("carePlans").eq("id", input.planId).first<CarePlans>();
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      const tpl = plan.templateId
        ? await db.from("documentTemplates").eq("id", plan.templateId).first<DocumentTemplates>()
        : null;
      const structure = (tpl?.structure as { key: string; title: string; guidance?: string }[]) ?? [];
      const client = await db.from("clients").eq("id", plan.clientId).first<Clients>();
      const schema = z.object({ sections: z.record(z.string(), z.string()) });
      const result = await callAI({
        feature: "generatePlan", promptVersion: "1.0", temperature: 0.4, schema,
        validate: (r) => Object.keys(r.sections).length > 0,
        system: `You write ${plan.planType} plans for a UK domiciliary care provider. Person-centred, plain UK English, first person ("I like…") where the section suits it. CRITICAL: use ONLY the facts supplied — never invent medical or personal facts. If information for a section is missing, write exactly: "⚠ Information needed: <what is missing>". Return strict JSON keyed by section key.`,
        user: `Client ref: ${client!.clientRef}. Age band: adult. Known facts and notes from the assessor:\n${JSON.stringify(input.inputs, null, 2)}\n\nWrite one section per key:\n${structure.map((s) => `- ${s.key}: ${s.title}${s.guidance ? ` (${s.guidance})` : ""}`).join("\n")}`,
      });
      await db.from("carePlans").eq("id", plan.id).update({
        status: "ai_generated", inputs: input.inputs as never,
        content: result.sections as never, aiModel: modelName(), aiGeneratedAt: new Date(),
      });
      await audit(sc.staff.fullName, "plan_ai_generated", "care_plans", plan.id);
      return { content: result.sections };
    }),

  regenerateSection: authedQuery
    .input(z.object({ planId: z.number(), sectionKey: z.string(), instruction: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await getStaff(ctx);
      const plan = await db.from("carePlans").eq("id", input.planId).first<CarePlans>();
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      const tpl = plan.templateId ? await db.from("documentTemplates").eq("id", plan.templateId).first<DocumentTemplates>() : null;
      const sec = ((tpl?.structure as { key: string; title: string; guidance?: string }[]) ?? []).find((s) => s.key === input.sectionKey);
      const current = (plan.content as Record<string, string>)?.[input.sectionKey] ?? "";
      const result = await callAI({
        feature: "regeneratePlanSection", promptVersion: "1.0", temperature: 0.4,
        schema: z.object({ text: z.string() }),
        system: "Rewrite one section of a UK care plan. Person-centred, plain English, first person where suitable. Only use supplied facts; missing info becomes '⚠ Information needed: …'. Strict JSON.",
        user: `Section: ${sec?.title ?? input.sectionKey}\nAssessor inputs: ${JSON.stringify(plan.inputs)}\nCurrent draft:\n${current}\n\nInstruction: ${input.instruction ?? "Improve clarity and completeness using the inputs."}`,
      });
      const content = { ...((plan.content as Record<string, string>) ?? {}), [input.sectionKey]: result.text };
      await db.from("carePlans").eq("id", plan.id).update({ content: content as never });
      return { text: result.text };
    }),

  savePlanContent: authedQuery
    .input(z.object({ planId: z.number(), content: planContentSchema }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "team_leader");
      await db.from("carePlans").eq("id", input.planId).update({ content: input.content as never, status: "in_review" });
      return { ok: true };
    }),

  approvePlan: authedQuery
    .input(z.object({ planId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "team_leader");
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
      });
      await audit(sc.staff.fullName, "plan_approved", "care_plans", plan.id);
      return { ok: true, nextReviewDue: reviewDue };
    }),

  // ── Reviews & change events ──
  reviews: authedQuery.query(async () => {
    const rows = await db.from("planReviews").order("dueDate", "asc").many<PlanReviews>();
    const clientRows = await db.from("clients").many<Clients>();
    return rows.map((r) => ({ ...r, client: clientRows.find((c) => c.id === r.clientId) }));
  }),

  completeReview: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "team_leader");
      await db.from("planReviews").eq("id", input.id).update({ status: "completed", completedAt: new Date() });
      await audit(sc.staff.fullName, "review_completed", "plan_reviews", input.id);
      return { ok: true };
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
            trigger: input.type === "hospital_discharge" ? "hospital_discharge" : input.type === "incident" ? "incident" : "change_in_needs",
            status: "due",
          });
          await db.from("carePlans").insert({
            clientId: input.clientId, templateId: plan.templateId, planType: "care",
            version: plan.version + 1, status: "draft",
            content: plan.content as never,
            changeReason: `${input.type}: ${input.description.slice(0, 200)}`,
          });
        }
        await notifyRoles(["team_leader", "admin", "super_admin"], {
          type: "cqc", title: "Change event triggers plan review",
          body: input.description.slice(0, 140), link: "/clients/reviews",
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
  incidents: authedQuery.query(async () => {
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
  readiness: authedQuery.query(async () => {
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
    let compliantStaff = 0;
    for (const s2 of staff) {
      const dbsOk = docs.some((d) => d.ownerId === s2.id && d.requirementKey === "dbs_enhanced" && d.status === "verified" && (!d.expiresAt || d.expiresAt >= today));
      const rtwOk = docs.some((d) => d.ownerId === s2.id && d.requirementKey === "right_to_work" && d.status === "verified");
      const training = enr.filter((e) => e.personId === s2.id);
      const trainingOk = training.length === 0 || training.filter((e) => e.status === "completed" && (!e.expiresAt || e.expiresAt >= in30)).length / training.length >= 0.8;
      if (dbsOk && rtwOk && trainingOk) compliantStaff++;
    }
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
      overdueReviews,
      staffCompliancePct: staff.length ? Math.round((compliantStaff / staff.length) * 100) : 100,
      supervisions90d: notes90,
      appraisalsInDate,
      missedVisits: missed,
      continuityPct: 0, // computed client-side via rota.kpis if needed
      openIncidents,
      openSafeguarding,
      assignments,
    };
  }),
});
