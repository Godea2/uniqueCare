import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware";
import { db } from "../db";
import type {
  Applications, Candidates, JobPostings, PreInterviewForms, InterviewSlots,
  InterviewBookings, ComplianceDocuments, ComplianceRequirements, OfferLetters,
  TrainingCourses, TrainingSessions, TrainingEnrolments,
} from "@db/schema";
import { audit, notifyRoles } from "../util";
import { saveDocument, sniffDocument } from "../lib/cv-store";
import { appUrl } from "../lib/app-url";
import { emailCandidate } from "../lib/recruitment";

const slotOpen = (s: InterviewSlots, jobId: number) =>
  (s.jobPostingId == null || s.jobPostingId === jobId) && new Date(s.startsAt).getTime() > Date.now();

async function appByToken(portalToken: string) {
  const app = await db.from("applications").eq("portalToken", portalToken).first<Applications>();
  if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Portal link not valid. Please use the link from your email." });
  const candidate = await db.from("candidates").eq("id", app.candidateId).first<Candidates>();
  const job = await db.from("jobPostings").eq("id", app.jobPostingId).first<JobPostings>();
  return { app, candidate: candidate!, job: job! };
}

export const portalRouter = createRouter({
  get: publicQuery
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const { app, candidate, job } = await appByToken(input.token);
      const form = await db.from("preInterviewForms").eq("applicationId", app.id).first<PreInterviewForms>() ?? null;
      const booking = await db.from("interviewBookings")
        .eq("applicationId", app.id).eq("status", "booked").first<InterviewBookings>() ?? null;
      const slot = booking ? await db.from("interviewSlots").eq("id", booking.slotId).first<InterviewSlots>() : null;
      const formsComplete = ["pre_interview_forms_complete", "interview_booked", "interviewed", "approved", "compliance_docs_requested", "compliance_docs_complete", "offer_sent", "offer_accepted", "training_booked", "online_training_in_progress", "dbs_verified", "training_complete", "hired"].includes(app.stage);
      const slotBookings = await db.from("interviewBookings").eq("status", "booked").many<InterviewBookings>();
      const openSlots = formsComplete
        ? (await db.from("interviewSlots").gt("startsAt", new Date()).order("startsAt", "asc").many<InterviewSlots>())
          .filter((s) => slotOpen(s, Number(job.id)))
          .filter((s) => s.id === slot?.id || slotBookings.filter((b) => b.slotId === s.id).length < (s.capacity ?? 1))
        : [];
      const docs = await db.from("complianceDocuments")
        .eq("ownerType", "candidate").eq("ownerId", candidate.id).many<ComplianceDocuments>();
      const reqs = await db.from("complianceRequirements").many<ComplianceRequirements>();
      const offer = await db.from("offerLetters").eq("applicationId", app.id).order("id", "desc").first<OfferLetters>() ?? null;
      const enrolments = await db.from("trainingEnrolments")
        .eq("personType", "candidate").eq("personId", candidate.id).many<TrainingEnrolments>();
      const courses = await db.from("trainingCourses").many<TrainingCourses>();
      const sessions = await db.from("trainingSessions").gt("startsAt", new Date()).many<TrainingSessions>();
      const complianceDone = ["compliance_docs_complete", "offer_sent", "offer_accepted", "training_booked", "online_training_in_progress", "dbs_verified", "training_complete", "hired"].includes(app.stage);
      const offerAccepted = ["offer_accepted", "training_booked", "online_training_in_progress", "dbs_verified", "training_complete", "hired"].includes(app.stage);
      return {
        application: app, candidate, job, form, booking, slot,
        availableSlots: openSlots.map((s) => ({
          ...s,
          bookedCount: slotBookings.filter((b) => b.slotId === s.id).length,
        })),
        docs: docs.map((d) => ({ ...d, requirement: reqs.find((r) => r.key === d.requirementKey) })),
        offer, complianceDone, offerAccepted,
        enrolments: enrolments.map((e) => ({ ...e, course: courses.find((c) => c.id === e.courseId) })),
        sessions: offerAccepted ? sessions : [],
        stageIndex: APPLICATION_STAGE_ORDER.indexOf(app.stage),
      };
    }),

  saveForm: publicQuery
    .input(z.object({
      token: z.string(),
      data: z.record(z.string(), z.unknown()),
      submit: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const { app } = await appByToken(input.token);
      if (!["pre_interview_forms_sent", "shortlisted"].includes(app.stage))
        throw new TRPCError({ code: "BAD_REQUEST", message: "The form is not open for this application." });
      const existing = await db.from("preInterviewForms").eq("applicationId", app.id).first<PreInterviewForms>();
      const merged = { ...((existing?.data as object) ?? {}), ...input.data };
      if (existing) {
        await db.from("preInterviewForms").eq("id", existing.id).update({
          data: merged as never, submittedAt: input.submit ? new Date() : null,
        });
      } else {
        await db.from("preInterviewForms").insert({
          applicationId: app.id, data: merged as never, submittedAt: input.submit ? new Date() : null,
        });
      }
      if (input.submit && app.stage === "pre_interview_forms_sent") {
        const history = [...((app.stageHistory as never[]) ?? []), {
          from: "pre_interview_forms_sent", to: "pre_interview_forms_complete",
          actor: "Candidate (portal)", at: new Date().toISOString(),
        }];
        await db.from("applications").eq("id", app.id).update({ stage: "pre_interview_forms_complete", stageHistory: history as never });
        await audit("Candidate (portal)", "pre_interview_form_submitted", "applications", app.id);
        await notifyRoles(["admin", "super_admin"], {
          type: "hr", title: "Pre-interview form completed",
          body: `Application #${app.id} can now book an interview. Make sure there are open interview slots.`,
          link: `/recruitment/pipeline/${app.id}`,
        });
      }
      return { ok: true };
    }),

  bookSlot: publicQuery
    .input(z.object({ token: z.string(), slotId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const { app, candidate, job } = await appByToken(input.token);
      if (!["pre_interview_forms_complete", "interview_booked"].includes(app.stage))
        throw new TRPCError({ code: "BAD_REQUEST", message: "Interview booking unlocks once your pre-interview form is complete." });
      const slot = await db.from("interviewSlots").eq("id", input.slotId).first<InterviewSlots>();
      if (!slot || !slotOpen(slot, Number(job.id))) throw new TRPCError({ code: "NOT_FOUND", message: "This slot is no longer available." });
      const current = await db.from("interviewBookings").eq("applicationId", app.id).eq("status", "booked").first<InterviewBookings>();
      if (current?.slotId === slot.id) return { ok: true, teamsMeetingUrl: slot.teamsMeetingUrl };
      const booked = await db.from("interviewBookings").eq("slotId", slot.id).eq("status", "booked").count();
      if (booked >= (slot.capacity ?? 1)) throw new TRPCError({ code: "CONFLICT", message: "This slot is now full — please pick another." });
      // release any previous booking (reschedule)
      await db.from("interviewBookings").eq("applicationId", app.id).eq("status", "booked").update({ status: "cancelled" });
      await db.from("interviewBookings").insert({ slotId: slot.id, applicationId: app.id });
      if (app.stage === "pre_interview_forms_complete") {
        const history = [...((app.stageHistory as never[]) ?? []), {
          from: app.stage, to: "interview_booked", actor: "Candidate (portal)", at: new Date().toISOString(),
        }];
        await db.from("applications").eq("id", app.id).update({ stage: "interview_booked", stageHistory: history as never });
      }
      await audit("Candidate (portal)", "interview_booked", "applications", app.id, { slotId: slot.id, email: candidate.email });
      const when = new Date(slot.startsAt).toLocaleString("en-GB", {
        timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
      });
      await emailCandidate(Number(app.id), "interview_booked", appUrl(ctx.req), {
        when, where: slot.teamsMeetingUrl ? `${slot.locationText ?? "Video interview"} — ${slot.teamsMeetingUrl}` : slot.locationText ?? undefined,
      });
      await notifyRoles(["admin", "super_admin"], {
        type: "hr", title: `Interview booked — ${candidate.firstName} ${candidate.lastName}`,
        body: `${job.title}, ${when}.`, link: `/recruitment/pipeline/${app.id}`,
      });
      return { ok: true, teamsMeetingUrl: slot.teamsMeetingUrl };
    }),

  uploadDoc: publicQuery
    .input(z.object({
      token: z.string(), requirementKey: z.string().min(1).max(60),
      fileName: z.string().min(1).max(255),
      contentBase64: z.string().min(1).max(14_000_000),
    }))
    .mutation(async ({ input }) => {
      const { app, candidate } = await appByToken(input.token);
      if (["rejected", "withdrawn", "screened_out"].includes(app.stage)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This application is closed." });
      }
      const doc = await db.from("complianceDocuments")
        .eq("ownerType", "candidate")
        .eq("ownerId", candidate.id)
        .eq("requirementKey", input.requirementKey)
        .first<ComplianceDocuments>();
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "We have not asked for this document." });
      if (doc.status === "verified") throw new TRPCError({ code: "BAD_REQUEST", message: "This document is already verified." });
      const bytes = Uint8Array.from(Buffer.from(input.contentBase64, "base64"));
      if (bytes.length > 10 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Files must be 10 MB or smaller." });
      const mime = sniffDocument(bytes, input.fileName);
      if (!mime) throw new TRPCError({ code: "BAD_REQUEST", message: "Upload a PDF, photo (JPG, PNG, HEIC) or Word document." });
      let key: string;
      try {
        ({ key } = await saveDocument(`candidate-${candidate.id}`, bytes, input.fileName, mime));
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : "Upload failed." });
      }
      await db.from("complianceDocuments").eq("id", doc.id).update({
        status: "uploaded", fileName: input.fileName, fileKey: key, rejectionReason: null,
      });
      await audit("Candidate (portal)", "document_uploaded", "applications", app.id, { requirement: input.requirementKey });
      await notifyRoles(["admin", "super_admin"], {
        type: "hr", title: `Document to check — ${candidate.firstName} ${candidate.lastName}`,
        body: `${input.requirementKey.replace(/_/g, " ")} uploaded.`, link: "/recruitment/compliance",
      });
      return { ok: true };
    }),

  acceptOffer: publicQuery
    .input(z.object({ token: z.string(), signatureName: z.string().min(2) }))
    .mutation(async ({ input, ctx }) => {
      const { app, candidate } = await appByToken(input.token);
      if (app.stage !== "offer_sent")
        throw new TRPCError({ code: "BAD_REQUEST", message: "There is no open offer for this application." });
      const offer = await db.from("offerLetters").eq("applicationId", app.id).order("id", "desc").first<OfferLetters>();
      if (!offer) throw new TRPCError({ code: "NOT_FOUND" });
      const ip = ctx.req.headers.get("x-forwarded-for") ?? "";
      await db.from("offerLetters").eq("id", offer.id).update({
        acceptedAt: new Date(), signatureName: input.signatureName, signatureIp: ip,
      });
      const history = [...((app.stageHistory as never[]) ?? []), {
        from: "offer_sent", to: "offer_accepted", actor: `Candidate (portal, signed as ${input.signatureName})`, at: new Date().toISOString(),
      }];
      await db.from("applications").eq("id", app.id).update({ stage: "offer_accepted", stageHistory: history as never });
      // automation: enrol on mandatory online courses
      const courses = await db.from("trainingCourses").eq("mandatory", true).many<TrainingCourses>();
      for (const c of courses.filter((c) => c.type === "online")) {
        const has = await db.from("trainingEnrolments")
          .eq("courseId", c.id).eq("personType", "candidate")
          .eq("personId", candidate.id).first<TrainingEnrolments>();
        if (!has) {
          await db.from("trainingEnrolments").insert({
            courseId: c.id, personType: "candidate", personId: candidate.id, status: "invited",
          });
        }
      }
      await audit("Candidate (portal)", "offer_accepted", "applications", app.id);
      await notifyRoles(["admin", "super_admin"], {
        type: "hr", title: `Offer accepted — ${candidate.firstName} ${candidate.lastName}`,
        body: "Online training has been assigned. Book them onto a classroom session.",
        link: `/recruitment/pipeline/${app.id}`,
      });
      return { ok: true };
    }),

  registerTraining: publicQuery
    .input(z.object({ token: z.string(), sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const { app, candidate } = await appByToken(input.token);
      if (!["offer_accepted", "training_booked", "online_training_in_progress"].includes(app.stage))
        throw new TRPCError({ code: "BAD_REQUEST", message: "Training registration opens after you accept your offer." });
      const session = await db.from("trainingSessions").eq("id", input.sessionId).first<TrainingSessions>();
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const has = await db.from("trainingEnrolments")
        .eq("sessionId", session.id).eq("personType", "candidate")
        .eq("personId", candidate.id).first<TrainingEnrolments>();
      if (!has) {
        if (new Date(session.startsAt).getTime() <= Date.now()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "That session has already started. Please pick another date." });
        }
        const taken = await db.from("trainingEnrolments").eq("sessionId", session.id).count();
        if (session.capacity != null && taken >= session.capacity) {
          throw new TRPCError({ code: "CONFLICT", message: "That session is full. Please pick another date." });
        }
        await db.from("trainingEnrolments").insert({
          sessionId: session.id, courseId: session.courseId, personType: "candidate",
          personId: candidate.id, status: "registered",
        });
      }
      if (app.stage === "offer_accepted") {
        const history = [...((app.stageHistory as never[]) ?? []), {
          from: "offer_accepted", to: "training_booked", actor: "Candidate (portal)", at: new Date().toISOString(),
        }];
        await db.from("applications").eq("id", app.id).update({ stage: "training_booked", stageHistory: history as never });
      }
      await audit("Candidate (portal)", "training_registered", "applications", app.id, { sessionId: session.id });
      return { ok: true };
    }),

  markCourseComplete: publicQuery
    .input(z.object({ token: z.string(), courseId: z.number() }))
    .mutation(async ({ input }) => {
      const { app, candidate } = await appByToken(input.token);
      const e = await db.from("trainingEnrolments")
        .eq("courseId", input.courseId).eq("personType", "candidate")
        .eq("personId", candidate.id).first<TrainingEnrolments>();
      if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "You are not enrolled on this course." });
      const course = await db.from("trainingCourses").eq("id", input.courseId).first<TrainingCourses>();
      if (course?.type !== "online") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Classroom courses are signed off by the trainer." });
      }
      const completedAt = new Date();
      let expiresAt: string | null = null;
      if (course.renewEveryMonths) {
        const d = new Date(completedAt);
        d.setMonth(d.getMonth() + course.renewEveryMonths);
        expiresAt = d.toISOString().slice(0, 10);
      }
      await db.from("trainingEnrolments").eq("id", e.id).update({ status: "completed", completedAt, expiresAt });
      if (app.stage === "training_booked") {
        const history = [...((app.stageHistory as never[]) ?? []), {
          from: "training_booked", to: "online_training_in_progress", actor: "Candidate (portal)", at: new Date().toISOString(),
        }];
        await db.from("applications").eq("id", app.id).update({ stage: "online_training_in_progress", stageHistory: history as never });
      }
      return { ok: true };
    }),
});

const APPLICATION_STAGE_ORDER = [
  "applied", "screened_out", "review", "shortlisted", "pre_interview_forms_sent",
  "pre_interview_forms_complete", "interview_booked", "interviewed", "approved",
  "compliance_docs_requested", "compliance_docs_complete", "offer_sent",
  "offer_accepted", "training_booked", "online_training_in_progress",
  "dbs_verified", "training_complete", "hired", "rejected", "withdrawn",
];
