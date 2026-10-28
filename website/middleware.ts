import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Website admin now lives in the staff portal (Registered Manager only), so there
 * is no separate website login. /admin and /admin/* simply redirect to the portal's
 * Website section. Public form routes (/api/enquiry, /api/review, /api/subscribe,
 * /api/unsubscribe, /api/application) are untouched.
 */
export function middleware(req: NextRequest) {
  const portal = (process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(portal)) {
    // Portal URL not configured — send visitors to the public home page instead.
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.redirect(`${portal}/website`);
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
