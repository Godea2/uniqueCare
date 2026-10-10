import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, publicQuery } from "../middleware";
import { db } from "../db";
import {
  APPLICATION_STAGES,
  type ApplicationStage,
  type ApplicationForms,
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
  type StaffRole,
  type TrainingCourses,
  type TrainingEnrolments,
  type TrainingSessions,
} from "@db/schema";
import { getStaff, requireRole, audit, notifyRoles, ruleEnabled, canUseApp } from "../util";
import type { TrpcContext } from "../context";
import { geocodePostcode } from "../lib/geo";
import { callAI } from "../ai/provider";
import { sendEmail } from "../lib/mailer";
import { cvDownloadUrl, documentDownloadUrl, saveCv } from "../lib/cv-store";
import { appUrl, orgProfile, portalUrl } from "../lib/app-url";
import { jobRequirements, liveApplicationSchema, normaliseRequirements, syncJobForm } from "../lib/job-form";
import {
  ALLOW_PAST_INTERVIEW_SLOTS, canTransition, emailCandidate, emailCandidatesSlotsOpen, inviteToInterviewStage, pushStage, screenApplication, screenInBackground,
} from "../lib/recruitment";
import {
  validateSubmission, trippedKnockouts, suggestRequirementSetup, REQUIREMENT_ANSWER_TYPES,
  formSchemaDoc, type FormSchemaDoc, type FormAnswers,
} from "@contracts/form-schema";
import { extractCvText } from "../lib/cv-text";
import { waitUntil } from "@vercel/functions";
import crypto from "crypto";

const RECRUITMENT_ROLES: StaffRole[] = ["super_admin", "admin", "team_leader", "interview_panel"];

const REAPPLY_AFTER_DAYS = 30;

/** Admins and Registered Managers may apply repeatedly to test the form: signed in, or applying with their staff email. */
async function isAdminApplicant(ctx: TrpcContext, email: string): Promise<boolean> {
  const staff = await db.from("staffProfiles").isNull("deletedAt").many<StaffProfiles>();
  return staff.some((s) =>
    canUseApp(s) &&
    ["admin", "super_admin"].includes(s.homeRole ?? s.role) &&
    ((!!ctx.user && s.userId === ctx.user.id) || (!!email && s.email?.trim().toLowerCase() === email)));
}

const token = () => crypto.randomBytes(24).toString("hex");
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const newApplySlug = (title: string) => `${slugify(title).slice(0, 60)}-${crypto.randomBytes(4).toString("hex").slice(0, 6)}`;

const requirementInput = z.object({
  key: z.string().optional(), label: z.string().max(200), weight: z.number().min(0).max(100),
  type: z.string().optional(), required: z.boolean(),
  answerType: z.enum(REQUIREMENT_ANSWER_TYPES).optional(),
  question: z.string().max(300).optional(),
  options: z.array(z.object({ value: z.string().max(60).optional(), label: z.string().max(200) })).max(20).optional(),
  accepted: z.array(z.string().max(60)).max(20).optional(),
});

