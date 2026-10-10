import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, publicQuery } from "../middleware";
import { db } from "../db";
import {
  APPLICATION_STAGES,
  type ApplicationStage,
  type ApplicationForms,
  type ApplicationFormTemplates,
  type ApplicationFormVersions,
  type Applications,
  type Candidates,
  type ComplianceDocuments,
  type ComplianceRequirements,
  type CrmContacts,
  type CvVersions,
  type DbsVerifications,
  type InterviewBookings,
  type InterviewScorecards,
  type InterviewSlots,
  type JobLinkSources,
  type JobPostings,
  type OfferLetters,
  type PreInterviewForms,
  type References,
  type StaffProfiles,
  type TrainingCourses,
  type TrainingEnrolments,
  type TrainingSessions,
} from "@db/schema";
import { getStaff, requireRole, audit, notifyRoles } from "../util";
import { callAI } from "../ai/provider";
import { sendEmail } from "../lib/mailer";
import { cvDownloadUrl, readCv, saveCv } from "../lib/cv-store";
import {
  defaultCareWorkerForm, validateSubmission, trippedKnockouts, conditionMet,
  formSchemaDoc, DISPLAY_TYPES, type FormSchemaDoc, type FormAnswers,
} from "@contracts/form-schema";
import { extractCvText } from "../lib/cv-text";
import crypto from "crypto";

const token = () => crypto.randomBytes(24).toString("hex");
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const newApplySlug = (title: string) => `${slugify(title).slice(0, 60)}-${crypto.randomBytes(4).toString("hex").slice(0, 6)}`;

// Allowed stage transitions (state machine). Admins can override with a reason.
const ALLOWED: Record<ApplicationStage, ApplicationStage[]> = {
  applied: ["screened_out", "shortlisted", "review", "withdrawn"],
  review: ["screened_out", "shortlisted", "withdrawn"],
  screened_out: ["applied"],
  shortlisted: ["pre_interview_forms_sent", "rejected", "withdrawn"],
  pre_interview_forms_sent: ["pre_interview_forms_complete", "withdrawn"],
  pre_interview_forms_complete: ["interview_booked", "withdrawn"],
  interview_booked: ["interviewed", "withdrawn"],
  interviewed: ["approved", "rejected", "withdrawn"],
  approved: ["compliance_docs_requested", "rejected", "withdrawn"],
  compliance_docs_requested: ["compliance_docs_complete", "withdrawn"],
  compliance_docs_complete: ["offer_sent", "withdrawn"],
  offer_sent: ["offer_accepted", "withdrawn"],
  offer_accepted: ["training_booked", "withdrawn"],
  training_booked: ["online_training_in_progress", "withdrawn"],
  online_training_in_progress: ["dbs_verified", "withdrawn"],
  dbs_verified: ["training_complete", "withdrawn"],
  training_complete: ["hired"],
  hired: [],
  rejected: [],
  withdrawn: [],
};

export function canTransition(from: ApplicationStage, to: ApplicationStage) {
  return (ALLOWED[from] ?? []).includes(to);
}

