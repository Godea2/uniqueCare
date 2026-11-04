import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/** Private knowledge-base documents for the website chatbot. */
export const WEBSITE_KB_BUCKET = "website-kb";

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

async function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const storage = supabase().storage;
      const existing = await storage.getBucket(WEBSITE_KB_BUCKET);
      if (existing.data) return;
      const created = await storage.createBucket(WEBSITE_KB_BUCKET, {
        public: false,
        fileSizeLimit: 25 * 1024 * 1024,
        allowedMimeTypes: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
          "text/markdown",
        ],
      });
      if (created.error && !/already exists/i.test(created.error.message)) {
        bucketReady = null;
        throw new Error("Knowledge base storage is not ready yet. Please try again.");
      }
    })();
  }
  await bucketReady;
}

const safeName = (fileName: string) => fileName.replace(/[^\w.\- ]/g, "_").slice(0, 120);

export async function websiteKbUploadTarget(fileName: string) {
  await ensureBucket();
  const key = `docs/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName(fileName)}`;
  const { data, error } = await supabase().storage.from(WEBSITE_KB_BUCKET).createSignedUploadUrl(key);
  if (error || !data?.signedUrl) throw new Error("We could not prepare your upload. Please try again.");
  return { key, uploadUrl: data.signedUrl };
}

export async function downloadWebsiteKb(key: string): Promise<Uint8Array> {
  await ensureBucket();
  const { data, error } = await supabase().storage.from(WEBSITE_KB_BUCKET).download(key);
  if (error || !data) throw new Error("Could not download knowledge document.");
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeWebsiteKb(key: string): Promise<void> {
  await ensureBucket();
  await supabase().storage.from(WEBSITE_KB_BUCKET).remove([key]).catch(() => {});
}

export async function signedWebsiteKbUrl(key: string, seconds = 60 * 15): Promise<string> {
  await ensureBucket();
  const { data, error } = await supabase().storage.from(WEBSITE_KB_BUCKET).createSignedUrl(key, seconds);
  if (error || !data?.signedUrl) throw new Error("Could not open this document.");
  return data.signedUrl;
}
