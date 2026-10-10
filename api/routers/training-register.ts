import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware";
import { db } from "../db";
import type { TrainingCourses, TrainingEnrolments, TrainingSessions } from "@db/schema";
import { orgProfile } from "../lib/app-url";
import { markAttendance, sessionAttendees, sessionWhen, sessionWhere } from "../lib/training";

/** Attendance can be marked from 12 hours before the session starts. */
const OPENS_BEFORE_MS = 12 * 60 * 60 * 1000;

async function sessionByToken(token: string) {
  if (token.length < 32) throw new TRPCError({ code: "NOT_FOUND", message: "This register link is not valid." });
  const session = await db.from("trainingSessions").eq("registerToken", token).first<TrainingSessions>();
  if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "This register link is not valid. Please use the link from your email." });
  return session;
}

/** The trainer's attendance register, opened from the private link in their email. No login needed. */
export const trainingRegisterRouter = createRouter({
  get: publicQuery
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const session = await sessionByToken(input.token);
      const course = await db.from("trainingCourses").eq("id", session.courseId).first<TrainingCourses>();
      const attendees = (await sessionAttendees([session])).get(Number(session.id)) ?? [];
      const org = await orgProfile();
      return {
        orgName: org.name,
        course: { title: course?.title ?? "Training", type: course?.type ?? "classroom", renewEveryMonths: course?.renewEveryMonths ?? null },
        session: {
          startsAt: session.startsAt, endsAt: session.endsAt, when: sessionWhen(session), where: sessionWhere(session),
          delivery: session.delivery ?? "in_person", meetingUrl: session.meetingUrl ?? null,
          capacity: session.capacity ?? 12, trainerName: session.trainerName, notes: session.notes ?? null,
        },
        markingOpen: Date.now() >= new Date(session.startsAt).getTime() - OPENS_BEFORE_MS,
        attendees: attendees.map((a) => ({
          id: Number(a.id), name: a.name, status: a.status,
          isNewStarter: a.personType === "candidate", dbsChecked: a.dbsVerified,
        })),
      };
    }),

  mark: publicQuery
    .input(z.object({ token: z.string(), enrolmentId: z.number(), mark: z.enum(["present", "absent", "booked"]) }))
    .mutation(async ({ input }) => {
      const session = await sessionByToken(input.token);
      if (Date.now() < new Date(session.startsAt).getTime() - OPENS_BEFORE_MS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can mark attendance on the day of the session." });
      }
      const e = await db.from("trainingEnrolments").eq("id", input.enrolmentId).first<TrainingEnrolments>();
      if (!e || Number(e.sessionId) !== Number(session.id)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That person is not booked on this session." });
      }
      const actor = `${session.trainerName ?? "Trainer"} (register link)`;
      return { status: await markAttendance(e, input.mark, actor) };
    }),
});
