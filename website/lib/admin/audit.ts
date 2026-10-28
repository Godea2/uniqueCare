import { adminInsert } from "./db";

/** Every admin mutation should call this. action = "entity.verb" e.g. "enquiry.read". */
export async function writeAudit(opts: {
  action: string;
  entityType: string;
  entityId?: string | number | null;
  details?: Record<string, unknown> | string | null;
}): Promise<void> {
  try {
    const details =
      opts.details == null
        ? null
        : typeof opts.details === "string"
          ? opts.details
          : JSON.stringify(opts.details);
    await adminInsert("website_audit_log", {
      action: opts.action,
      entity_type: opts.entityType,
      entity_id: opts.entityId == null ? null : String(opts.entityId),
      details,
    });
  } catch (e) {
    console.warn("[audit]", e instanceof Error ? e.message : e);
  }
}

export function humaniseAuditAction(action: string): string {
  const [entity, verb] = action.split(".");
  const e = (entity ?? "item").replace(/_/g, " ");
  const v = (verb ?? "updated").replace(/_/g, " ");
  return `${e.replace(/\b\w/g, (c) => c.toUpperCase())} ${v.replace(/\b\w/g, (c) => c.toUpperCase())}`;
}
