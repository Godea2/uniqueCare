import { db } from "../db";
import type { DocumentTemplates } from "@db/schema";
import {
  CARE_PLAN_ASSESSMENT_NAME,
  CARE_PLAN_ASSESSMENT_TEMPLATE,
  CARE_PLAN_ASSESSMENT_VERSION,
  CARE_PLAN_ASSESSMENT_FORMAT,
  isCarePlanAssessmentTemplate,
} from "@contracts/care-plan-assessment";

/**
 * Ensures the active care_plan template is the full assessment structure.
 * Idempotent — safe to call on createPlan / boot.
 */
export async function ensureCarePlanAssessmentTemplate(): Promise<DocumentTemplates> {
  const active = await db.from("documentTemplates")
    .eq("kind", "care_plan")
    .eq("active", true)
    .order("version", "desc")
    .first<DocumentTemplates>();

  if (active && isCarePlanAssessmentTemplate(active.structure)) {
    return active;
  }

  // Deactivate any older care_plan templates
  await db.from("documentTemplates").eq("kind", "care_plan").update({ active: false });

  const existingV2 = await db.from("documentTemplates")
    .eq("kind", "care_plan")
    .eq("version", CARE_PLAN_ASSESSMENT_VERSION)
    .first<DocumentTemplates>();

  if (existingV2) {
    await db.from("documentTemplates").eq("id", existingV2.id).update({
      active: true,
      name: CARE_PLAN_ASSESSMENT_NAME,
      structure: CARE_PLAN_ASSESSMENT_TEMPLATE as never,
    });
    return { ...existingV2, active: true, name: CARE_PLAN_ASSESSMENT_NAME, structure: CARE_PLAN_ASSESSMENT_TEMPLATE };
  }

  const [row] = await db.from("documentTemplates").insert<DocumentTemplates>({
    kind: "care_plan",
    version: CARE_PLAN_ASSESSMENT_VERSION,
    name: CARE_PLAN_ASSESSMENT_NAME,
    structure: CARE_PLAN_ASSESSMENT_TEMPLATE as never,
    active: true,
  });

  return row;
}

export function templateIsFullAssessment(tpl: DocumentTemplates | null | undefined): boolean {
  return !!tpl && isCarePlanAssessmentTemplate(tpl.structure);
}

export { CARE_PLAN_ASSESSMENT_FORMAT };
