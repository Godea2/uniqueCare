import { TRPCError } from "@trpc/server";
import type { Applications, Candidates, TrainingCourses, TrainingEnrolments, TrainingSessions } from "@db/schema";
import { db } from "../db";
import { audit, notifyRoles } from "../util";
import { orgProfile } from "./app-url";
import { saveDocument, documentDownloadUrl } from "./cv-store";
import { renderTextPdf } from "./pdf-text";
import { emailCandidate } from "./recruitment";
import { sessionWhen } from "./training";
import { registerOutgoingDocument } from "./outgoing-docs";

export type TrainingOutcome = "pass" | "fail";

export function buildTrainingCertificate(o: {
  name: string; courseTitle: string; orgName: string; when?: string; signatory: string; certificateNo: string;
}): string {
  const today = new Date().toLocaleDateString("en-GB");
  return `${o.orgName.toUpperCase()}
CERTIFICATE OF TRAINING

This is to certify that

${o.name}

has successfully completed

${o.courseTitle}

${o.when ? `Session: ${o.when}\n` : ""}Date awarded: ${today}
Certificate number: ${o.certificateNo}

Awarded by ${o.signatory}
${o.orgName}

This certificate is issued for employment and compliance records (CQC Regulation 19).`;
}

export function buildTrainingFailLetter(o: {
  name: string; courseTitle: string; orgName: string; when?: string; signatory: string; notes?: string;
}): string {
  const today = new Date().toLocaleDateString("en-GB");
  return `${o.orgName.toUpperCase()} — TRAINING OUTCOME

Date: ${today}

Dear ${o.name},

Following your ${o.courseTitle} training${o.when ? ` (${o.when})` : ""}, we are writing to confirm that you did not meet the required standard on this occasion.

${o.notes ? `Notes from the assessor:\n${o.notes}\n\n` : ""}You may contact our recruitment team to discuss next steps, which may include booking another training date where appropriate.

Yours sincerely,
${o.signatory}
${o.orgName}`;
}

function safeFilePart(s: string) {
  return s.replace(/[^\w.\- ]/g, "").trim().replace(/\s+/g, "-") || "Candidate";
}

export function trainingOutcomeFileName(outcome: TrainingOutcome, candidateName: string, courseTitle: string) {
  const who = safeFilePart(candidateName);
  const course = safeFilePart(courseTitle).slice(0, 40);
  return outcome === "pass"
    ? `Training-Certificate-${course}-${who}.pdf`
    : `Training-Outcome-${course}-${who}.pdf`;
}

/**
 * Record pass/fail, store the PDF, email the candidate with the attachment, and keep the file downloadable.
 */
export async function recordTrainingOutcome(opts: {
  enrolment: TrainingEnrolments;
  outcome: TrainingOutcome;
  actor: string;
  baseUrl: string;
  notes?: string;
}): Promise<{
  outcome: TrainingOutcome;
  fileKey: string;
  fileName: string;
  emailed: boolean;
}> {
  const { enrolment, outcome, actor, baseUrl } = opts;
  if (enrolment.personType !== "candidate") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Training outcomes are recorded for candidates." });
  }
  if (outcome === "pass" && enrolment.status !== "completed") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Mark the candidate as present (attended) before recording a pass.",
    });
  }

  const course = await db.from("trainingCourses").eq("id", enrolment.courseId).first<TrainingCourses>();
  if (!course) throw new TRPCError({ code: "NOT_FOUND", message: "Course not found." });
  const cand = await db.from("candidates").eq("id", enrolment.personId).first<Candidates>();
  if (!cand) throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found." });
  const app = await db.from("applications").eq("candidateId", cand.id).order("id", "desc").first<Applications>();
  const session = enrolment.sessionId
    ? await db.from("trainingSessions").eq("id", enrolment.sessionId).first<TrainingSessions>()
    : null;
  const org = await orgProfile();
  const name = `${cand.firstName} ${cand.lastName}`;
  const when = session ? sessionWhen(session) : undefined;
  const certificateNo = `UC-TR-${enrolment.id}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

  const text = outcome === "pass"
    ? buildTrainingCertificate({
        name, courseTitle: course.title, orgName: org.name, when,
        signatory: org.signatory || org.name, certificateNo,
      })
    : buildTrainingFailLetter({
        name, courseTitle: course.title, orgName: org.name, when,
        signatory: org.signatory || org.name, notes: opts.notes,
      });

  const fileName = trainingOutcomeFileName(outcome, name, course.title);
  const bytes = renderTextPdf(text, {
    title: outcome === "pass" ? `Certificate — ${course.title}` : `Training outcome — ${course.title}`,
    author: org.name,
  });
  const { key } = await saveDocument(`candidate-${cand.id}/training`, bytes, fileName, "application/pdf");

  const status = outcome === "pass" ? "completed" : enrolment.status === "registered" ? "completed" : enrolment.status;
  const patch: Record<string, unknown> = {
    status: outcome === "pass" ? "completed" : status,
    completedAt: enrolment.completedAt ?? new Date(),
    outcome,
    outcomeAt: new Date(),
    outcomeNotes: opts.notes?.trim() || null,
    outcomeFileKey: key,
    outcomeFileName: fileName,
  };
  if (outcome === "pass" && course.renewEveryMonths && !enrolment.expiresAt) {
    const d = new Date();
    d.setMonth(d.getMonth() + course.renewEveryMonths);
    patch.expiresAt = d.toISOString().slice(0, 10);
  }

  try {
    await db.from("trainingEnrolments").eq("id", enrolment.id).update(patch);
  } catch {
    // Columns arrive with migration 0012 — still keep status/completedAt.
    await db.from("trainingEnrolments").eq("id", enrolment.id).update({
      status: patch.status as string,
      completedAt: patch.completedAt as Date,
      expiresAt: (patch.expiresAt as string | undefined) ?? enrolment.expiresAt,
    });
  }

  await registerOutgoingDocument({
    kind: outcome === "pass" ? "training_certificate" : "training_outcome",
    title: outcome === "pass"
      ? `Certificate — ${course.title} — ${name}`
      : `Training outcome — ${course.title} — ${name}`,
    fileName,
    fileKey: key,
    candidateId: Number(cand.id),
    applicationId: app ? Number(app.id) : null,
    relatedType: "training_enrolments",
    relatedId: Number(enrolment.id),
    issuedBy: actor,
  });

  await audit(actor, `training_outcome_${outcome}`, "training_enrolments", enrolment.id, {
    course: course.title, fileName, applicationId: app?.id,
  });

  let emailed = false;
  if (app) {
    await emailCandidate(Number(app.id), outcome === "pass" ? "training_passed" : "training_failed", baseUrl, {
      note: course.title,
      when,
      attachment: { filename: fileName, content: bytes, contentType: "application/pdf" },
    });
    emailed = true;
    await notifyRoles(["admin", "super_admin"], {
      type: "hr",
      title: outcome === "pass"
        ? `${name} passed ${course.title}`
        : `${name} did not pass ${course.title}`,
      body: outcome === "pass"
        ? "Certificate emailed and stored on their candidate profile."
        : "Outcome letter emailed and stored on their candidate profile.",
      link: `/recruitment/pipeline/${app.id}`,
    });
  }

  return { outcome, fileKey: key, fileName, emailed };
}

export async function trainingOutcomeDownloadUrl(fileKey: string) {
  return documentDownloadUrl(fileKey);
}
