/**
 * Resolve the staff portal base URL from the env names used across deployments.
 * Production Vercel currently sets NEXT_PUBLIC_PORTAL_URL.
 */
export function portalBaseUrl(): string {
  return (
    process.env.JOBS_PORTAL_URL
    || process.env.NEXT_PUBLIC_PORTAL_URL
    || process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL
    || "https://portal.uniquecareuk.online"
  ).replace(/\/$/, "");
}
