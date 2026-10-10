import crypto from "crypto";
import { db } from "../db";
import type {
  Applications, Candidates, DbsVerifications, StaffProfiles, TrainingCourses, TrainingEnrolments, TrainingSessions,
} from "@db/schema";
import { audit, notifyRoles } from "../util";
import { sendEmail } from "./mailer";
import { orgProfile } from "./app-url";
import { emailCandidate } from "./recruitment";

export const newRegisterToken = () => crypto.randomBytes(24).toString("hex");
export const registerUrl = (baseUrl: string, token: string) => `${baseUrl}/training/register/${token}`;

const LONDON = "Europe/London";

export function sessionWhen(s: Pick<TrainingSessions, "startsAt" | "endsAt">) {
  const day = new Date(s.startsAt).toLocaleDateString("en-GB", { timeZone: LONDON, weekday: "long", day: "numeric", month: "long" });
  const t = (d: string) => new Date(d).toLocaleTimeString("en-GB", { timeZone: LONDON, hour: "2-digit", minute: "2-digit" });
  return `${day}, ${t(s.startsAt)}–${t(s.endsAt)}`;
}

export function sessionWhere(s: Pick<TrainingSessions, "delivery" | "meetingUrl" | "location">) {
  if (s.delivery === "online") return s.meetingUrl ? `Online — ${s.meetingUrl}` : "Online (we will send the joining link)";
  return s.location || "Our office";
}

/** Candidates who have accepted an offer and not yet booked a classroom induction. */
export async function inductionAudience() {
  return db.from("applications").eq("stage", "offer_accepted").many<Applications>();
}

/** Tell candidates waiting for an induction that a new date is open. Returns how many were emailed. */
export async function emailInductionOpen(session: TrainingSessions, baseUrl: string) {
  const waiting = await inductionAudience();
  for (const app of waiting) {
    await emailCandidate(Number(app.id), "training_dates_open", baseUrl, { when: sessionWhen(session), where: sessionWhere(session) });
  }
  return waiting.length;
}

export async function emailTrainer(session: TrainingSessions, course: TrainingCourses, baseUrl: string) {
  if (!session.trainerEmail || !session.registerToken) return false;
  const org = await orgProfile();
  const name = session.trainerName?.split(" ")[0] || "there";
  const lines = [
    `Hello ${name},`,
    `Thank you for running ${course.title} for ${org.name}.`,
    `When: ${sessionWhen(session)}\nWhere: ${sessionWhere(session)}\nPlaces: ${session.capacity ?? 12}`,
    ...(session.notes ? [`Notes from the office: ${session.notes}`] : []),
    "Your attendance register lists everyone booked, and updates as people book. On the day, mark each person present or absent. Marking someone present signs the course off on their record.",
    "Please check each new starter's photo ID and original DBS certificate as they arrive, and tell the office if anything is missing.",
    registerUrl(baseUrl, session.registerToken),
    "Keep this link private. Anyone with it can mark attendance for this session.",
    org.signOff,
  ];
  await sendEmail({
    to: session.trainerEmail,
    subject: `You're running ${course.title} — ${sessionWhen(session)}`,
    body: lines.join("\n\n"),
    kind: "trainer_session",
    relatedType: "training_session",
    relatedId: session.id,
  });
  return true;
}

export type AttendanceMark = "present" | "absent" | "booked";

/**
 * Record attendance for one booking. Present signs the course off (with its renewal date);
 * absent records a no-show; booked undoes either.
 */
export async function markAttendance(enrolment: TrainingEnrolments, mark: AttendanceMark, actor: string) {
  const course = await db.from("trainingCourses").eq("id", enrolment.courseId).first<TrainingCourses>();
  let expiresAt: string | null = null;
  if (mark === "present" && course?.renewEveryMonths) {
    const d = new Date();
    d.setMonth(d.getMonth() + course.renewEveryMonths);
    expiresAt = d.toISOString().slice(0, 10);
  }
  const status = mark === "present" ? "completed" : mark === "absent" ? "no_show" : "registered";
  await db.from("trainingEnrolments").eq("id", enrolment.id).update({
    status, completedAt: mark === "present" ? new Date() : null, expiresAt,
  });
  await audit(actor, `training_${status}`, "training_enrolments", enrolment.id, { course: course?.title, sessionId: enrolment.sessionId });

  if (enrolment.personType === "candidate" && mark !== "booked") {
    const cand = await db.from("candidates").eq("id", enrolment.personId).first<Candidates>();
    const app = await db.from("applications").eq("candidateId", enrolment.personId).order("id", "desc").first<Applications>();
    if (cand && app) {
      const dbs = await db.from("dbsVerifications").eq("applicationId", app.id).first<DbsVerifications>();
      const name = `${cand.firstName} ${cand.lastName}`;
      await notifyRoles(["admin", "super_admin"], mark === "present" ? {
        type: "hr", title: `${name} attended ${course?.title ?? "training"}`,
        body: dbs ? "Their DBS is checked. You can complete their training on their candidate page." : "Record their DBS check, then complete their training on their candidate page.",
        link: `/recruitment/pipeline/${app.id}`,
      } : {
        type: "hr", title: `${name} did not attend ${course?.title ?? "training"}`,
        body: "Contact them to book another date.",
        link: `/recruitment/pipeline/${app.id}`,
      });
    }
  }
  return status;
}

/** Everyone booked on each session, with their name and whether the office has checked their DBS. */
export async function sessionAttendees(sessions: TrainingSessions[]) {
  const ids = sessions.map((s) => s.id);
  if (!ids.length) return new Map<number, Attendee[]>();
  const enrolments = await db.from("trainingEnrolments").in("sessionId", ids).many<TrainingEnrolments>();
  const candIds = enrolments.filter((e) => e.personType === "candidate").map((e) => e.personId);
  const staffIds = enrolments.filter((e) => e.personType === "staff").map((e) => e.personId);
  const cands = candIds.length ? await db.from("candidates").in("id", candIds).many<Candidates>() : [];
  const staff = staffIds.length ? await db.from("staffProfiles").in("id", staffIds).many<StaffProfiles>() : [];
  const apps = candIds.length ? await db.from("applications").in("candidateId", candIds).order("id", "desc").many<Applications>() : [];
  const appIds = apps.map((a) => a.id);
  const dbsChecks = appIds.length ? await db.from("dbsVerifications").in("applicationId", appIds).many<DbsVerifications>() : [];
  const out = new Map<number, Attendee[]>();
  for (const e of enrolments) {
    const app = e.personType === "candidate" ? apps.find((a) => a.candidateId === e.personId) : undefined;
    const cand = e.personType === "candidate" ? cands.find((c) => c.id === e.personId) : undefined;
    const list = out.get(Number(e.sessionId)) ?? [];
    list.push({
      ...e,
      name: cand ? `${cand.firstName} ${cand.lastName}` : staff.find((s) => s.id === e.personId)?.fullName ?? "Unknown",
      applicationId: app?.id ?? null,
      stage: app?.stage ?? null,
      dbsVerified: !!app && dbsChecks.some((d) => d.applicationId === app.id),
    });
    out.set(Number(e.sessionId), list);
  }
  return out;
}

export type Attendee = TrainingEnrolments & {
  name: string; applicationId: number | null; stage: string | null; dbsVerified: boolean;
};
