import { db } from "../db";
import type {
  ApplicationStage,
  Applications,
  Candidates,
  DbsVerifications,
  TrainingCourses,
  TrainingEnrolments,
} from "@db/schema";
import { pushStage } from "./recruitment";
import { notifyRoles } from "../util";

const TRAINING_STAGES: ApplicationStage[] = [
  "offer_accepted",
  "training_booked",
  "online_training_in_progress",
  "dbs_verified",
  "training_complete",
];

/**
 * After classroom attendance or a pass outcome, advance the application when
 * the candidate's required training for this hiring path is done.
 *
 * - Moves into online_training_in_progress when still at training_booked / offer_accepted
 * - Moves to training_complete when classroom (or passed) work is done
 * - Does not hire — hire remains a separate recruiter action (and still needs DBS)
 */
export async function maybeAdvanceAfterTrainingProgress(opts: {
  candidateId: number;
  actor: string;
}): Promise<{ advancedTo?: ApplicationStage; reason?: string }> {
  const app = await db.from("applications")
    .eq("candidateId", opts.candidateId)
    .order("id", "desc")
    .first<Applications>();
  if (!app) return { reason: "No application" };
  if (!TRAINING_STAGES.includes(app.stage as ApplicationStage) && app.stage !== "offer_accepted") {
    return { reason: `Stage ${app.stage} is outside the training path` };
  }

  const enrolments = await db.from("trainingEnrolments")
    .eq("personType", "candidate")
    .eq("personId", opts.candidateId)
    .many<TrainingEnrolments>();
  if (enrolments.length === 0) return { reason: "No enrolments" };

  const courses = await db.from("trainingCourses").many<TrainingCourses>();
  const classroom = enrolments.filter((e) => {
    const course = courses.find((c) => Number(c.id) === Number(e.courseId));
    return course?.type !== "online" || !!e.sessionId;
  });
  const relevant = classroom.length > 0 ? classroom : enrolments;

  const allDone = relevant.every((e) =>
    e.status === "completed" || e.outcome === "pass");
  if (!allDone) return { reason: "Not all training enrolments are complete" };

  const cand = await db.from("candidates").eq("id", opts.candidateId).first<Candidates>();
  const name = cand ? `${cand.firstName} ${cand.lastName}` : `Candidate #${opts.candidateId}`;

  // Walk forward through training stages as far as the state machine allows.
  if (app.stage === "offer_accepted") {
    await pushStage(app.id, "training_booked", opts.actor);
  }
  const afterBook = await db.from("applications").eq("id", app.id).first<Applications>();
  if (afterBook?.stage === "training_booked") {
    await pushStage(app.id, "online_training_in_progress", opts.actor);
  }

  const current = await db.from("applications").eq("id", app.id).first<Applications>();
  if (!current) return { reason: "Application missing after stage update" };

  // Prefer training_complete once courses are done. DBS remains required to hire.
  if (["online_training_in_progress", "dbs_verified", "training_booked"].includes(current.stage)) {
    // From online_training_in_progress the machine allows dbs_verified OR (after our ALLOWED update) training_complete.
    if (current.stage === "training_booked") {
      // Should already have moved above; no-op safety.
    }
    try {
      if (current.stage !== "training_complete") {
        await pushStage(app.id, "training_complete", opts.actor);
      }
    } catch {
      // If direct jump is blocked, try via dbs_verified when a check-in already exists.
      const dbs = await db.from("dbsVerifications").eq("applicationId", app.id).first<DbsVerifications>();
      if (dbs && current.stage === "online_training_in_progress") {
        await pushStage(app.id, "dbs_verified", opts.actor);
        await pushStage(app.id, "training_complete", opts.actor);
      } else {
        await notifyRoles(["admin", "super_admin"], {
          type: "hr",
          title: `${name} finished training`,
          body: dbs
            ? "Training is complete. Mark training complete / hire on their candidate page."
            : "Training is complete. Record the DBS check at induction, then mark training complete.",
          link: `/recruitment/pipeline/${app.id}`,
        });
        return { reason: "Could not move to training_complete yet — DBS or stage gate" };
      }
    }
  }

  await notifyRoles(["admin", "super_admin"], {
    type: "hr",
    title: `${name} — training completed`,
    body: "Pipeline moved to Training complete. You can now hire once DBS is recorded.",
    link: `/recruitment/pipeline/${app.id}`,
  });

  return { advancedTo: "training_complete" };
}
