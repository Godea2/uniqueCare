import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/** Private buckets: CVs from the public apply form, compliance documents from the candidate portal. */
const CV_BUCKET = "cvs";
const DOC_BUCKET = "documents";

let client: SupabaseClient | null = null;
const bucketReady = new Map<string, Promise<void>>();

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

async function ensureBucket(bucket: string): Promise<void> {
  let ready = bucketReady.get(bucket);
  if (!ready) {
    ready = (async () => {
      const storage = supabase().storage;
      const existing = await storage.getBucket(bucket);
      if (existing.data) return;
      const created = await storage.createBucket(bucket, { public: false });
      if (created.error && !/already exists/i.test(created.error.message)) {
        bucketReady.delete(bucket);
        throw new Error("File storage is not ready yet. Please try again in a moment.");
      }
    })();
    bucketReady.set(bucket, ready);
  }
  await ready;
}

const safeName = (fileName: string) => fileName.replace(/[^\w.\- ]/g, "_").slice(0, 120);

async function save(bucket: string, prefix: string, bytes: Uint8Array, fileName: string, contentType: string, failure: string) {
  await ensureBucket(bucket);
  const key = `${prefix}${Date.now()}-${safeName(fileName)}`;
  const { error } = await supabase().storage.from(bucket).upload(key, bytes, { contentType, upsert: false });
  if (error) throw new Error(failure);
  return { key };
}

async function signedUrl(bucket: string, key: string, failure: string) {
  await ensureBucket(bucket);
  const { data, error } = await supabase().storage.from(bucket).createSignedUrl(key, 60 * 15);
  if (error || !data?.signedUrl) throw new Error(failure);
  return data.signedUrl;
}

export function saveCv(bytes: Uint8Array, fileName: string, contentType: string): Promise<{ key: string }> {
  return save(CV_BUCKET, "", bytes, fileName, contentType, "We could not store your CV. Please try again.");
}

export async function readCv(key: string): Promise<Uint8Array | null> {
  await ensureBucket(CV_BUCKET);
  const { data, error } = await supabase().storage.from(CV_BUCKET).download(key);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export function cvDownloadUrl(key: string): Promise<string> {
  return signedUrl(CV_BUCKET, key, "This CV could not be opened.");
}

export function saveDocument(ownerKey: string, bytes: Uint8Array, fileName: string, contentType: string) {
  return save(DOC_BUCKET, `${ownerKey}/`, bytes, fileName, contentType, "We could not store your document. Please try again.");
}

export function documentDownloadUrl(key: string): Promise<string> {
  return signedUrl(DOC_BUCKET, key, "This document could not be opened.");
}

/** Accept PDF, JPEG, PNG, HEIC/HEIF and Word files, checked by their first bytes. */
export function sniffDocument(bytes: Uint8Array, fileName: string): string | null {
  const b = bytes;
  const lower = fileName.toLowerCase();
  const ascii = (from: number, to: number) => Buffer.from(b.slice(from, to)).toString("latin1");
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(4, 8) === "ftyp" && /^(heic|heix|mif1|msf1|hevc)$/.test(ascii(8, 12))) return "image/heic";
  if (b[0] === 0x50 && b[1] === 0x4b && lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (b[0] === 0xd0 && b[1] === 0xcf && lower.endsWith(".doc")) return "application/msword";
  return null;
}
