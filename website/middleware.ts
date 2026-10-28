import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// NOTE: middleware runs on the Edge runtime, where Node's `crypto` module is
// unavailable — the session HMAC is verified with Web Crypto instead. The
// token format is identical to lib/admin/auth.ts (base64url(body).base64url(HMAC-SHA256)).

const COOKIE = "uc_website_admin";
const encoder = new TextEncoder();

function sessionSecret(): string {
  return (
    process.env.WEBSITE_ADMIN_SESSION_SECRET
    || process.env.REVIEW_MODERATION_SECRET
    || process.env.REVALIDATE_SECRET
    || "dev-only-change-me"
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return bytesToBase64Url(new Uint8Array(sig));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function validSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  try {
    if (!safeEqual(sig, await hmac(body))) return false;
    const s = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as { exp?: number };
    return !!s.exp && Date.now() / 1000 <= s.exp;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");
  const isLogin = pathname === "/admin/login";
  const isAuthApi = pathname === "/api/admin/auth/login" || pathname === "/api/admin/auth/logout";

  if (isAuthApi || isLogin) return NextResponse.next();

  if (isAdminPage || isAdminApi) {
    const ok = await validSession(req.cookies.get(COOKIE)?.value);
    if (!ok) {
      if (isAdminApi) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
