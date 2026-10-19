import { db } from "../db";
import type { DocumentTemplates } from "@db/schema";
import {
  SUPPORT_PLAN_NAME,
  SUPPORT_PLAN_TEMPLATE,
  SUPPORT_PLAN_VERSION,
  isSupportPlanTemplate,
} from "@contracts/support-plan";

/**
 * Ensures the active support_plan template is the person-centred structure.
 * Idempotent — safe to call on createPlan.
 */
export async function ensureSupportPlanTemplate(): Promise<DocumentTemplates> {
  const active = await db.from("documentTemplates")
    .eq("kind", "support_plan")
    .eq("active", true)
    .order("version", "desc")
    .first<DocumentTemplates>();

  if (active && isSupportPlanTemplate(active.structure)) {
    return active;
  }

  await db.from("documentTemplates").eq("kind", "support_plan").update({ active: false });

  const existing = await db.from("documentTemplates")
    .eq("kind", "support_plan")
    .eq("version", SUPPORT_PLAN_VERSION)
    .first<DocumentTemplates>();

  if (existing) {
    await db.from("documentTemplates").eq("id", existing.id).update({
      active: true,
      name: SUPPORT_PLAN_NAME,
      structure: SUPPORT_PLAN_TEMPLATE as never,
    });
    return { ...existing, active: true, name: SUPPORT_PLAN_NAME, structure: SUPPORT_PLAN_TEMPLATE };
  }

  const [row] = await db.from("documentTemplates").insert<DocumentTemplates>({
    kind: "support_plan",
    version: SUPPORT_PLAN_VERSION,
    name: SUPPORT_PLAN_NAME,
    structure: SUPPORT_PLAN_TEMPLATE as never,
    active: true,
  });

  return row;
}
