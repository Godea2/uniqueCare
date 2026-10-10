import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "../db";
import type {
  ApplicationStage, ApplicationFormVersions, Applications, Candidates, JobPostings, PreInterviewForms,
} from "@db/schema";
import { audit, notifyRoles, ruleEnabled } from "../util";
import { callAI } from "../ai/provider";
import { sendEmail } from "./mailer";
import { readCv } from "./cv-store";
import { orgProfile, portalUrl } from "./app-url";
import { jobRequirements } from "./job-form";
import {
  answerText, conditionMet, formSchemaDoc, trippedKnockouts, DISPLAY_TYPES,
  type FormAnswers, type JobRequirement,
} from "@contracts/form-schema";

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

export async function pushStage(
  applicationId: number,
  to: ApplicationStage,
  actor: string,
  reason?: string,
  override = false,
) {
  const app = await db.from("applications").eq("id", applicationId).first<Applications>();
  if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
  const from = app.stage as ApplicationStage;
  if (from === to) return app;
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

// ── Candidate emails ──

async function loadParties(appId: number) {
  const app = await db.from("applications").eq("id", appId).first<Applications>();
  if (!app) return null;
  const cand = await db.from("candidates").eq("id", app.candidateId).first<Candidates>();
  const job = await db.from("jobPostings").eq("id", app.jobPostingId).first<JobPostings>();
  if (!cand?.email || !job) return null;
  return { app, cand, job };
}

export type CandidateEmailKind =
  | "interview_invitation" | "interview_booked" | "compliance_requested" | "document_rejected"
  | "offer_sent" | "unsuccessful" | "hired";

/** Email the candidate about a step in their application, always with their portal link. */
export async function emailCandidate(
  appId: number, kind: CandidateEmailKind, baseUrl: string,
  extra?: { when?: string; where?: string; note?: string },
) {
  const p = await loadParties(appId);
  if (!p) return;
  const org = await orgProfile();
  const link = portalUrl(baseUrl, p.app.portalToken);
  const sign = `Kind regards,\n${org.signatory}${org.signatoryTitle ? `\n${org.signatoryTitle}` : ""}\n${org.name}`;
  const hi = `Dear ${p.cand.firstName},`;
  const content: Record<CandidateEmailKind, { subject: string; body: string }> = {
    interview_invitation: {
      subject: `Next steps for ${p.job.title} at ${org.name}`,
      body: `${hi}\n\nThank you for applying for ${p.job.title}. We would like to invite you to the next stage.\n\nPlease open your candidate portal to complete your pre-interview form and book an interview slot:\n${link}\n\n${sign}`,
    },
    interview_booked: {
      subject: `Your interview for ${p.job.title}`,
      body: `${hi}\n\nYour interview is booked${extra?.when ? ` for ${extra.when}` : ""}.${extra?.where ? `\n\nWhere: ${extra.where}` : ""}\n\nYou can see the details or change your booking in your candidate portal:\n${link}\n\n${sign}`,
    },
    compliance_requested: {
      subject: `Documents needed for ${p.job.title}`,
      body: `${hi}\n\nCongratulations — you have passed the interview stage for ${p.job.title}.\n\nBefore we can make an offer we need some documents and your referee details. Please upload them in your candidate portal:\n${link}\n\n${sign}`,
    },
    document_rejected: {
      subject: `Please upload a document again — ${p.job.title}`,
      body: `${hi}\n\nWe could not accept one of your documents${extra?.note ? `: ${extra.note}` : "."}\n\nPlease upload it again in your candidate portal:\n${link}\n\n${sign}`,
    },
    offer_sent: {
      subject: `Your offer for ${p.job.title}`,
      body: `${hi}\n\nWe are delighted to offer you the position of ${p.job.title}.\n\nPlease read and accept your offer letter in your candidate portal:\n${link}\n\n${sign}`,
    },
    unsuccessful: {
      subject: `Your application for ${p.job.title}`,
      body: `${hi}\n\nThank you for your interest in ${p.job.title} and for the time you spent on your application.\n\nAfter careful consideration we will not be taking your application further on this occasion. We will keep your details on file if you agreed to that, and we encourage you to apply for future roles.\n\n${sign}`,
    },
    hired: {
      subject: `Welcome to ${org.name}`,
      body: `${hi}\n\nYou have completed your onboarding for ${p.job.title}. Welcome to the team — your manager will be in touch with your first shifts.\n\n${sign}`,
    },
  };
  const msg = content[kind];
  await sendEmail({ to: p.cand.email, subject: msg.subject, body: msg.body, kind, relatedType: "application", relatedId: appId });
}

/** Shortlisted → pre-interview form opened in the portal and the candidate invited. */
export async function inviteToInterviewStage(appId: number, actor: string, baseUrl: string) {
  const hasForm = await db.from("preInterviewForms").eq("applicationId", appId).first<PreInterviewForms>();
  if (!hasForm) await db.from("preInterviewForms").insert({ applicationId: appId, data: {} });
  const app = await db.from("applications").eq("id", appId).first<Applications>();
  if (app?.stage === "shortlisted") await pushStage(appId, "pre_interview_forms_sent", actor);
  await emailCandidate(appId, "interview_invitation", baseUrl);
}

// ── Screening ──

export const aiScreenSchema = z.object({
  requirement_results: z.array(z.object({
    requirement_key: z.string(),
    met: z.enum(["yes", "partial", "no", "unknown"]),
    evidence: z.string(),
    source: z.enum(["cv", "form", "none"]).catch("none"),
  })),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  summary: z.string(),
  flags: z.array(z.string()),
});
type AiResult = z.infer<typeof aiScreenSchema>["requirement_results"][number];

export type BreakdownRow = {
  requirement_key: string; label: string; weight: number; required: boolean;
  met: AiResult["met"]; evidence: string; source: AiResult["source"];
};

const CREDIT: Record<AiResult["met"], number> = { yes: 1, partial: 0.5, unknown: 0, no: 0 };

/**
 * Score from requirement results and weights, computed in code (never trust the model's total).
 * A requirement the model skipped counts as "unknown". A must-have answered "no" caps the score at 50.
 */
export function computeScore(requirements: JobRequirement[], results: { requirement_key: string; met: AiResult["met"] }[]) {
  const totalWeight = requirements.reduce((a, r) => a + r.weight, 0);
  let earned = 0;
  let mustHaveFailed = false;
  const mustHaveGaps: string[] = [];
  for (const req of requirements) {
    const met = results.find((x) => x.requirement_key === req.key)?.met ?? "unknown";
    earned += req.weight * CREDIT[met];
    if (req.required && met !== "yes") mustHaveGaps.push(req.label);
    if (req.required && met === "no") mustHaveFailed = true;
  }
  let score = totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 0;
  if (mustHaveFailed) score = Math.min(50, score);
  return { score: Math.min(100, score), mustHaveGaps };
}

/** Answers grouped for the model: one block per requirement, then everything else marked for AI use. */
async function evidenceFromForm(app: Applications, reqs: JobRequirement[]) {
  const answers = (app.answers ?? {}) as FormAnswers;
  const byRequirement = new Map<string, string[]>();
  const other: string[] = [];
  let knockouts: { fieldId: string; label: string; message: string }[] = [];
  const ver = app.formVersionId
    ? await db.from("applicationFormVersions").eq("id", app.formVersionId).first<ApplicationFormVersions>()
    : null;
  const parsed = ver ? formSchemaDoc.safeParse(ver.schemaJson) : null;
  if (parsed?.success) {
    knockouts = trippedKnockouts(parsed.data, answers);
    const reqKeys = new Set(reqs.map((r) => r.key));
    for (const section of parsed.data.sections) {
      for (const f of section.fields) {
        if (DISPLAY_TYPES.includes(f.type) || f.type === "file_upload" || f.type === "consent") continue;
        if (!conditionMet(f, answers)) continue;
        const text = answerText(f, answers[f.id]);
        if (!text) continue;
        const line = `- ${f.label}: ${text.slice(0, 1500)}`;
        if (f.requirementKey && reqKeys.has(f.requirementKey)) {
          byRequirement.set(f.requirementKey, [...(byRequirement.get(f.requirementKey) ?? []), line]);
        } else if (f.useInAi) {
          other.push(line);
        }
      }
    }
  } else {
    for (const [k, v] of Object.entries(answers)) {
      if (typeof v === "string" && v) other.push(`- ${k}: ${v.slice(0, 1500)}`);
    }
  }
  return { byRequirement, other, knockouts };
}

/**
 * Screen one application against its job's requirements, store the result and move the stage.
 * Shortlisting needs every must-have met, no knockout, and a score at or above the job threshold.
 */
export async function screenApplication(appId: number, actor: string, baseUrl: string) {
  const app = await db.from("applications").eq("id", appId).first<Applications>();
  if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
  const job = await db.from("jobPostings").eq("id", app.jobPostingId).first<JobPostings>();
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  const reqs = jobRequirements(job);
  if (reqs.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This job has no screening requirements. Add them on the job first." });
  }

  const { byRequirement, other, knockouts } = await evidenceFromForm(app, reqs);
  const cvFile = app.cvFileKey && (app.cvFileName ?? "").toLowerCase().endsWith(".pdf") ? await readCv(app.cvFileKey) : null;
  const cvText = (app.cvText ?? "").slice(0, 6000);
  const org = await orgProfile();

  const requirementBlock = reqs.map((r) => {
    const answers = byRequirement.get(r.key);
    return `### ${r.key}${r.required ? " (MUST-HAVE)" : ""} — weight ${r.weight}\n${r.label}\nCandidate's answers about this:\n${answers?.join("\n") ?? "- (no direct question answered)"}`;
  }).join("\n\n");

  const result = await callAI({
    feature: "scoreApplication", promptVersion: "4.0", schema: aiScreenSchema, temperature: 0.1,
    files: cvFile ? [{ data: cvFile, mediaType: "application/pdf", filename: app.cvFileName ?? "cv.pdf" }] : undefined,
    validate: (r) => r.requirement_results.length > 0,
    system: [
      `You screen job applications for ${org.name}, a UK care provider. The vacancy is described below — judge the candidate for THAT role only, not for care work in general.`,
      `For each requirement decide met = yes | partial | no | unknown from the candidate's answers and their CV.`,
      `"yes": clear evidence. "partial": some but incomplete evidence. "no": the candidate says or shows they do not meet it. "unknown": no evidence either way.`,
      `Evidence must be a short exact quote from the CV or an answer, or an empty string when there is none. Set source to cv, form or none.`,
      `Check the CV is relevant to this application; if it looks like an unrelated document (not a CV), say so in flags.`,
      `Never infer or use protected characteristics (age, sex, race, religion, disability, pregnancy, marital status, sexual orientation, gender reassignment). Do not use name, email, phone or address as evidence.`,
      `Reply with strict JSON only.`,
    ].join("\n"),
    user: [
      `Job title: ${job.title}`,
      `Location: ${job.location ?? "not stated"}`,
      `Job description:\n${(job.descriptionMd ?? "").slice(0, 4000)}`,
      `## Requirements\n${requirementBlock}`,
      other.length ? `## Other answers\n${other.join("\n")}` : "",
      cvFile ? "## CV\nThe CV PDF is attached. Read it. The extracted text below is only a backup." : "## CV",
      cvText || (cvFile ? "" : "(No readable CV text. Mark CV evidence as unknown.)"),
      `Return one requirement_results item for each requirement key: ${reqs.map((r) => r.key).join(", ")}. Also strengths[], gaps[], a 3-4 sentence summary for the hiring manager, and flags[] for anything a human must check.`,
    ].filter(Boolean).join("\n\n"),
  });

  const { score, mustHaveGaps } = computeScore(reqs, result.requirement_results);
  const breakdown: BreakdownRow[] = reqs.map((r) => {
    const hit = result.requirement_results.find((x) => x.requirement_key === r.key);
    return {
      requirement_key: r.key, label: r.label, weight: r.weight, required: r.required,
      met: hit?.met ?? "unknown", evidence: hit?.evidence ?? "", source: hit?.source ?? "none",
    };
  });
  const flags = [
    ...result.flags,
    ...knockouts.map((h) => `Knockout: ${h.message}`),
    ...mustHaveGaps.map((g) => `Must-have not clearly met: ${g}`),
    ...(app.cvUnreadable && !cvFile ? ["CV could not be read — check it manually"] : []),
  ];
  await db.from("applications").eq("id", app.id).update({
    aiScore: score, aiBreakdown: breakdown as never, aiSummary: result.summary, aiFlags: flags as never,
  });
  await audit(actor, "ai_screening", "applications", app.id, { score, mustHaveGaps: mustHaveGaps.length });

  const threshold = job.screeningThreshold ?? 85;
  const needsHuman = knockouts.length > 0 || mustHaveGaps.length > 0;
  let outcome: "shortlisted" | "review" | "unchanged" = "unchanged";
  const autoShortlist = await ruleEnabled("ai_shortlist");
  if (app.stage === "applied" || app.stage === "review") {
    if (!needsHuman && score >= threshold && autoShortlist) {
      await pushStage(app.id, "shortlisted", "System (screening)");
      await inviteToInterviewStage(app.id, "System (automation)", baseUrl);
      outcome = "shortlisted";
    } else if (app.stage === "applied" && (needsHuman || score >= 60 || score >= threshold)) {
      await pushStage(app.id, "review", "System (screening)");
      outcome = "review";
    }
  }
  return {
    score, breakdown, strengths: result.strengths, gaps: result.gaps,
    summary: result.summary, flags, knockoutTripped: knockouts.length > 0, outcome,
  };
}

/** Background screening right after an application arrives. Failures leave it for a human. */
export async function screenInBackground(appId: number, baseUrl: string) {
  try {
    await screenApplication(appId, "System (auto-screen)", baseUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await audit("System", "ai_screening_failed", "applications", appId, { message: message.slice(0, 300) });
    await notifyRoles(["admin", "super_admin"], {
      type: "hr", title: "Screening needs a manual run",
      body: `Automatic screening for application #${appId} did not finish: ${message.slice(0, 160)}`,
      link: `/recruitment/pipeline/${appId}`,
    });
  }
}
