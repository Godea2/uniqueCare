import crypto from "node:crypto";

/**
 * Simple in-memory rate limiter: 5 submissions per 10 minutes per IP.
 * Sufficient for a single-instance deployment; swap for Redis/Upstash
 * if the site ever runs multi-instance.
 */

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 5;

const hits = new Map<string, number[]>();

export function rateLimitOk(key: string): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= LIMIT) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  // occasional cleanup
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      const kept = v.filter((t) => now - t < WINDOW_MS);
      if (kept.length === 0) hits.delete(k);
      else hits.set(k, kept);
    }
  }
  return true;
}

export function hashIp(ip: string): string {
  const salt = process.env.REVIEW_MODERATION_SECRET ?? "ucuk-website";
  return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}

export function clientIp(req: Request): string {
  const h = (n: string) => req.headers.get(n) ?? "";
  return (
    h("cf-connecting-ip") ||
    h("x-forwarded-for").split(",")[0]?.trim() ||
    h("x-real-ip") ||
    "unknown"
  );
}

/** HMAC-signed, expiring moderation token for review approve/reject links. */
export function signModerationToken(reviewId: string, action: string, expiresAt: number): string {
  const secret = process.env.REVIEW_MODERATION_SECRET ?? "ucuk-website";
  const payload = `${reviewId}.${action}.${expiresAt}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyModerationToken(
  token: string
): { reviewId: string; action: "approve" | "reject" } | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parts = raw.split(".");
    if (parts.length !== 4) return null;
    const [reviewId, action, exp, sig] = parts;
    if (action !== "approve" && action !== "reject") return null;
    if (Number(exp) < Date.now()) return null;
    const secret = process.env.REVIEW_MODERATION_SECRET ?? "ucuk-website";
    const expected = crypto.createHmac("sha256", secret).update(`${reviewId}.${action}.${exp}`).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return { reviewId, action };
  } catch {
    return null;
  }
}
