import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware";
import { db } from "../db";
import type {
  Applications, Candidates, JobPostings, PreInterviewForms, InterviewSlots,
  InterviewBookings, ComplianceDocuments, ComplianceRequirements, OfferLetters,
  TrainingCourses, TrainingSessions, TrainingEnrolments,
} from "@db/schema";
import { waitUntil } from "@vercel/functions";
import { audit, notifyRoles } from "../util";
import { documentUploadTarget, inspectDocument, removeDocument, saveDocument, sniffDocument } from "../lib/cv-store";
import { appUrl } from "../lib/app-url";
import { complianceApplication, emailCandidate, emailSlotsOpenIfAny, slotOpenForJob as slotOpen } from "../lib/recruitment";
import { sessionWhen, sessionWhere } from "../lib/training";

async function appByToken(portalToken: string) {
  const app = await db.from("applications").eq("portalToken", portalToken).first<Applications>();
  if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Portal link not valid. Please use the link from your email." });
  const candidate = await db.from("candidates").eq("id", app.candidateId).first<Candidates>();
  const job = await db.from("jobPostings").eq("id", app.jobPostingId).first<JobPostings>();
  return { app, candidate: candidate!, job: job! };
}

/** Upcoming sessions as a candidate sees them; the joining link only once they have a place. */
async function portalSessions(sessions: TrainingSessions[], courses: TrainingCourses[], mine: TrainingEnrolments[]) {
  const ids = sessions.map((s) => s.id);
  const booked = ids.length ? await db.from("trainingEnrolments").in("sessionId", ids).many<TrainingEnrolments>() : [];
  return sessions
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .map((s) => {
      const hasPlace = mine.some((e) => Number(e.sessionId) === Number(s.id));
      return {
        id: s.id, courseId: s.courseId, startsAt: s.startsAt, endsAt: s.endsAt, location: s.location,
        capacity: s.capacity, courseTitle: courses.find((c) => c.id === s.courseId)?.title ?? "Induction",
        delivery: s.delivery ?? "in_person", trainerName: s.trainerName, notes: s.notes ?? null,
        meetingUrl: hasPlace ? s.meetingUrl ?? null : null,
        placesLeft: Math.max(0, (s.capacity ?? 12) - booked.filter((e) => e.sessionId === s.id).length),
      };
    });
}

const MAX_DOC_BYTES = 10 * 1024 * 1024;
const TOO_LARGE = "Files must be 10 MB or smaller.";
const WRONG_TYPE = "Upload a PDF, photo (JPG, PNG, HEIC) or Word document.";

/** The requested document a portal upload is for, if the application can still take uploads. */
async function docForUpload(token: string, requirementKey: string) {
  const { app, candidate } = await appByToken(token);
  if (["rejected", "withdrawn", "screened_out"].includes(app.stage)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This application is closed." });
  }
  const doc = await db.from("complianceDocuments")
    .eq("ownerType", "candidate")
    .eq("ownerId", candidate.id)
    .eq("requirementKey", requirementKey)
    .first<ComplianceDocuments>();
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "We have not asked for this document." });
  if (doc.status === "verified") throw new TRPCError({ code: "BAD_REQUEST", message: "This document is already verified." });
  return { app, candidate, doc };
}

