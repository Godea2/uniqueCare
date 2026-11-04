import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/** Public marketing media bucket — logos, heroes, service images, videos. */
export const WEBSITE_MEDIA_BUCKET = "website-media";

let client: SupabaseClient | null = null;
let bucketReady: Promise<void> | null = null;

function supabase(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error("File storage is not configured.");
  }
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

async function ensurePublicBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const storage = supabase().storage;
      const existing = await storage.getBucket(WEBSITE_MEDIA_BUCKET);
      if (existing.data) {
        if (!existing.data.public) {
          await storage.updateBucket(WEBSITE_MEDIA_BUCKET, { public: true });
        }
        return;
      }
      const created = await storage.createBucket(WEBSITE_MEDIA_BUCKET, {
        public: true,
        fileSizeLimit: 40 * 1024 * 1024,
        allowedMimeTypes: [
          "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
          "video/mp4", "video/webm", "application/pdf",
        ],
      });
      if (created.error && !/already exists/i.test(created.error.message)) {
        bucketReady = null;
        throw new Error("Website media storage is not ready yet. Please try again in a moment.");
      }
    })();
  }
  await bucketReady;
}

const safeName = (fileName: string) => fileName.replace(/[^\w.\- ]/g, "_").slice(0, 120);

export function publicMediaUrl(key: string): string {
  const base = (env.supabaseUrl ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${WEBSITE_MEDIA_BUCKET}/${key}`;
}

/** One-time signed PUT URL so large files bypass the serverless body limit. */
export async function websiteMediaUploadTarget(fileName: string, folder = "general") {
  await ensurePublicBucket();
  const cleanFolder = folder.replace(/[^\w\-]/g, "").slice(0, 40) || "general";
  const key = `${cleanFolder}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName(fileName)}`;
  const { data, error } = await supabase().storage.from(WEBSITE_MEDIA_BUCKET).createSignedUploadUrl(key);
  if (error || !data?.signedUrl) throw new Error("We could not prepare your upload. Please try again.");
  return { key, uploadUrl: data.signedUrl, publicUrl: publicMediaUrl(key) };
}

export async function removeWebsiteMedia(key: string): Promise<void> {
  await ensurePublicBucket();
  await supabase().storage.from(WEBSITE_MEDIA_BUCKET).remove([key]).catch(() => {});
}

export function sniffWebsiteMedia(fileName: string, mimeHint = ""): { kind: "image" | "video" | "document" | "other"; mime: string } {
  const lower = fileName.toLowerCase();
  if (mimeHint.startsWith("image/") || /\.(jpe?g|png|webp|gif|svg)$/.test(lower)) {
    return { kind: "image", mime: mimeHint || "image/jpeg" };
  }
  if (mimeHint.startsWith("video/") || /\.(mp4|webm|mov)$/.test(lower)) {
    return { kind: "video", mime: mimeHint || "video/mp4" };
  }
  if (mimeHint === "application/pdf" || /\.pdf$/.test(lower)) {
    return { kind: "document", mime: "application/pdf" };
  }
  return { kind: "other", mime: mimeHint || "application/octet-stream" };
}