async function pushStage(
  applicationId: number,
  to: ApplicationStage,
  actor: string,
  reason?: string,
  override = false,
) {
  const app = await db.from("applications").eq("id", applicationId).first<Applications>();
  if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
  const from = app.stage as ApplicationStage;
  if (!override && !canTransition(from, to)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot move from ${from} to ${to}. Use an override with a reason if this is intentional.`,
    });
  }
  const history = [...((app.stageHistory as never[]) ?? []), {
    from, to, actor, at: new Date().toISOString(), ...(reason ? { reason } : {}),
  }];
  await db.from("applications").eq("id", applicationId).update({
    stage: to, stageHistory: history as never, adminOverride: override || app.adminOverride, overrideReason: override ? reason ?? null : app.overrideReason,
  });
  await audit(actor, `stage:${from}->${to}`, "applications", applicationId, { reason, override });
  return app;
}

const requirementSchema = z.object({
  key: z.string(), label: z.string(), weight: z.number(),
  type: z.string(), required: z.boolean(),
});

const aiScreenSchema = z.object({
  requirement_results: z.array(z.object({
    requirement_key: z.string(),
    met: z.enum(["yes", "partial", "no", "unknown"]),
    evidence: z.string(),
    source: z.enum(["cv", "form"]),
  })),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  summary: z.string(),
  flags: z.array(z.string()),
});

const aiRequirementsSchema = z.object({
  requirements: z.array(z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string(),
    weight: z.number().min(1).max(40),
    required: z.boolean(),
    rationale: z.string().optional(),
  })).min(1).max(12),
});

/** Score from requirement results + weights, computed in code (never trust the model's total). */
export function computeScore(
  requirements: z.infer<typeof requirementSchema>[],
  results: z.infer<typeof aiScreenSchema>["requirement_results"],
): number {
  const totalWeight = requirements.reduce((a, r) => a + r.weight, 0) || 1;
  let earned = 0;
  for (const req of requirements) {
    const b = results.find((x) => x.requirement_key === req.key);
    if (!b) continue;
    const frac = { yes: 1, partial: 0.5, unknown: 0.25, no: 0 }[b.met];
    earned += req.weight * frac;
    // hard-required items not met cap the score at 50
    if (req.required && b.met === "no") return Math.min(50, Math.round((earned / totalWeight) * 100));
  }
  return Math.min(100, Math.round((earned / totalWeight) * 100));
}

export const hrRouter = createRouter({
  // ── Job postings ──
  jobs: authedQuery.query(async () => {
    const jobs = await db.from("jobPostings").order("createdAt", "desc").many<JobPostings>();
    const sources = await db.from("jobLinkSources").many<JobLinkSources>();
    const apps = await db.from("applications").many<Applications>();
    return jobs.map((j) => {
      const jobApps = apps.filter((a) => a.jobPostingId === j.id);
      const bySource: Record<string, number> = {};
      for (const a of jobApps) {
        const key = a.sourceChannel ?? "direct";
        bySource[key] = (bySource[key] ?? 0) + 1;
      }
      return {
        ...j,
        linkSources: sources.filter((s) => s.jobPostingId === j.id),
        applicationCount: jobApps.length,
        applicationsBySource: bySource,
      };
    });
  }),

  createJob: authedQuery
    .input(z.object({
      title: z.string().min(3), location: z.string(), postcode: z.string().optional(),
      salaryText: z.string().optional(), employmentType: z.enum(["full_time", "part_time", "zero_hours", "bank"]),
      descriptionMd: z.string().min(10), requirements: z.array(requirementSchema),
      screeningThreshold: z.number().min(50).max(100).default(85),
      closesAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const slug = slugify(input.title) + "-" + token().slice(0, 6);
      const [jobRow] = await db.from("jobPostings").insert<JobPostings>({
        ...input, publicSlug: slug, status: "draft",
        applySlug: newApplySlug(input.title), applyLinkEnabled: true, applyLinkCreatedAt: new Date(),
      });
      const jobId = jobRow.id;
      // Attach a per-job application form copied from the default template, published as v1
      const tpl = await db.from("applicationFormTemplates").eq("name", "Care Worker — Standard").first<ApplicationFormTemplates>();
      const baseSchema = (tpl?.schemaJson as FormSchemaDoc | null) ?? defaultCareWorkerForm();
      const [formRow] = await db.from("applicationForms").insert<ApplicationForms>({
        jobPostingId: jobId, templateId: tpl ? Number(tpl.id) : null,
        name: tpl?.name ?? "Care Worker — Standard", draftSchema: baseSchema as never,
      });
      const formId = formRow.id;
      const [versionRow] = await db.from("applicationFormVersions").insert<ApplicationFormVersions>({
        formId, version: 1, schemaJson: baseSchema as never, publishedBy: sc.staff.fullName,
      });
      await db.from("applicationForms").eq("id", formId).update({ publishedVersionId: versionRow.id });
      await db.from("jobPostings").eq("id", jobId).update({ applicationFormId: formId });
      await audit(sc.staff.fullName, "job_created", "job_postings", jobId, { title: input.title });
      return { id: jobId, slug };
    }),

  setJobStatus: authedQuery
    .input(z.object({ id: z.number(), status: z.enum(["draft", "live", "closed"]) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      if (input.status === "live") {
        const job = await db.from("jobPostings").eq("id", input.id).first<JobPostings>();
        const reqs = (job?.requirements as unknown[] | null) ?? [];
        if (reqs.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Add at least one screening requirement before going Live — AI screening needs them. Use “Suggest from job description” if helpful.",
          });
        }
      }
      await db.from("jobPostings").eq("id", input.id).update({ status: input.status });
      await audit(sc.staff.fullName, `job_${input.status}`, "job_postings", input.id);
      return { ok: true };
    }),

  // ── Application link management (B1) ──
  setApplyLinkEnabled: authedQuery
    .input(z.object({ jobId: z.number(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      await db.from("jobPostings").eq("id", input.jobId).update({ applyLinkEnabled: input.enabled });
      await audit(sc.staff.fullName, input.enabled ? "apply_link_enabled" : "apply_link_disabled", "job_postings", input.jobId);
      return { ok: true };
    }),

  regenerateApplyLink: authedQuery
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const job = await db.from("jobPostings").eq("id", input.jobId).first<JobPostings>();
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      const applySlug = newApplySlug(job.title);
      await db.from("jobPostings").eq("id", input.jobId).update({ applySlug, applyLinkCreatedAt: new Date(), applyLinkEnabled: true });
      await audit(sc.staff.fullName, "apply_link_regenerated", "job_postings", input.jobId);
      return { applySlug };
    }),

  addLinkSource: authedQuery
    .input(z.object({ jobId: z.number(), label: z.string().min(2).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const slug = slugify(input.label).slice(0, 80) || "source";
      const dup = await db.from("jobLinkSources").eq("jobPostingId", input.jobId).eq("slug", slug).first<JobLinkSources>();
      if (dup) throw new TRPCError({ code: "CONFLICT", message: `A tracked link called “${input.label}” already exists for this job.` });
      const [row] = await db.from("jobLinkSources").insert<JobLinkSources>({
        jobPostingId: input.jobId, label: input.label, slug, createdBy: sc.staff.fullName,
      });
      await audit(sc.staff.fullName, "link_source_added", "job_postings", input.jobId, { label: input.label });
      return { id: row.id, slug };
    }),

  removeLinkSource: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      await db.from("jobLinkSources").eq("id", input.id).delete();
      await audit(sc.staff.fullName, "link_source_removed", "job_link_sources", input.id);
      return { ok: true };
    }),

  // ── Public careers ──
  publicJobs: publicQuery.query(async () => {
    const rows = await db.from("jobPostings").eq("status", "live").many<JobPostings>();
    return rows.map((j) => ({
      id: j.id, title: j.title, location: j.location,
      salaryText: j.salaryText, employmentType: j.employmentType,
      descriptionMd: j.descriptionMd, publicSlug: j.publicSlug,
      applySlug: j.applySlug, applyLinkEnabled: j.applyLinkEnabled,
      closesAt: j.closesAt,
    }));
  }),

  /** Public application page data: job header + published form schema. Never 404s a closed link. */
  publicApplyInfo: publicQuery
    .input(z.object({ slug: z.string(), src: z.string().optional() }))
    .query(async ({ input }) => {
      const job = await db.from("jobPostings").eq("applySlug", input.slug).first<JobPostings>();
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "This link is not valid" });
      const closed =
        job.status !== "live" ||
        !job.applyLinkEnabled ||
        (job.closesAt != null && String(job.closesAt) < new Date().toISOString().slice(0, 10));
      // validate tracked source label if provided
      let sourceLabel: string | null = null;
      if (input.src) {
        const src = await db.from("jobLinkSources").eq("jobPostingId", job.id).eq("slug", input.src).first<JobLinkSources>();
        if (src) sourceLabel = src.slug;
      }
      if (closed) {
        return {
          state: "closed" as const,
          job: { title: job.title, location: job.location },
          sourceLabel,
        };
      }
      // load published form schema
      let schema: FormSchemaDoc = defaultCareWorkerForm();
      let formVersionId: number | null = null;
      if (job.applicationFormId) {
        const form = await db.from("applicationForms").eq("id", job.applicationFormId).first<ApplicationForms>();
        if (form?.publishedVersionId) {
          const ver = await db.from("applicationFormVersions").eq("id", form.publishedVersionId).first<ApplicationFormVersions>();
          if (ver) {
            const parsed = formSchemaDoc.safeParse(ver.schemaJson);
            if (parsed.success) {
              schema = parsed.data;
              formVersionId = Number(ver.id);
            }
          }
        }
      }
      return {
        state: "open" as const,
        job: {
          title: job.title, location: job.location, salaryText: job.salaryText,
          employmentType: job.employmentType, descriptionMd: job.descriptionMd, closesAt: job.closesAt,
        },
        schema,
        formVersionId,
        sourceLabel,
        turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? null,
      };
    }),

  /** Public CV upload for the application form. Anonymous drop-box: 10 MB cap, PDF/DOC/DOCX only, no delete. */
  uploadCv: publicQuery
    .input(z.object({
      slug: z.string(),
      fileName: z.string().min(1).max(255),
      contentBase64: z.string().max(14_000_000), // ~10 MB binary as base64
    }))
    .mutation(async ({ input }) => {
      const job = await db.from("jobPostings").eq("applySlug", input.slug).first<JobPostings>();
      if (!job || job.status !== "live" || !job.applyLinkEnabled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This vacancy is no longer accepting applications." });
      }
      const bytes = Uint8Array.from(Buffer.from(input.contentBase64, "base64"));
      if (bytes.length > 10 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Your CV is larger than 10 MB." });
      }
      // MIME / magic-byte check
      const magic = Buffer.from(bytes.slice(0, 8));
      const isPdf = magic.subarray(0, 5).toString("latin1") === "%PDF-";
      const isZip = magic[0] === 0x50 && magic[1] === 0x4b; // docx is a zip
      const isOle = magic[0] === 0xd0 && magic[1] === 0xcf; // legacy .doc
      const lower = input.fileName.toLowerCase();
      const extOk = lower.endsWith(".pdf") || lower.endsWith(".doc") || lower.endsWith(".docx");
      if (!extOk || !(isPdf || isZip || isOle)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only PDF, DOC or DOCX files are accepted." });
      }
      const mime = isPdf ? "application/pdf" : isZip ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/msword";
      let saved: { key: string };
      try {
        saved = await saveCv(bytes, input.fileName, mime);
      } catch (err) {
        const message = err instanceof Error ? err.message : "We could not store your CV. Please try again.";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
      const { text, readable } = await extractCvText(bytes, input.fileName);
      return {
        key: saved.key, fileName: input.fileName, size: bytes.length, mimeType: mime,
        extractedText: text, readable,
      };
    }),

  submitApplication: publicQuery
    .input(z.object({
      slug: z.string(),
      src: z.string().optional(),
      answers: z.record(z.string(), z.unknown()),
      cv: z.object({ key: z.string(), fileName: z.string(), size: z.number(), mimeType: z.string(), extractedText: z.string(), readable: z.boolean() }),
      /** Honeypot — must stay empty. */
      website: z.string().max(0).optional(),
      turnstileToken: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const job = await db.from("jobPostings").eq("applySlug", input.slug).first<JobPostings>();
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "This link is not valid" });
      const closed =
        job.status !== "live" || !job.applyLinkEnabled ||
        (job.closesAt != null && String(job.closesAt) < new Date().toISOString().slice(0, 10));
      if (closed) throw new TRPCError({ code: "BAD_REQUEST", message: "This vacancy is now closed." });

      // Cloudflare Turnstile (invisible) — enforced when keys are configured
      if (process.env.TURNSTILE_SECRET_KEY) {
        if (!input.turnstileToken) throw new TRPCError({ code: "BAD_REQUEST", message: "Spam check failed. Please try again." });
        const ip = ctx.req?.headers.get("cf-connecting-ip") ?? ctx.req?.headers.get("x-forwarded-for") ?? "";
        const vr = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: input.turnstileToken, remoteip: ip }),
        });
        const vres = (await vr.json()) as { success: boolean };
        if (!vres.success) throw new TRPCError({ code: "BAD_REQUEST", message: "Spam check failed. Please try again." });
      }

      // Rate limit: 5 submissions per IP per hour
      const ip = (ctx.req?.headers.get("cf-connecting-ip") ?? ctx.req?.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
      const since = new Date(Date.now() - 3600_000);
      const recent = await db.from("rateLimitEvents").eq("bucket", "apply").eq("rlKey", ip).gt("createdAt", since).count();
      if (recent >= 5) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many submissions from this connection. Please try again later." });
      }
      await db.from("rateLimitEvents").insert({ bucket: "apply", rlKey: ip });

      // Load the SAME published schema the renderer used and validate server-side
      let schema: FormSchemaDoc = defaultCareWorkerForm();
      let formVersionId: number | null = null;
      if (job.applicationFormId) {
        const form = await db.from("applicationForms").eq("id", job.applicationFormId).first<ApplicationForms>();
        if (form?.publishedVersionId) {
          const ver = await db.from("applicationFormVersions").eq("id", form.publishedVersionId).first<ApplicationFormVersions>();
          if (ver) {
            const parsed = formSchemaDoc.safeParse(ver.schemaJson);
            if (parsed.success) { schema = parsed.data; formVersionId = Number(ver.id); }
          }
        }
      }
      const answers = { ...(input.answers as FormAnswers) };
      // The CV travels as a dedicated upload payload; inject it so schema-required validation still applies.
      if (input.cv?.key) answers.cv_upload = { key: input.cv.key, fileName: input.cv.fileName, size: input.cv.size };
      const errors = validateSubmission(schema, answers);
      if (Object.keys(errors).length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Please check your answers: ${Object.values(errors)[0]}`,
        });
      }

      const firstName = String(answers.first_name ?? "").trim();
      const lastName = String(answers.last_name ?? "").trim();
      const email = String(answers.email ?? "").trim().toLowerCase();
      const phone = String(answers.mobile ?? "").trim();
      const postcode = String(answers.postcode ?? "").trim();
      const rtwMap: Record<string, string> = { yes: "British citizen / settled", sponsorship: "Needs sponsorship", no: "No right to work" };
      const rtw = rtwMap[String(answers.right_to_work ?? "")] ?? String(answers.right_to_work ?? "");

      // tracked source
      let sourceChannel = "direct";
      if (input.src) {
        const src = await db.from("jobLinkSources").eq("jobPostingId", job.id).eq("slug", input.src).first<JobLinkSources>();
        if (src) sourceChannel = src.slug;
      }

      // Duplicate detection: same email or phone re-applying to the same job
      let cand = await db.from("candidates").eq("email", email).first<Candidates>();
      if (!cand && phone) {
        cand = await db.from("candidates").eq("phone", phone).first<Candidates>();
      }
      if (!cand) {
        const [created] = await db.from("candidates").insert<Candidates>({
          firstName, lastName, email, phone, postcode,
          rightToWorkStatus: rtw,
          hasDrivingLicence: answers.driving_licence === "yes",
          hasVehicle: answers.own_car === "yes",
          sourceChannel,
        });
        cand = created;
      }

      const existingApp = await db.from("applications").eq("candidateId", cand.id).eq("jobPostingId", job.id).first<Applications>();

      const knockoutHits = trippedKnockouts(schema, answers);

      let appId: number;
      let portalTokenValue: string;
      if (existingApp && !["withdrawn", "rejected", "screened_out"].includes(existingApp.stage)) {
        // Duplicate: link to the existing application, keep the newer CV as a new version
        appId = Number(existingApp.id);
        portalTokenValue = existingApp.portalToken;
        await db.from("applications").eq("id", existingApp.id).update({
          cvText: input.cv.extractedText || existingApp.cvText,
          cvFileName: input.cv.fileName, cvFileKey: input.cv.key,
          cvUnreadable: !input.cv.readable,
          answers: answers as never,
          formVersionId: formVersionId ?? existingApp.formVersionId,
          sourceChannel,
        });
        await db.from("cvVersions").insert({
          applicationId: appId, fileKey: input.cv.key, fileName: input.cv.fileName,
          sizeBytes: input.cv.size, mimeType: input.cv.mimeType,
          extractedText: input.cv.extractedText || null,
          extractStatus: input.cv.readable ? "ok" : "unreadable",
        });
        await audit("System", "application_duplicate_updated", "applications", appId, { job: job.title, email });
      } else {
        const [ar] = await db.from("applications").insert<Applications>({
          jobPostingId: job.id, candidateId: cand.id,
          cvText: input.cv.extractedText || null,
          cvFileName: input.cv.fileName, cvFileKey: input.cv.key,
          cvUnreadable: !input.cv.readable,
          answers: answers as never,
          formVersionId,
          sourceChannel,
          stage: "applied",
          stageHistory: [{ from: null, to: "applied", actor: "Candidate (self-service)", at: new Date().toISOString() }] as never,
          portalToken: token(),
        });
        appId = ar.id;
        portalTokenValue = (await db.from("applications").eq("id", appId).first<Applications>())!.portalToken;
        await db.from("cvVersions").insert({
          applicationId: appId, fileKey: input.cv.key, fileName: input.cv.fileName,
          sizeBytes: input.cv.size, mimeType: input.cv.mimeType,
          extractedText: input.cv.extractedText || null,
          extractStatus: input.cv.readable ? "ok" : "unreadable",
        });
        await audit("System", "application_received", "applications", appId, { job: job.title, source: sourceChannel });
      }

      const flags: string[] = [...knockoutHits.map((h) => `Knockout: ${h.message}`)];
      if (!input.cv.readable) flags.push("CV unreadable — manual review");
      if (flags.length) {
        await db.from("applications").eq("id", appId).update({ aiFlags: flags as never });
      }

      // link / create CRM contact
      const existingContact = await db.from("crmContacts").eq("email", email).first<CrmContacts>();
      if (!existingContact) {
        await db.from("crmContacts").insert({
          contactType: "candidate", firstName, lastName,
          email, phone, postcode,
          linkedCandidateId: cand.id, lifecycleStage: "n_a", source: sourceChannel,
        });
      }
      await db.from("interactions").insert({
        type: "web_form", direction: "inbound", subject: `Application: ${job.title}`,
        body: `${firstName} ${lastName} applied via ${sourceChannel}.`,
        occurredAt: new Date(), loggedBy: "System", outcome: "application_received",
      });
      await notifyRoles(["admin", "super_admin"], {
        type: "hr", title: `New application — ${firstName} ${lastName}`,
        body: `Applied for ${job.title} (${sourceChannel}). AI screening will run shortly.`,
        link: `/recruitment/pipeline/${appId}`,
      });
      // Confirmation email (recorded in outbox; delivered when Graph is connected)
      const ty = schema.thankYouText ?? "Thank you for your application.";
      await sendEmail({
        to: email,
        subject: `Your application — ${job.title} at Unique Care UK`,
        body: `Dear ${firstName},\n\n${ty}\n\nRole: ${job.title}\nLocation: ${job.location ?? ""}\n\nYou can track your application, complete forms and book interviews in your personal candidate portal.\n\nKind regards,\nUnique Care UK recruitment team`,
        kind: "application_confirmation",
        relatedType: "application",
        relatedId: appId,
      });
      return { applicationId: appId, portalToken: portalTokenValue, duplicate: !!existingApp };
    }),

  // ── Applications / pipeline ──
  pipeline: authedQuery
    .input(z.object({ jobId: z.number().optional() }))
    .query(async ({ input }) => {
      const appsQuery = db.from("applications").order("createdAt", "desc");
      if (input.jobId) appsQuery.eq("jobPostingId", input.jobId);
      const apps = await appsQuery.many<Applications>();
      const cands = await db.from("candidates").many<Candidates>();
      const jobs = await db.from("jobPostings").many<JobPostings>();
      return apps.map((a) => ({
        ...a,
        candidate: cands.find((c) => c.id === a.candidateId),
        job: jobs.find((j) => j.id === a.jobPostingId),
      }));
    }),

  applicationDetail: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const app = await db.from("applications").eq("id", input.id).first<Applications>();
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      const candidate = (await db.from("candidates").eq("id", app.candidateId).first<Candidates>())!;
      const job = (await db.from("jobPostings").eq("id", app.jobPostingId).first<JobPostings>())!;
      const form = await db.from("preInterviewForms").eq("applicationId", app.id).first<PreInterviewForms>() ?? null;
      const booking = await db.from("interviewBookings").eq("applicationId", app.id).eq("status", "booked").first<InterviewBookings>() ?? null;
      const slot = booking ? (await db.from("interviewSlots").eq("id", booking.slotId).first<InterviewSlots>())! : null;
      const myScorecard = await db.from("interviewScorecards").eq("applicationId", app.id).eq("panelMemberId", sc.staff.id).first<InterviewScorecards>() ?? null;
      // hide other panel members' scores until I've submitted mine (interview_panel role)
      let scorecards = await db.from("interviewScorecards").eq("applicationId", app.id).many<InterviewScorecards>();
      const allScorecards = scorecards;
      if (sc.staff.role === "interview_panel" && !myScorecard) scorecards = [];
      const docs = await db.from("complianceDocuments").eq("ownerType", "candidate").eq("ownerId", app.candidateId).many<ComplianceDocuments>();
      const refs = await db.from("references").eq("applicationId", app.id).many<References>();
      const offer = await db.from("offerLetters").eq("applicationId", app.id).order("id", "desc").first<OfferLetters>() ?? null;
      const enrolments = await db.from("trainingEnrolments").eq("personType", "candidate").eq("personId", app.candidateId).many<TrainingEnrolments>();
      const courses = await db.from("trainingCourses").many<TrainingCourses>();
      const panel = await db.from("staffProfiles").many<StaffProfiles>();
      const cvs = await db.from("cvVersions").eq("applicationId", app.id).order("createdAt", "desc").many<CvVersions>();
      // Published form schema the applicant answered (for labelled answer display)
      let formSchema: FormSchemaDoc | null = null;
      if (app.formVersionId) {
        const ver = await db.from("applicationFormVersions").eq("id", app.formVersionId).first<ApplicationFormVersions>();
        const parsed = ver ? formSchemaDoc.safeParse(ver.schemaJson) : null;
        if (parsed?.success) formSchema = parsed.data;
      }
      return {
        application: app, candidate, job, form, booking, slot, scorecards, allScorecardsCount: allScorecards.length,
        myScorecard, docs, references: refs, offer, panel, cvVersions: cvs, formSchema,
        enrolments: enrolments.map((e) => ({ ...e, course: courses.find((c) => c.id === e.courseId) })),
        myStaffId: sc.staff.id, myRole: sc.staff.role,
      };
    }),

  /** Short-lived URL to render/download an uploaded CV (admin only). */
  cvUrl: authedQuery
    .input(z.object({ applicationId: z.number(), key: z.string() }))
    .query(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "team_leader");
      // verify the key belongs to this application
      const row = await db.from("cvVersions").eq("applicationId", input.applicationId).eq("fileKey", input.key).first<CvVersions>();
      const app = await db.from("applications").eq("id", input.applicationId).first<Applications>();
      if (!row && app?.cvFileKey !== input.key) throw new TRPCError({ code: "NOT_FOUND", message: "CV not found" });
      const url = await cvDownloadUrl(input.key);
      return { url };
    }),

  moveStage: authedQuery
    .input(z.object({
      applicationId: z.number(), to: z.enum(APPLICATION_STAGES),
      reason: z.string().optional(), override: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      if (input.override && !input.reason) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "An override requires a reason." });
      }
      if (input.to === "rejected" || input.to === "screened_out") {
        if (!input.reason) throw new TRPCError({ code: "BAD_REQUEST", message: "A rejection/screen-out reason is required." });
        await db.from("applications").eq("id", input.applicationId).update({ rejectionReason: input.reason });
      }
      const app = await pushStage(input.applicationId, input.to, sc.staff.fullName, input.reason, input.override);
      // automation: shortlisted → send form + invite (creates portal link + form row)
      if (input.to === "shortlisted" || input.to === "pre_interview_forms_sent") {
        const hasForm = await db.from("preInterviewForms").eq("applicationId", app.id).first<PreInterviewForms>();
        if (!hasForm) await db.from("preInterviewForms").insert({ applicationId: app.id, data: {} });
        if (app.stage !== input.to) {
          // already moved; also ensure forms_sent stage
        }
        if (input.to === "shortlisted") await pushStage(app.id, "pre_interview_forms_sent", "System (automation)");
      }
      return { ok: true };
    }),

  /** AI: suggest weighted screening requirements from the job description (admin reviews before Live). */
  extractRequirementsFromJD: authedQuery
    .input(z.object({ jobId: z.number().optional(), title: z.string(), descriptionMd: z.string().min(10) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const result = await callAI({
        feature: "extractRequirementsFromJD", promptVersion: "1.0", schema: aiRequirementsSchema, temperature: 0.2,
        validate: (r) => r.requirements.length > 0,
        system: `You extract screening requirements from UK domiciliary care job descriptions. Return strict JSON only.`,
        user: `Job title: ${input.title}\n\nJob description:\n${input.descriptionMd.slice(0, 6000)}\n\nExtract 4-8 screenable requirements. For each: key (lowercase_snake), label (short, reviewable by a human), weight (1-40, importance), required (true only for genuine must-haves such as right to work), rationale. Weights should sum to roughly 100.`,
      });
      const reqs = result.requirements.map((r) => ({ key: r.key, label: r.label, weight: r.weight, type: "scored", required: r.required }));
      if (input.jobId) {
        await audit(sc.staff.fullName, "ai_requirements_suggested", "job_postings", input.jobId, { count: reqs.length });
      }
      return { requirements: reqs };
    }),

  // ── AI screening ──
  runScreening: authedQuery
    .input(z.object({ applicationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "team_leader");
      const app = await db.from("applications").eq("id", input.applicationId).first<Applications>();
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      const job = (await db.from("jobPostings").eq("id", app.jobPostingId).first<JobPostings>())!;
      const reqs = (job.requirements as z.infer<typeof requirementSchema>[]) ?? [];

      // Form answers with labels — only fields flagged use_in_ai, with the published schema for labels
      let labelledAnswers: { label: string; value: unknown }[] = [];
      let knockoutHits: { fieldId: string; label: string; message: string }[] = [];
      if (app.formVersionId) {
        const ver = await db.from("applicationFormVersions").eq("id", app.formVersionId).first<ApplicationFormVersions>();
        const parsed = ver ? formSchemaDoc.safeParse(ver.schemaJson) : null;
        if (parsed?.success) {
          const answers = (app.answers ?? {}) as FormAnswers;
          knockoutHits = trippedKnockouts(parsed.data, answers);
          for (const section of parsed.data.sections) {
            for (const f of section.fields) {
              if (!f.useInAi || DISPLAY_TYPES.includes(f.type)) continue;
              if (!conditionMet(f, answers)) continue;
              const v = answers[f.id];
              if (v === undefined || v === null || v === "") continue;
              labelledAnswers.push({ label: f.label, value: v });
            }
          }
        }
      } else {
        labelledAnswers = Object.entries((app.answers ?? {}) as Record<string, unknown>).map(([k, v]) => ({ label: k, value: v }));
      }

      // Fairness: the model may read the file, but must not treat identity details as evidence.
      const cvText = (app.cvText ?? "").slice(0, 4000);
      let cvFile: Uint8Array | null = null;
      if (app.cvFileKey && (app.cvFileName ?? "").toLowerCase().endsWith(".pdf")) {
        cvFile = await readCv(app.cvFileKey);
      }
      const cvNote = !cvFile && app.cvUnreadable
        ? "\n[Note: the CV file could not be opened and the extracted text is empty. Score from the form answers and mark CV evidence as unknown.]"
        : "";

      const result = await callAI({
        feature: "scoreApplication", promptVersion: "3.0", schema: aiScreenSchema, temperature: 0.2,
        files: cvFile
          ? [{ data: cvFile, mediaType: "application/pdf", filename: app.cvFileName ?? "cv.pdf" }]
          : undefined,
        validate: (r) => reqs.length === 0 || r.requirement_results.length > 0,
        system: `You are screening a care worker application for a UK domiciliary care provider. Read the attached CV file when one is provided, including scanned pages. Score each requirement strictly against evidence in that CV and the form answers. Quote the exact evidence. Never infer protected characteristics (age, gender, ethnicity, religion, disability, pregnancy). Do not use the candidate's name, email, phone, or home address as evidence. Reply with strict JSON only.`,
        user: `Job: ${job.title}\nJob description:\n${(job.descriptionMd ?? "").slice(0, 2500)}\n\nRequirements (key, weight, required):\n${reqs.map((r) => `- ${r.key} (weight ${r.weight}${r.required ? ", REQUIRED" : ""}): ${r.label}`).join("\n")}\n\nForm answers (labelled):\n${labelledAnswers.map((a) => `- ${a.label}: ${JSON.stringify(a.value)}`).join("\n")}\n\n${cvFile ? "The CV PDF is attached. Read that file. Extracted text below is only a backup.\n\n" : ""}CV text:\n${cvText}${cvNote}\n\nFor each requirement give met=yes|partial|no|unknown, an exact evidence quote, and source=cv|form. Also strengths[], gaps[], a 3-4 sentence summary, and flags[] (e.g. employment gaps, missing right-to-work evidence).`,
      });

      const score = computeScore(reqs, result.requirement_results);
      const flags = [
        ...result.flags,
        ...knockoutHits.map((h) => `Knockout: ${h.message}`),
        ...(app.cvUnreadable && !cvFile ? ["CV unreadable — manual review"] : []),
      ];
      await db.from("applications").eq("id", app.id).update({
        aiScore: score, aiBreakdown: result.requirement_results as never,
        aiSummary: result.summary,
        aiFlags: flags as never,
      });
      await audit(sc.staff.fullName, "ai_screening", "applications", app.id, { score });

      // Knockout tripped → flag + human review, never auto-reject and never auto-shortlist
      const knockoutTripped = knockoutHits.length > 0;
      // automation: threshold rules — shortlist automatically; 60-84 → review; <60 stays applied until human bulk-confirms
      const threshold = job.screeningThreshold ?? 85;
      if (app.stage === "applied" || app.stage === "review") {
        if (knockoutTripped) {
          if (app.stage === "applied") await pushStage(app.id, "review", "System (knockout flag — human review)");
        } else if (score >= threshold) {
          if (app.stage === "review") {
            // review → shortlisted is allowed
          }
          await pushStage(app.id, "shortlisted", "System (AI screening)");
          const hasForm = await db.from("preInterviewForms").eq("applicationId", app.id).first<PreInterviewForms>();
          if (!hasForm) await db.from("preInterviewForms").insert({ applicationId: app.id, data: {} });
          await pushStage(app.id, "pre_interview_forms_sent", "System (automation)");
          // interview invitation email
          const cand = await db.from("candidates").eq("id", app.candidateId).first<Candidates>();
          if (cand?.email) {
            await sendEmail({
              to: cand.email,
              subject: `Great news — next steps for ${job.title} at Unique Care UK`,
              body: `Dear ${cand.firstName},\n\nThank you for applying for ${job.title}. We would like to invite you to the next stage.\n\nPlease open your personal candidate portal to complete your pre-interview forms and book your interview slot.\n\nKind regards,\nUnique Care UK recruitment team`,
              kind: "interview_invitation",
              relatedType: "application",
              relatedId: app.id,
            });
          }
        } else if (score >= 60) {
          if (app.stage === "applied") await pushStage(app.id, "review", "System (AI screening)");
        }
      }
      return {
        score, requirementResults: result.requirement_results,
        strengths: result.strengths, gaps: result.gaps,
        summary: result.summary, flags, knockoutTripped,
      };
    }),

  bulkScreenOut: authedQuery
    .input(z.object({ applicationIds: z.array(z.number()).min(1), reason: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      for (const id of input.applicationIds) {
        await db.from("applications").eq("id", id).update({ rejectionReason: input.reason });
        await pushStage(id, "screened_out", sc.staff.fullName, input.reason);
      }
      return { ok: true, count: input.applicationIds.length };
    }),
});

