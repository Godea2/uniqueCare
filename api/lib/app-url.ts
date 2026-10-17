import { db } from "../db";
import type { Organisations } from "@db/schema";

/** Public base URL for links in emails. APP_URL wins; otherwise the URL the request came in on. */
export function appUrl(req?: Request | null): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const origin = req?.headers.get("origin");
  if (origin) return origin.replace(/\/+$/, "");
  const host = req?.headers.get("x-forwarded-host") ?? req?.headers.get("host");
  if (host) return `${req?.headers.get("x-forwarded-proto") ?? "https"}://${host}`;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export const portalUrl = (base: string, token: string) => `${base}/portal/${token}`;

/** Absolute logo URL for HTML emails (navy header → white wordmark). */
export function emailLogoUrl(req?: Request | null, stored?: string | null): string {
  const raw = stored?.trim();
  if (raw?.startsWith("http://") || raw?.startsWith("https://")) return raw;
  // Default brand asset is /logo.png; emails need the white variant on #082f52.
  const path = !raw || raw === "/logo.png" ? "/logo-white.png" : raw.startsWith("/") ? raw : `/${raw}`;
  return `${appUrl(req)}${path}`;
}

/** Organisation details used in candidate-facing text. */
export async function orgProfile(req?: Request | null): Promise<{
  name: string; signatory: string; signatoryTitle: string; signOff: string; logoUrl: string;
}> {
  const org = await db.from("organisations").first<Organisations>();
  const settings = (org?.settings ?? {}) as { signatoryName?: string; signatoryTitle?: string };
  const name = org?.name || "Unique Care UK";
  const signatory = settings.signatoryName?.trim() || `${name} recruitment team`;
  const signatoryTitle = settings.signatoryTitle?.trim() || "";
  const signOff = settings.signatoryName?.trim()
    ? `Kind regards,\n${signatory}${signatoryTitle ? `\n${signatoryTitle}` : ""}\n${name}`
    : `Kind regards,\n${signatory}`;
  const logoUrl = emailLogoUrl(req, org?.logoUrl);
  return { name, signatory, signatoryTitle, signOff, logoUrl };
}
