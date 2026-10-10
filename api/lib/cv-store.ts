import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

const BUCKET = "cvs";

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
      const existing = await storage.getBucket(BUCKET);
      if (existing.data) return;
      const created = await storage.createBucket(BUCKET, { public: false });
      if (created.error && !/already exists/i.test(created.error.message)) {
        bucketReady = null;
        throw new Error("File storage is not ready yet. Please try again in a moment.");
      }
    })();
  }
  await bucketReady;
}

export async function saveCv(bytes: Uint8Array, fileName: string, contentType: string): Promise<{ key: string }> {
  await ensureBucket();
  const safe = fileName.replace(/[^\w.\- ]/g, "_").slice(0, 120);
  const key = `${Date.now()}-${safe}`;
  const { error } = await supabase().storage.from(BUCKET).upload(key, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error("We could not store your CV. Please try again.");
  return { key };
}

export async function cvDownloadUrl(key: string): Promise<string> {
  await ensureBucket();
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(key, 60 * 15);
  if (error || !data?.signedUrl) throw new Error("This CV could not be opened.");
  return data.signedUrl;
}