async function recordUpload({ app, candidate, doc, fileName, key, baseUrl }: {
  app: Applications; candidate: Candidates; doc: ComplianceDocuments; fileName: string; key: string; baseUrl: string;
}) {
  await db.from("complianceDocuments").eq("id", doc.id).update({
    status: "uploaded", fileName, fileKey: key, rejectionReason: null,
  });
  await audit("Candidate (portal)", "document_uploaded", "applications", app.id, { requirement: doc.requirementKey });

  // One alert for the office when the whole set is in, and one per replacement of a rejected file;
  // not one email per file while the candidate works through the list.
  const docs = await db.from("complianceDocuments").eq("ownerType", "candidate").eq("ownerId", candidate.id).many<ComplianceDocuments>();
  const outstanding = docs.filter((d) => d.status === "requested" || d.status === "rejected").length;
  const toCheck = docs.filter((d) => d.status === "uploaded").length;
  const name = `${candidate.firstName} ${candidate.lastName}`;
  const firstFile = doc.status === "requested" || doc.status === "rejected";
  if (firstFile && outstanding === 0) {
    const forApp = (await complianceApplication(Number(candidate.id))) ?? app;
    await notifyRoles(["admin", "super_admin"], {
      type: "hr", title: `Documents ready to check — ${name}`,
      body: `${name} has sent every document. ${toCheck} ${toCheck === 1 ? "is" : "are"} waiting for you to check.`,
      link: "/recruitment/compliance",
    });
    waitUntil(emailCandidate(Number(forApp.id), "documents_received", baseUrl).catch(() => {}));
  } else if (doc.status === "rejected") {
    const req = await db.from("complianceRequirements").eq("key", doc.requirementKey).first<ComplianceRequirements>();
    await notifyRoles(["admin", "super_admin"], {
      type: "hr", title: `Replacement document to check — ${name}`,
      body: `${req?.label ?? doc.requirementKey.replace(/_/g, " ")} was sent again after it was rejected.`,
      link: "/recruitment/compliance",
    });
  }
  return { ok: true, outstanding, allSent: outstanding === 0 };
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
        ? (await db.from("interviewSlots").order("startsAt", "asc").many<InterviewSlots>())
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
        sessions: offerAccepted ? await portalSessions(sessions, courses, enrolments) : [],
        stageIndex: APPLICATION_STAGE_ORDER.indexOf(app.stage),
      };
    }),

  saveForm: publicQuery
    .input(z.object({
      token: z.string(),
      data: z.record(z.string(), z.unknown()),
      submit: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
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
        waitUntil(emailSlotsOpenIfAny({ ...app, stage: "pre_interview_forms_complete" }, appUrl(ctx.req)).catch(() => {}));
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

  /** Step 1 of an upload: a one-time storage link the browser sends the file to directly. */
  docUploadUrl: publicQuery
    .input(z.object({
      token: z.string(), requirementKey: z.string().min(1).max(60),
      fileName: z.string().min(1).max(255), size: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      const { candidate } = await docForUpload(input.token, input.requirementKey);
      if (input.size > MAX_DOC_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: TOO_LARGE });
      try {
        return await documentUploadTarget(`candidate-${candidate.id}`, input.fileName);
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : "Upload failed." });
      }
    }),

  /** Step 2: check what arrived in storage and record it against the requirement. */
  confirmDoc: publicQuery
    .input(z.object({
      token: z.string(), requirementKey: z.string().min(1).max(60),
      fileName: z.string().min(1).max(255), key: z.string().min(1).max(400),
    }))
    .mutation(async ({ input, ctx }) => {
      const { app, candidate, doc } = await docForUpload(input.token, input.requirementKey);
      if (!input.key.startsWith(`candidate-${candidate.id}/`) || input.key.includes("..")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That upload does not belong to this application." });
      }
      const stored = await inspectDocument(input.key);
      if (!stored) throw new TRPCError({ code: "BAD_REQUEST", message: "Your file did not reach us. Please try again." });
      if (stored.size > MAX_DOC_BYTES) {
        await removeDocument(input.key);
        throw new TRPCError({ code: "BAD_REQUEST", message: TOO_LARGE });
      }
      if (!sniffDocument(stored.head, input.fileName)) {
        await removeDocument(input.key);
        throw new TRPCError({ code: "BAD_REQUEST", message: WRONG_TYPE });
      }
      return recordUpload({ app, candidate, doc, fileName: input.fileName, key: input.key, baseUrl: appUrl(ctx.req) });
    }),

  /** Single-request upload for small files; the portal now uses docUploadUrl + confirmDoc. */
  uploadDoc: publicQuery
    .input(z.object({
      token: z.string(), requirementKey: z.string().min(1).max(60),
      fileName: z.string().min(1).max(255),
      contentBase64: z.string().min(1).max(14_000_000),
    }))
    .mutation(async ({ input, ctx }) => {
      const { app, candidate, doc } = await docForUpload(input.token, input.requirementKey);
      const bytes = Uint8Array.from(Buffer.from(input.contentBase64, "base64"));
      if (bytes.length > MAX_DOC_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: TOO_LARGE });
      const mime = sniffDocument(bytes, input.fileName);
      if (!mime) throw new TRPCError({ code: "BAD_REQUEST", message: WRONG_TYPE });
      let key: string;
      try {
        ({ key } = await saveDocument(`candidate-${candidate.id}`, bytes, input.fileName, mime));
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : "Upload failed." });
      }
      return recordUpload({ app, candidate, doc, fileName: input.fileName, key, baseUrl: appUrl(ctx.req) });
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
      const upcoming = (await db.from("trainingSessions").gt("startsAt", new Date()).many<TrainingSessions>())
        .filter((s) => courses.some((c) => c.id === s.courseId));
      await notifyRoles(["admin", "super_admin"], {
        type: "hr", title: `Offer accepted — ${candidate.firstName} ${candidate.lastName}`,
        body: upcoming.length
          ? "Online training has been assigned. They have been asked to book a classroom induction."
          : "Online training has been assigned. There are no induction dates yet. Add one in Training so they can book.",
        link: upcoming.length ? `/recruitment/pipeline/${app.id}` : "/recruitment/training",
      });
      const online = courses.filter((c) => c.type === "online").length;
      waitUntil(emailCandidate(Number(app.id), "training_invite", appUrl(ctx.req), {
        note: [
          online ? `You have ${online} online course${online === 1 ? "" : "s"} to complete.` : "",
          upcoming.length ? "Induction dates are open now." : "We will email you as soon as an induction date is available.",
        ].filter(Boolean).join(" "),
      }).catch(() => {}));
      return { ok: true };
    }),

  registerTraining: publicQuery
    .input(z.object({ token: z.string(), sessionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const { app, candidate } = await appByToken(input.token);
      if (!["offer_accepted", "training_booked", "online_training_in_progress"].includes(app.stage))
        throw new TRPCError({ code: "BAD_REQUEST", message: "Training registration opens after you accept your offer." });
      const session = await db.from("trainingSessions").eq("id", input.sessionId).first<TrainingSessions>();
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const has = await db.from("trainingEnrolments")
        .eq("sessionId", session.id).eq("personType", "candidate")
        .eq("personId", candidate.id).first<TrainingEnrolments>();
      if (!has) {
        const mine = await db.from("trainingEnrolments").eq("personType", "candidate").eq("personId", candidate.id)
          .eq("status", "registered").many<TrainingEnrolments>();
        const mineIds = mine.filter((e) => e.sessionId != null).map((e) => e.sessionId!);
        const upcoming = mineIds.length
          ? (await db.from("trainingSessions").in("id", mineIds).many<TrainingSessions>()).filter((s) => new Date(s.endsAt).getTime() > Date.now())
          : [];
        if (upcoming.length) throw new TRPCError({ code: "CONFLICT", message: "You already have a place on an induction. Contact the office to change the date." });
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
        const course = await db.from("trainingCourses").eq("id", session.courseId).first<TrainingCourses>();
        const name = `${candidate.firstName} ${candidate.lastName}`;
        await notifyRoles(["admin", "super_admin"], {
          type: "hr", title: `Induction booked — ${name}`,
          body: `${course?.title ?? "Training"}, ${sessionWhen(session)}.`,
          link: "/recruitment/training",
        });
        waitUntil(emailCandidate(Number(app.id), "training_booked", appUrl(ctx.req), {
          when: sessionWhen(session), where: sessionWhere(session), note: course?.title,
        }).catch(() => {}));
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