// ── Exported as a second router merged in router.ts ──
export const hrRouter2 = createRouter({
  // ── Interviews ──
  slots: authedQuery.query(async () => {
    const slots = await db.from("interviewSlots").order("startsAt", "asc").many<InterviewSlots>();
    const bookings = await db.from("interviewBookings").eq("status", "booked").many<InterviewBookings>();
    const staff = await db.from("staffProfiles").many<StaffProfiles>();
    return slots.map((sl) => ({
      ...sl,
      bookedCount: bookings.filter((b) => b.slotId === sl.id).length,
      panel: staff.filter((s2) => ((sl.panelMemberIds as number[]) ?? []).includes(Number(s2.id))).map((p) => p.fullName),
    }));
  }),

  createSlot: authedQuery
    .input(z.object({
      startsAt: z.string(), endsAt: z.string(), jobPostingId: z.number().optional(),
      panelMemberIds: z.array(z.number()), capacity: z.number().min(1).max(5).default(1),
      locationText: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      // Fallback mode: no Microsoft Graph — admin pastes a Teams link manually (adapter interface)
      const [row] = await db.from("interviewSlots").insert<InterviewSlots>({
        startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt),
        jobPostingId: input.jobPostingId ?? null, panelMemberIds: input.panelMemberIds as never,
        capacity: input.capacity, locationText: input.locationText ?? "Microsoft Teams (video interview)",
        teamsMeetingUrl: `https://teams.microsoft.com/l/meetup-join/${token().slice(0, 12)}`,
      });
      await audit(sc.staff.fullName, "interview_slot_created", "interview_slots", row.id);
      return { id: row.id };
    }),

  submitScorecard: authedQuery
    .input(z.object({
      applicationId: z.number(),
      scores: z.array(z.object({ criterion: z.string(), score: z.number().min(1).max(5), comment: z.string().optional() })).min(1),
      recommendation: z.enum(["strong_yes", "yes", "no", "strong_no"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "interview_panel", "team_leader");
      const existing = await db.from("interviewScorecards").eq("applicationId", input.applicationId).eq("panelMemberId", sc.staff.id).first<InterviewScorecards>();
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "You have already submitted your scorecard." });
      const total = input.scores.reduce((a, b) => a + b.score, 0);
      await db.from("interviewScorecards").insert({
        applicationId: input.applicationId, panelMemberId: sc.staff.id,
        scores: input.scores as never, total: String(total),
        recommendation: input.recommendation, submittedAt: new Date(),
      });
      const app = (await db.from("applications").eq("id", input.applicationId).first<Applications>())!;
      if (app.stage === "interview_booked") await pushStage(app.id, "interviewed", "System (panel scoring)");
      // automation: all panel submitted → notify admin
      const booking = await db.from("interviewBookings").eq("applicationId", app.id).eq("status", "booked").first<InterviewBookings>();
      if (booking) {
        const slot = await db.from("interviewSlots").eq("id", booking.slotId).first<InterviewSlots>();
        const panelCount = ((slot?.panelMemberIds as number[]) ?? []).length;
        const submitted = await db.from("interviewScorecards").eq("applicationId", app.id).count();
        if (panelCount > 0 && submitted >= panelCount) {
          await notifyRoles(["admin", "super_admin"], {
            type: "hr", title: "Candidate ready for decision",
            body: `All panel scorecards submitted for application #${app.id}.`,
            link: `/recruitment/candidates/${app.id}`,
          });
        }
      }
      await audit(sc.staff.fullName, "scorecard_submitted", "applications", input.applicationId, { total });
      return { ok: true, total };
    }),

  leaderboard: authedQuery
    .input(z.object({ jobId: z.number().optional() }))
    .query(async ({ input }) => {
      const appsQuery = db.from("applications");
      if (input.jobId) appsQuery.eq("jobPostingId", input.jobId);
      const apps = await appsQuery.many<Applications>();
      const cards = await db.from("interviewScorecards").many<InterviewScorecards>();
      const cands = await db.from("candidates").many<Candidates>();
      const interviewed = apps.filter((a) => ["interviewed", "approved", "compliance_docs_requested", "compliance_docs_complete", "offer_sent", "offer_accepted", "training_booked", "online_training_in_progress", "dbs_verified", "training_complete", "hired"].includes(a.stage));
      return interviewed.map((a) => {
        const mine = cards.filter((c) => c.applicationId === a.id);
        const avg = mine.length ? mine.reduce((x, c) => x + Number(c.total ?? 0), 0) / mine.length : 0;
        const panelPct = mine.length ? Math.round((avg / 30) * 100) : 0;
        const combined = Math.round(0.5 * (a.aiScore ?? 0) + 0.5 * panelPct);
        return {
          applicationId: a.id, stage: a.stage, aiScore: a.aiScore,
          panelAvg: mine.length ? Number(avg.toFixed(1)) : null, panelPct, combined,
          candidate: cands.find((c) => c.id === a.candidateId),
          scorecards: mine.length,
        };
      }).sort((a, b) => b.combined - a.combined);
    }),

  // ── Compliance ──
  requestComplianceDocs: authedQuery
    .input(z.object({ applicationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const app = await db.from("applications").eq("id", input.applicationId).first<Applications>();
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      const reqs = await db.from("complianceRequirements").eq("required", true).many<ComplianceRequirements>();
      for (const req of reqs) {
        const has = await db.from("complianceDocuments")
          .eq("ownerType", "candidate")
          .eq("ownerId", app.candidateId)
          .eq("requirementKey", req.key)
          .first<ComplianceDocuments>();
        if (!has) {
          await db.from("complianceDocuments").insert({
            ownerType: "candidate", ownerId: app.candidateId, requirementKey: req.key, status: "requested",
          });
        }
      }
      // references
      const form = await db.from("preInterviewForms").eq("applicationId", app.id).first<PreInterviewForms>();
      const formRefs = ((form?.data as { referees?: { name: string; email: string; relationship: string; mostRecent: boolean }[] })?.referees) ?? [];
      for (const ref of formRefs) {
        const has = await db.from("references").eq("applicationId", app.id).eq("refereeEmail", ref.email).first<References>();
        if (!has) {
          await db.from("references").insert({
            applicationId: app.id, refereeName: ref.name, refereeEmail: ref.email,
            relationship: ref.relationship, isMostRecentEmployer: ref.mostRecent, token: token(),
          });
        }
      }
      await pushStage(app.id, "compliance_docs_requested", sc.staff.fullName);
      await audit(sc.staff.fullName, "compliance_requested", "applications", app.id);
      return { ok: true };
    }),

  verifyDocument: authedQuery
    .input(z.object({ id: z.number(), expiresAt: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      await db.from("complianceDocuments").eq("id", input.id).update({
        status: "verified", verifiedBy: sc.staff.fullName, verifiedAt: new Date(),
        expiresAt: input.expiresAt ?? null,
      });
      await audit(sc.staff.fullName, "document_verified", "compliance_documents", input.id);
      // automation: all required verified → compliance_docs_complete + offer letter
      const doc = (await db.from("complianceDocuments").eq("id", input.id).first<ComplianceDocuments>())!;
      if (doc.ownerType === "candidate") {
        const app = await db.from("applications").eq("candidateId", doc.ownerId).order("id", "desc").first<Applications>();
        if (app && ["compliance_docs_requested", "approved"].includes(app.stage)) {
          const reqs = await db.from("complianceRequirements").eq("required", true).many<ComplianceRequirements>();
          const docs = await db.from("complianceDocuments").eq("ownerType", "candidate").eq("ownerId", doc.ownerId).many<ComplianceDocuments>();
          const allVerified = reqs.every((r) => docs.some((d) => d.requirementKey === r.key && d.status === "verified"));
          if (allVerified) {
            if (app.stage === "compliance_docs_requested") await pushStage(app.id, "compliance_docs_complete", "System (automation)");
            const hasOffer = await db.from("offerLetters").eq("applicationId", app.id).first<OfferLetters>();
            if (!hasOffer) {
              const job = (await db.from("jobPostings").eq("id", app.jobPostingId).first<JobPostings>())!;
              const cand = (await db.from("candidates").eq("id", app.candidateId).first<Candidates>())!;
              await db.from("offerLetters").insert({
                applicationId: app.id, templateVersion: "v1",
                content: buildOfferLetter(cand.firstName + " " + cand.lastName, job.title, job.salaryText ?? ""),
                sentAt: new Date(),
              });
              await pushStage(app.id, "offer_sent", "System (automation)");
              await notifyRoles(["admin", "super_admin"], {
                type: "hr", title: "Offer letter sent automatically",
                body: `All compliance verified for application #${app.id}; offer letter generated and sent.`,
                link: `/recruitment/candidates/${app.id}`,
              });
            }
          }
        }
      }
      return { ok: true };
    }),

  rejectDocument: authedQuery
    .input(z.object({ id: z.number(), reason: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      await db.from("complianceDocuments").eq("id", input.id).update({
        status: "rejected", rejectionReason: input.reason,
      });
      await audit(sc.staff.fullName, "document_rejected", "compliance_documents", input.id, { reason: input.reason });
      return { ok: true };
    }),

  complianceQueue: authedQuery.query(async () => {
    const docs = await db.from("complianceDocuments").in("status", ["requested", "uploaded", "rejected"]).order("createdAt", "desc").many<ComplianceDocuments>();
    const reqs = await db.from("complianceRequirements").many<ComplianceRequirements>();
    const cands = await db.from("candidates").many<Candidates>();
    const staff = await db.from("staffProfiles").many<StaffProfiles>();
    return docs.map((d) => ({
      ...d,
      requirement: reqs.find((r) => r.key === d.requirementKey),
      ownerName: d.ownerType === "candidate"
        ? (() => { const c = cands.find((x) => x.id === d.ownerId); return c ? `${c.firstName} ${c.lastName}` : `#${d.ownerId}`; })()
        : staff.find((x) => x.id === d.ownerId)?.fullName ?? `#${d.ownerId}`,
    }));
  }),

  complianceMatrix: authedQuery.query(async () => {
    const staff = await db.from("staffProfiles").isNull("deletedAt").many<StaffProfiles>();
    const docs = await db.from("complianceDocuments").eq("ownerType", "staff").many<ComplianceDocuments>();
    const reqs = await db.from("complianceRequirements").many<ComplianceRequirements>();
    const enrolments = await db.from("trainingEnrolments").eq("personType", "staff").many<TrainingEnrolments>();
    const courses = await db.from("trainingCourses").many<TrainingCourses>();
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const cell = (status?: string, exp?: string | null) => {
      if (!status || status !== "verified" && status !== "completed") return "red";
      if (exp && exp < today) return "red";
      if (exp && exp < in30) return "amber";
      return "green";
    };
    const keyReqs = reqs.filter((r) => ["dbs_enhanced", "right_to_work", "photo_id", "health_declaration"].includes(r.key));
    const keyCourses = courses.filter((c) => c.mandatory).slice(0, 6);
    return {
      requirements: keyReqs, courses: keyCourses,
      rows: staff.map((s2) => ({
        staff: s2,
        docs: keyReqs.map((r) => {
          const d = docs.filter((x) => x.ownerId === s2.id && x.requirementKey === r.key).sort((a, b) => Number(b.id) - Number(a.id))[0];
          return { key: r.key, status: d?.status ?? "missing", expiresAt: d?.expiresAt ?? null, rag: cell(d?.status, d?.expiresAt ?? null) };
        }),
        training: keyCourses.map((c) => {
          const e = enrolments.filter((x) => x.personId === s2.id && x.courseId === c.id)[0];
          return { courseId: c.id, status: e?.status ?? "missing", expiresAt: e?.expiresAt ?? null, rag: cell(e?.status, e?.expiresAt ?? null) };
        }),
      })),
    };
  }),

  // ── Training ──
  courses: authedQuery.query(async () => db.from("trainingCourses").many<TrainingCourses>()),
  createSession: authedQuery
    .input(z.object({
      courseId: z.number(),
      startsAt: z.string(), endsAt: z.string(),
      location: z.string().optional(), capacity: z.number().int().min(1).max(100).optional(),
      trainerName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const course = await db.from("trainingCourses").eq("id", input.courseId).first<TrainingCourses>();
      if (!course) throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      const [row] = await db.from("trainingSessions").insert<TrainingSessions>({
        courseId: input.courseId, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt),
        location: input.location ?? null, capacity: input.capacity ?? 12, trainerName: input.trainerName ?? null,
      });
      await audit(sc.staff.fullName, "training_session_created", "training_sessions", row.id, { course: course.title });
      return { ok: true, id: row.id };
    }),

  sessions: authedQuery.query(async () => {
    const sessions = await db.from("trainingSessions").order("startsAt", "asc").many<TrainingSessions>();
    const enrolments = await db.from("trainingEnrolments").many<TrainingEnrolments>();
    const courses = await db.from("trainingCourses").many<TrainingCourses>();
    const cands = await db.from("candidates").many<Candidates>();
    const staff = await db.from("staffProfiles").many<StaffProfiles>();
    return sessions.map((se) => ({
      ...se,
      course: courses.find((c) => c.id === se.courseId),
      attendees: enrolments.filter((e) => e.sessionId === se.id).map((e) => ({
        ...e,
        name: e.personType === "candidate"
          ? (() => { const c = cands.find((x) => x.id === e.personId); return c ? `${c.firstName} ${c.lastName}` : "?"; })()
          : staff.find((x) => x.id === e.personId)?.fullName ?? "?",
        dbsVerified: false,
      })),
    }));
  }),

  dbsCheckIn: authedQuery
    .input(z.object({
      applicationId: z.number().optional(), sessionId: z.number().optional(),
      certificateNo: z.string().min(4), sightedOriginal: z.literal(true),
      updateServiceChecked: z.boolean(), barredListAdultsChecked: z.literal(true),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      await db.from("dbsVerifications").insert({
        applicationId: input.applicationId ?? null, certificateNo: input.certificateNo,
        sightedOriginal: input.sightedOriginal, updateServiceChecked: input.updateServiceChecked,
        barredListAdultsChecked: input.barredListAdultsChecked,
        verifiedBy: sc.staff.fullName, verifiedAt: new Date(), notes: input.notes ?? null,
      });
      if (input.applicationId) {
        const app = await db.from("applications").eq("id", input.applicationId).first<Applications>();
        if (app && ["training_booked", "online_training_in_progress", "offer_accepted"].includes(app.stage)) {
          if (app.stage === "offer_accepted") await pushStage(app.id, "training_booked", "System");
          if (app.stage === "training_booked") await pushStage(app.id, "online_training_in_progress", "System");
          const cur = (await db.from("applications").eq("id", app.id).first<Applications>())!;
          if (cur.stage === "online_training_in_progress") await pushStage(app.id, "dbs_verified", sc.staff.fullName);
        }
      }
      await audit(sc.staff.fullName, "dbs_verified_checkin", "dbs_verifications", input.applicationId);
      return { ok: true };
    }),

  completeTraining: authedQuery
    .input(z.object({ applicationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const app = await db.from("applications").eq("id", input.applicationId).first<Applications>();
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      const dbs = await db.from("dbsVerifications").eq("applicationId", app.id).first<DbsVerifications>();
      if (!dbs) throw new TRPCError({ code: "BAD_REQUEST", message: "DBS verification at check-in is required before training can be completed." });
      if (app.stage === "dbs_verified") await pushStage(app.id, "training_complete", sc.staff.fullName);
      // convert to care worker
      const cand = (await db.from("candidates").eq("id", app.candidateId).first<Candidates>())!;
      const existing = await db.from("staffProfiles").eq("email", cand.email).first<StaffProfiles>();
      let staffId: number;
      if (existing) {
        staffId = Number(existing.id);
        await db.from("staffProfiles").eq("id", staffId).update({ role: "care_worker", status: "active" });
      } else {
        const [row] = await db.from("staffProfiles").insert<StaffProfiles>({
          fullName: `${cand.firstName} ${cand.lastName}`, email: cand.email, phone: cand.phone,
          role: "care_worker", jobTitle: "Care Worker",
          employeeNo: `UC${Date.now().toString().slice(-5)}`,
          startDate: new Date().toISOString().slice(0, 10),
          employmentType: "full_time", contractedHours: "37.5", maxWeeklyHours: "48",
          homePostcode: cand.postcode, drives: cand.hasDrivingLicence ?? false,
          hasVehicle: cand.hasVehicle ?? false, skills: [], languages: ["English"], status: "active",
          avatarColor: "#1477AE",
        });
        staffId = row.id;
        // default weekday availability
        for (let d = 0; d < 5; d++) {
          await db.from("staffAvailability").insert({ staffId, dayOfWeek: d, startTime: "07:00", endTime: "15:00" });
        }
      }
      // copy compliance docs to staff file
      const docs = await db.from("complianceDocuments")
        .eq("ownerType", "candidate")
        .eq("ownerId", cand.id)
        .eq("status", "verified")
        .many<ComplianceDocuments>();
      for (const d of docs) {
        await db.from("complianceDocuments").insert({
          ownerType: "staff", ownerId: staffId, requirementKey: d.requirementKey,
          fileName: d.fileName, status: "verified", verifiedBy: d.verifiedBy,
          verifiedAt: d.verifiedAt, expiresAt: d.expiresAt,
        });
      }
      // copy training enrolments to staff record
      const enr = await db.from("trainingEnrolments").eq("personType", "candidate").eq("personId", cand.id).many<TrainingEnrolments>();
      for (const e of enr) {
        await db.from("trainingEnrolments").insert({
          courseId: e.courseId, personType: "staff", personId: staffId,
          status: e.status, completedAt: e.completedAt, expiresAt: e.expiresAt,
        });
      }
      // re-fetch: stage may have moved to training_complete above — final transition to hired
      const cur = await db.from("applications").eq("id", app.id).first<Applications>();
      if (cur?.stage === "training_complete") await pushStage(app.id, "hired", "System (automation)");
      await notifyRoles(["admin", "super_admin", "care_coordinator"], {
        type: "hr", title: `${cand.firstName} ${cand.lastName} is now an active care worker`,
        body: "Compliance documents and training copied to the staff file. Added to the rota pool.",
        link: `/staff`,
      });
      await audit(sc.staff.fullName, "candidate_hired", "applications", app.id, { staffId });
      return { ok: true, staffId };
    }),
});

function buildOfferLetter(name: string, role: string, salary: string) {
  const today = new Date().toLocaleDateString("en-GB");
  return `UNIQUE CARE UK — OFFER OF EMPLOYMENT

Date: ${today}

Dear ${name},

We are delighted to offer you the position of ${role} at Unique Care UK.

Pay: ${salary}
Hours: As per your contracted schedule, discussed at interview.
Start date: To be confirmed on completion of mandatory training.

This offer is made subject to satisfactory completion of all mandatory training and ongoing compliance with our regulatory requirements (CQC Regulation 19, Schedule 3).

Please accept this offer in your candidate portal by typing your full name as your electronic signature.

Yours sincerely,
Ruby Osei
Registered Manager, Unique Care UK`;
}

