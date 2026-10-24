import { TRPCError } from "@trpc/server";
import { db } from "../db";
import type {
  ApplicationStage,
  Applications,
  Candidates,
  ComplianceDocuments,
  ComplianceRequirements,
  PreInterviewForms,
  References,
} from "@db/schema";
import { canTransition, emailCandidate, pushStage } from "./recruitment";
import {
  isHrOnlyComplianceKey,
  isRemovedComplianceKey,
  shouldRequestComplianceFromCandidate,
} from "./compliance-docs";
import { audit } from "../util";
import crypto from "crypto";

const token = () => crypto.randomBytes(16).toString("hex");

const CANCEL_STATUSES = ["requested", "rejected"] as const;

async function cancelOpenDocs(candidateId: number, keys: string[]) {
  for (const key of keys) {
    await db.from("complianceDocuments")
      .eq("ownerType", "candidate").eq("ownerId", candidateId).eq("requirementKey", key)
      .in("status", [...CANCEL_STATUSES])
      .update({ status: "cancelled" });
  }
}

/**
 * Create requested compliance docs + referee rows, move to
 * compliance_docs_requested, and email the candidate.
 * Idempotent for existing document rows.
 *
 * Only asks the candidate for documents they can actually provide:
 * - skips retired keys and HR-only items (contract, DBS)
 * - asks for driving licence only when they said they hold one
 */
export async function requestComplianceForApplication(opts: {
  applicationId: number;
  actorName: string;
  baseUrl: string;
}): Promise<void> {
  const app = await db.from("applications").eq("id", opts.applicationId).first<Applications>();
  if (!app) throw new TRPCError({ code: "NOT_FOUND" });

  const candidate = await db.from("candidates").eq("id", app.candidateId).first<Candidates>();
  const hasDrivingLicence = !!candidate?.hasDrivingLicence;

  const reqs = (await db.from("complianceRequirements").eq("required", true).many<ComplianceRequirements>())
    .filter((r) => shouldRequestComplianceFromCandidate(r.key, { hasDrivingLicence }));
  // Driving is optional in the catalog but still requested when they drive.
  if (hasDrivingLicence) {
    const driving = await db.from("complianceRequirements").eq("key", "driving_docs").first<ComplianceRequirements>();
    if (driving && !reqs.some((r) => r.key === "driving_docs")) {
      reqs.push(driving);
    }
  }

  if (reqs.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No compliance documents are set up yet. Load the compliance requirements in Supabase first.",
    });
  }

  // Already past this step — nothing to do.
  if (["compliance_docs_requested", "compliance_docs_complete", "offer_sent", "offer_accepted",
    "training_booked", "online_training_in_progress", "dbs_verified", "training_complete", "hired"]
    .includes(app.stage)) {
    return;
  }

  if (!canTransition(app.stage as ApplicationStage, "compliance_docs_requested")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Approve the candidate after interview before requesting documents.",
    });
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
    } else if (has.status === "cancelled") {
      await db.from("complianceDocuments").eq("id", has.id).update({ status: "requested" });
    }
  }

  // Drop mistaken open requests: retired, HR-only, or driving when they don't drive.
  const allKeys = (await db.from("complianceRequirements").many<ComplianceRequirements>()).map((r) => r.key);
  const cancelKeys = allKeys.filter((key) =>
    isRemovedComplianceKey(key)
    || isHrOnlyComplianceKey(key)
    || (key === "driving_docs" && !hasDrivingLicence));
  await cancelOpenDocs(app.candidateId, cancelKeys);

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

  await pushStage(app.id, "compliance_docs_requested", opts.actorName);
  await audit(opts.actorName, "compliance_requested", "applications", app.id);
  await emailCandidate(app.id, "compliance_requested", opts.baseUrl);
}
