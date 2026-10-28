import { websiteInsert } from "./website-db";

/**
 * Record a website-admin action in website_audit_log.
 * action = "entity.verb" e.g. "enquiry.read". The table has no actor column, so
 * the acting staff member is stored inside the JSON `details`.
 * Never throws — an audit failure must not undo the action it describes.
 */
export async function writeWebsiteAudit(opts: {
  action: string;
  entityType: string;
  entityId?: string | number | null;
  actorName?: string;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const payload = { ...(opts.actorName ? { actor: opts.actorName } : {}), ...(opts.details ?? {}) };
    await websiteInsert("website_audit_log", {
      action: opts.action,
      entity_type: opts.entityType,
      entity_id: opts.entityId == null ? null : String(opts.entityId),
      details: Object.keys(payload).length ? JSON.stringify(payload) : null,
    });
  } catch (e) {
    console.warn("[website-audit]", e instanceof Error ? e.message : e);
  }
}

export function humaniseAuditAction(action: string): string {
  const [entity, verb] = action.split(".");
  const title = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `${title(entity ?? "item")} ${title(verb ?? "updated")}`;
}