const jobInput = z.object({
  title: z.string().trim().min(3).max(200), location: z.string().trim().min(2).max(200),
  postcode: z.string().trim().max(10).optional(),
  salaryText: z.string().trim().max(120).optional(),
  employmentType: z.enum(["full_time", "part_time", "zero_hours", "bank"]),
  descriptionMd: z.string().trim().min(10).max(20000),
  requirements: z.array(requirementInput).max(20),
  screeningThreshold: z.number().min(50).max(100).default(85),
  closesAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional(),
  formTemplateId: z.number().optional(),
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

export const hrRouter = createRouter({
  // ── Job postings ──
  jobs: authedQuery.query(async () => {
    const jobs = await db.from("jobPostings").order("createdAt", "desc").many<JobPostings>();
    const sources = await db.from("jobLinkSources").many<JobLinkSources>();
    const apps = await db.from("applications").many<Applications>();
    const forms = await db.from("applicationForms").many<ApplicationForms>();
    return jobs.map((j) => {
      const form = forms.find((f) => f.jobPostingId === j.id);
      const jobApps = apps.filter((a) => a.jobPostingId === j.id);
      const bySource: Record<string, number> = {};
      for (const a of jobApps) {
        const key = a.sourceChannel ?? "direct";
        bySource[key] = (bySource[key] ?? 0) + 1;
      }
      return {
        ...j,
        linkSources: sources.filter((s) => s.jobPostingId === j.id),
        formTemplateId: form?.templateId ?? null,
        applicationCount: jobApps.length,
        applicationsBySource: bySource,
      };
    });
  }),

  createJob: authedQuery
    .input(jobInput)
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const { requirements, formTemplateId, ...fields } = input;
      const slug = slugify(input.title) + "-" + token().slice(0, 6);
      const [jobRow] = await db.from("jobPostings").insert<JobPostings>({
        ...fields, closesAt: fields.closesAt || null, requirements: normaliseRequirements(requirements) as never,
        publicSlug: slug, status: "draft",
        applySlug: newApplySlug(input.title), applyLinkEnabled: true, applyLinkCreatedAt: new Date(),
      });
      const job = (await db.from("jobPostings").eq("id", jobRow.id).first<JobPostings>())!;
      await syncJobForm(job, { by: sc.staff.fullName, publish: true, templateId: formTemplateId ?? null });
      await audit(sc.staff.fullName, "job_created", "job_postings", job.id, { title: input.title });
      return { id: job.id, slug };
    }),

  /** Edit a job. Requirement changes flow straight into the application form candidates see. */
  updateJob: authedQuery
    .input(jobInput.extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const { id, requirements, formTemplateId, ...fields } = input;
      const existing = await db.from("jobPostings").eq("id", id).first<JobPostings>();
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      const reqs = normaliseRequirements(requirements);
      if (existing.status === "live" && reqs.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A live job needs at least one screening requirement." });
      }
      await db.from("jobPostings").eq("id", id).update({
        ...fields, closesAt: fields.closesAt || null, requirements: reqs as never,
      });
      const job = (await db.from("jobPostings").eq("id", id).first<JobPostings>())!;
      const form = await db.from("applicationForms").eq("jobPostingId", id).first<ApplicationForms>();
      const switchTemplate = formTemplateId != null && formTemplateId !== form?.templateId;
      await syncJobForm(job, {
        by: sc.staff.fullName,
        publish: job.status === "live" || !form?.publishedVersionId || switchTemplate,
        templateId: switchTemplate ? formTemplateId : null,
      });
      await audit(sc.staff.fullName, "job_updated", "job_postings", id, { title: input.title });
      return { ok: true };
    }),

  setJobStatus: authedQuery
    .input(z.object({ id: z.number(), status: z.enum(["draft", "live", "closed"]) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const job = await db.from("jobPostings").eq("id", input.id).first<JobPostings>();
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      if (input.status === "live") {
        if (jobRequirements(job).length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Add at least one screening requirement before going live. Screening scores candidates against them.",
          });
        }
        await syncJobForm(job, { by: sc.staff.fullName, publish: true });
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
      const { schema, versionId: formVersionId } = await liveApplicationSchema(job);
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

      const applicantIsAdmin = await isAdminApplicant(ctx, String(input.answers.email ?? "").trim().toLowerCase());

      // Rate limit: 5 submissions per IP per hour
      const ip = (ctx.req?.headers.get("cf-connecting-ip") ?? ctx.req?.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
      const since = new Date(Date.now() - 3600_000);
      const recent = await db.from("rateLimitEvents").eq("bucket", "apply").eq("rlKey", ip).gt("createdAt", since).count();
      if (recent >= 5 && !applicantIsAdmin) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many submissions from this connection. Please try again later." });
      }
      // Load the SAME published schema the renderer used and validate server-side
      const { schema, versionId: formVersionId } = await liveApplicationSchema(job);
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
      await db.from("rateLimitEvents").insert({ bucket: "apply", rlKey: ip });

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

      // One application per email per job every 30 days. Admins are exempt so they can test the form.
      let cand = await db.from("candidates").eq("email", email).first<Candidates>();
      if (cand && !applicantIsAdmin) {
        const previous = await db.from("applications").eq("candidateId", cand.id).eq("jobPostingId", job.id)
          .order("createdAt", "desc").first<Applications>();
        const appliedAt = previous?.createdAt ? new Date(previous.createdAt) : null;
        if (appliedAt && Date.now() - appliedAt.getTime() < REAPPLY_AFTER_DAYS * 86_400_000) {
          const again = new Date(appliedAt.getTime() + REAPPLY_AFTER_DAYS * 86_400_000);
          const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
          throw new TRPCError({
            code: "CONFLICT",
            message: `You applied for ${job.title} on ${fmt(appliedAt)}. You can apply again from ${fmt(again)}. To follow your application, use the candidate portal link in your confirmation email.`,
          });
        }
      }
      if (cand) {
        await db.from("candidates").eq("id", cand.id).update({
          firstName, lastName, phone, postcode,
          rightToWorkStatus: rtw,
          hasDrivingLicence: answers.driving_licence === "yes",
          hasVehicle: answers.own_car === "yes",
        });
      } else {
        const [created] = await db.from("candidates").insert<Candidates>({
          firstName, lastName, email, phone, postcode,
          rightToWorkStatus: rtw,
          hasDrivingLicence: answers.driving_licence === "yes",
          hasVehicle: answers.own_car === "yes",
          sourceChannel,
        });
        cand = created;
      }

      const knockoutHits = trippedKnockouts(schema, answers);

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
      const appId = Number(ar.id);
      const portalTokenValue = (await db.from("applications").eq("id", appId).first<Applications>())!.portalToken;
      await db.from("cvVersions").insert({
        applicationId: appId, fileKey: input.cv.key, fileName: input.cv.fileName,
        sizeBytes: input.cv.size, mimeType: input.cv.mimeType,
        extractedText: input.cv.extractedText || null,
        extractStatus: input.cv.readable ? "ok" : "unreadable",
      });
      await audit("System", "application_received", "applications", appId, {
        job: job.title, source: sourceChannel, ...(applicantIsAdmin ? { adminTest: true } : {}),
      });

      const flags: string[] = [...knockoutHits.map((h) => `Knockout: ${h.message}`)];
      if (!input.cv.readable && !input.cv.fileName.toLowerCase().endsWith(".pdf")) flags.push("CV could not be read — check it manually");
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
      const canScreen = jobRequirements(job).length > 0 && await ruleEnabled("application_submitted");
      await notifyRoles(["admin", "super_admin"], {
        type: "hr", title: `New application — ${firstName} ${lastName}`,
        body: `Applied for ${job.title} (${sourceChannel}).${canScreen ? " Screening is running now." : ""}`,
        link: `/recruitment/pipeline/${appId}`,
      });
      const base = appUrl(ctx.req);
      const org = await orgProfile();
      await sendEmail({
        to: email,
        subject: `Your application — ${job.title} at ${org.name}`,
        body: `Dear ${firstName},\n\nThank you for applying to ${org.name}. We have received your application and our team will review it shortly.\n\nRole: ${job.title}${job.location ? `\nLocation: ${job.location}` : ""}\n\nYou can track your application, complete forms and book interviews in your candidate portal:\n${portalUrl(base, portalTokenValue)}\n\n${org.signOff}`,
        kind: "application_confirmation",
        relatedType: "application",
        relatedId: appId,
      });
      if (canScreen) waitUntil(screenInBackground(appId, base));
      return { applicationId: appId, portalToken: portalTokenValue };
    }),

  // ── Applications / pipeline ──
  pipeline: authedQuery
    .input(z.object({ jobId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      requireRole(await getStaff(ctx), ...RECRUITMENT_ROLES);
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
      requireRole(sc, ...RECRUITMENT_ROLES);
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
      await pushStage(input.applicationId, input.to, sc.staff.fullName, input.reason, input.override);
      const base = appUrl(ctx.req);
      if (input.to === "shortlisted" || input.to === "pre_interview_forms_sent") {
        await inviteToInterviewStage(input.applicationId, "System (automation)", base);
      }
      if (input.to === "rejected" || input.to === "screened_out" || input.to === "withdrawn") {
        await db.from("interviewBookings").eq("applicationId", input.applicationId).eq("status", "booked").update({ status: "cancelled" });
      }
      if (input.to === "rejected" || input.to === "screened_out") {
        await emailCandidate(input.applicationId, "unsuccessful", base);
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
        system: `You extract screening requirements from job descriptions for a UK care provider. The role may be front-line care or an office, management or support role — use only what the description asks for. Return strict JSON only.`,
        user: `Job title: ${input.title}\n\nJob description:\n${input.descriptionMd.slice(0, 6000)}\n\nExtract 4-8 screenable requirements. For each: key (lowercase_snake), label (short, reviewable by a human), weight (1-40, importance), required (true only for genuine must-haves such as right to work), rationale. Weights should sum to roughly 100.`,
      });
      const reqs = result.requirements.map((r) => ({
        key: r.key, label: r.label, weight: r.weight, type: "scored", required: r.required, ...suggestRequirementSetup(r.label),
      }));
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
      return screenApplication(input.applicationId, sc.staff.fullName, appUrl(ctx.req));
    }),

  bulkScreenOut: authedQuery
    .input(z.object({ applicationIds: z.array(z.number()).min(1), reason: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const base = appUrl(ctx.req);
      for (const id of input.applicationIds) {
        await db.from("applications").eq("id", id).update({ rejectionReason: input.reason });
        await pushStage(id, "screened_out", sc.staff.fullName, input.reason);
        await emailCandidate(id, "unsuccessful", base);
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
      locationText: z.string().trim().max(300).optional(),
      meetingUrl: z.string().trim().url().max(2000).optional().or(z.literal("")),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const startsAt = new Date(input.startsAt);
      const endsAt = new Date(input.endsAt);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The interview must end after it starts." });
      }
      if (!ALLOW_PAST_INTERVIEW_SLOTS && startsAt.getTime() <= Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a start time in the future. Candidates can only book interviews that haven't started yet." });
      }
      const meetingUrl = input.meetingUrl || null;
      const [row] = await db.from("interviewSlots").insert<InterviewSlots>({
        startsAt, endsAt,
        jobPostingId: input.jobPostingId ?? null, panelMemberIds: input.panelMemberIds as never,
        capacity: input.capacity,
        locationText: input.locationText || (meetingUrl ? "Video interview" : "In person — address to be confirmed"),
        teamsMeetingUrl: meetingUrl,
      });
      await audit(sc.staff.fullName, "interview_slot_created", "interview_slots", row.id);
      waitUntil(emailCandidatesSlotsOpen(input.jobPostingId ?? null, appUrl(ctx.req)).catch(() => {}));
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
            link: `/recruitment/pipeline/${app.id}`,
          });
        }
      }
      await audit(sc.staff.fullName, "scorecard_submitted", "applications", input.applicationId, { total });
      return { ok: true, total };
    }),

  leaderboard: authedQuery
    .input(z.object({ jobId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      requireRole(await getStaff(ctx), ...RECRUITMENT_ROLES);
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
      if (reqs.length === 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No compliance documents are set up yet. Load the compliance requirements in Supabase first." });
      }
      if (!canTransition(app.stage as ApplicationStage, "compliance_docs_requested")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Approve the candidate after interview before requesting documents." });
      }
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
      await emailCandidate(app.id, "compliance_requested", appUrl(ctx.req));
      return { ok: true };
    }),

  verifyDocument: authedQuery
    .input(z.object({ id: z.number(), expiresAt: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin");
      const pendingDoc = await db.from("complianceDocuments").eq("id", input.id).first<ComplianceDocuments>();
      if (!pendingDoc) throw new TRPCError({ code: "NOT_FOUND" });
      if (pendingDoc.status !== "uploaded" && pendingDoc.status !== "verified") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only uploaded documents can be verified." });
      }
      let expiresAt = input.expiresAt || null;
      if (!expiresAt) {
        const req = await db.from("complianceRequirements").eq("key", pendingDoc.requirementKey).first<ComplianceRequirements>();
        if (req?.expiresAfterMonths) {
          const d = new Date();
          d.setMonth(d.getMonth() + req.expiresAfterMonths);
          expiresAt = d.toISOString().slice(0, 10);
        }
      }
      await db.from("complianceDocuments").eq("id", input.id).update({
        status: "verified", verifiedBy: sc.staff.fullName, verifiedAt: new Date(), expiresAt,
      });
      await audit(sc.staff.fullName, "document_verified", "compliance_documents", input.id);
      // automation: all required verified → compliance_docs_complete + offer letter
      const doc = (await db.from("complianceDocuments").eq("id", input.id).first<ComplianceDocuments>())!;
      if (doc.ownerType === "candidate") {
        const app = await db.from("applications").eq("candidateId", doc.ownerId).order("id", "desc").first<Applications>();
        if (app && ["compliance_docs_requested", "approved"].includes(app.stage)) {
          const reqs = await db.from("complianceRequirements").eq("required", true).many<ComplianceRequirements>();
          const docs = await db.from("complianceDocuments").eq("ownerType", "candidate").eq("ownerId", doc.ownerId).many<ComplianceDocuments>();
          const allVerified = reqs.length > 0 && reqs.every((r) => docs.some((d) => d.requirementKey === r.key && d.status === "verified"));
          if (allVerified) {
            if (app.stage === "compliance_docs_requested") await pushStage(app.id, "compliance_docs_complete", "System (automation)");
            const hasOffer = await db.from("offerLetters").eq("applicationId", app.id).first<OfferLetters>();
            if (!hasOffer) {
              const job = (await db.from("jobPostings").eq("id", app.jobPostingId).first<JobPostings>())!;
              const cand = (await db.from("candidates").eq("id", app.candidateId).first<Candidates>())!;
              const org = await orgProfile();
              await db.from("offerLetters").insert({
                applicationId: app.id, templateVersion: "v2",
                content: buildOfferLetter({
                  name: `${cand.firstName} ${cand.lastName}`, role: job.title, salary: job.salaryText ?? "",
                  orgName: org.name, signatory: org.signatory, signatoryTitle: org.signatoryTitle,
                }),
                sentAt: new Date(),
              });
              await pushStage(app.id, "offer_sent", "System (automation)");
              await emailCandidate(app.id, "offer_sent", appUrl(ctx.req));
              await notifyRoles(["admin", "super_admin"], {
                type: "hr", title: "Offer letter sent automatically",
                body: `All compliance verified for application #${app.id}; offer letter generated and sent.`,
                link: `/recruitment/pipeline/${app.id}`,
              });
            }
          }
        }
      }
      return { ok: true };
    }),

  /** Short-lived link to an uploaded compliance document (office staff only). */
  documentUrl: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      requireRole(sc, "super_admin", "admin", "team_leader");
      const doc = await db.from("complianceDocuments").eq("id", input.id).first<ComplianceDocuments>();
      if (!doc?.fileKey) throw new TRPCError({ code: "NOT_FOUND", message: "No file has been uploaded for this document." });
      await audit(sc.staff.fullName, "document_viewed", "compliance_documents", input.id);
      return { url: await documentDownloadUrl(doc.fileKey) };
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
      const doc = await db.from("complianceDocuments").eq("id", input.id).first<ComplianceDocuments>();
      if (doc?.ownerType === "candidate") {
        const app = await db.from("applications").eq("candidateId", doc.ownerId).order("id", "desc").first<Applications>();
        if (app) await emailCandidate(Number(app.id), "document_rejected", appUrl(ctx.req), { note: input.reason });
      }
      return { ok: true };
    }),

  complianceQueue: authedQuery.query(async ({ ctx }) => {
    requireRole(await getStaff(ctx), "super_admin", "admin", "team_leader");
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

  complianceMatrix: authedQuery.query(async ({ ctx }) => {
    requireRole(await getStaff(ctx), "super_admin", "admin", "team_leader");
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
      const starts = new Date(input.startsAt);
      const ends = new Date(input.endsAt);
      if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The session must end after it starts." });
      }
      const [row] = await db.from("trainingSessions").insert<TrainingSessions>({
        courseId: input.courseId, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt),
        location: input.location ?? null, capacity: input.capacity ?? 12, trainerName: input.trainerName ?? null,
      });
      await audit(sc.staff.fullName, "training_session_created", "training_sessions", row.id, { course: course.title });
      return { ok: true, id: row.id };
    }),

  sessions: authedQuery.query(async ({ ctx }) => {
    requireRole(await getStaff(ctx), "super_admin", "admin", "team_leader");
    const sessions = await db.from("trainingSessions").order("startsAt", "asc").many<TrainingSessions>();
    const enrolments = await db.from("trainingEnrolments").many<TrainingEnrolments>();
    const courses = await db.from("trainingCourses").many<TrainingCourses>();
    const cands = await db.from("candidates").many<Candidates>();
    const staff = await db.from("staffProfiles").many<StaffProfiles>();
    const apps = await db.from("applications").order("id", "desc").many<Applications>();
    const dbsChecks = await db.from("dbsVerifications").many<DbsVerifications>();
    const latestApp = (candidateId: number) => apps.find((a) => a.candidateId === candidateId);
    return sessions.map((se) => ({
      ...se,
      course: courses.find((c) => c.id === se.courseId),
      attendees: enrolments.filter((e) => e.sessionId === se.id).map((e) => {
        const app = e.personType === "candidate" ? latestApp(e.personId) : undefined;
        return {
          ...e,
          name: e.personType === "candidate"
            ? (() => { const c = cands.find((x) => x.id === e.personId); return c ? `${c.firstName} ${c.lastName}` : "?"; })()
            : staff.find((x) => x.id === e.personId)?.fullName ?? "?",
          applicationId: app?.id ?? null,
          stage: app?.stage ?? null,
          dbsVerified: !!app && dbsChecks.some((d) => d.applicationId === app.id),
        };
      }),
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
        const path: ApplicationStage[] = ["offer_accepted", "training_booked", "online_training_in_progress", "dbs_verified"];
        const app = await db.from("applications").eq("id", input.applicationId).first<Applications>();
        const from = app ? path.indexOf(app.stage as ApplicationStage) : -1;
        if (app && from >= 0) {
          for (let i = from + 1; i < path.length; i++) {
            await pushStage(app.id, path[i], i === path.length - 1 ? sc.staff.fullName : "System");
          }
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
      if (app.stage === "hired") throw new TRPCError({ code: "BAD_REQUEST", message: "This candidate has already been hired." });
      if (!["dbs_verified", "training_complete"].includes(app.stage)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Record the DBS check at training check-in first." });
      }
      if (app.stage === "dbs_verified") await pushStage(app.id, "training_complete", sc.staff.fullName);
      const cand = (await db.from("candidates").eq("id", app.candidateId).first<Candidates>())!;
      const job = await db.from("jobPostings").eq("id", app.jobPostingId).first<JobPostings>();
      const existing = await db.from("staffProfiles").eq("email", cand.email).first<StaffProfiles>();
      let staffId: number;
      if (existing) {
        // Never downgrade an existing office account; only reactivate it.
        staffId = Number(existing.id);
        await db.from("staffProfiles").eq("id", staffId).update({ status: "active", deletedAt: null });
      } else {
        const home = cand.postcode ? await geocodePostcode(cand.postcode) : null;
        const [row] = await db.from("staffProfiles").insert<StaffProfiles>({
          lat: home ? String(home.lat) : null, lng: home ? String(home.lng) : null,
          fullName: `${cand.firstName} ${cand.lastName}`, email: cand.email, phone: cand.phone,
          role: "care_worker", jobTitle: job?.title ?? "Care Worker",
          employeeNo: `UC${Date.now().toString().slice(-5)}`,
          startDate: new Date().toISOString().slice(0, 10),
          employmentType: job?.employmentType ?? "full_time", contractedHours: "37.5", maxWeeklyHours: "48",
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
          fileName: d.fileName, fileKey: d.fileKey, status: "verified", verifiedBy: d.verifiedBy,
          verifiedAt: d.verifiedAt, expiresAt: d.expiresAt,
        });
      }
      // classroom sessions already held count as attended and completed
      const allCourses = await db.from("trainingCourses").many<TrainingCourses>();
      const heldSessions = await db.from("trainingSessions").lte("startsAt", new Date()).many<TrainingSessions>();
      const candEnrolments = await db.from("trainingEnrolments").eq("personType", "candidate").eq("personId", cand.id).many<TrainingEnrolments>();
      for (const e of candEnrolments) {
        if (e.status === "completed" || !e.sessionId || !heldSessions.some((s) => s.id === e.sessionId)) continue;
        const months = allCourses.find((c) => c.id === e.courseId)?.renewEveryMonths;
        const completedAt = new Date();
        let expiresAt: string | null = null;
        if (months) {
          const d = new Date(completedAt);
          d.setMonth(d.getMonth() + months);
          expiresAt = d.toISOString().slice(0, 10);
        }
        await db.from("trainingEnrolments").eq("id", e.id).update({ status: "completed", completedAt, expiresAt });
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
        type: "hr", title: `${cand.firstName} ${cand.lastName} has joined as ${job?.title ?? "a new starter"}`,
        body: "Compliance documents and training copied to the staff file.",
        link: `/staff`,
      });
      await audit(sc.staff.fullName, "candidate_hired", "applications", app.id, { staffId });
      await emailCandidate(app.id, "hired", appUrl(ctx.req));
      return { ok: true, staffId };
    }),
});

function buildOfferLetter(o: { name: string; role: string; salary: string; orgName: string; signatory: string; signatoryTitle: string }) {
  const today = new Date().toLocaleDateString("en-GB");
  return `${o.orgName.toUpperCase()} — OFFER OF EMPLOYMENT

Date: ${today}

Dear ${o.name},

We are delighted to offer you the position of ${o.role} at ${o.orgName}.

Pay: ${o.salary || "As discussed at interview"}
Hours: As per your contracted schedule, discussed at interview.
Start date: To be confirmed on completion of mandatory training.

This offer is made subject to satisfactory completion of all mandatory training and ongoing compliance with our regulatory requirements (CQC Regulation 19, Schedule 3).

Please accept this offer in your candidate portal by typing your full name as your electronic signature.

Yours sincerely,
${o.signatory}${o.signatoryTitle ? `\n${o.signatoryTitle}` : ""}
${o.orgName}`;
}

