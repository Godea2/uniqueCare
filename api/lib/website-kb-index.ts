import { downloadWebsiteKb } from "./website-kb-store";
import { websiteDelete, websiteInsert, websiteUpdate } from "./website-db";

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(clean.length, i + CHUNK_SIZE);
    let slice = clean.slice(i, end);
    if (end < clean.length) {
      const lastBreak = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "), slice.lastIndexOf(" "));
      if (lastBreak > CHUNK_SIZE * 0.5) slice = slice.slice(0, lastBreak + 1);
    }
    const trimmed = slice.trim();
    if (trimmed) chunks.push(trimmed);
    if (end >= clean.length) break;
    i += Math.max(1, trimmed.length - CHUNK_OVERLAP);
  }
  return chunks;
}

async function extractText(bytes: Uint8Array, mime: string, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();
  if (mime === "text/plain" || mime === "text/markdown" || /\.(txt|md)$/.test(lower)) {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  if (mime.includes("wordprocessingml") || /\.docx$/i.test(lower)) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return result.value || "";
  }
  if (mime === "application/pdf" || /\.pdf$/i.test(lower)) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: Buffer.from(bytes) });
    try {
      const result = await parser.getText();
      return String(result?.text ?? "");
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
  if (mime === "application/msword" || /\.doc$/i.test(lower)) {
    throw new Error("Legacy .doc files are not supported. Please upload PDF, DOCX, or TXT.");
  }
  throw new Error("Unsupported file type. Upload PDF, DOCX, TXT, or Markdown.");
}

/** Extract text, replace chunks, mark document ready/error. */
export async function indexWebsiteKbDocument(doc: {
  id: number;
  storage_key: string;
  mime_type: string;
  file_name: string;
}): Promise<{ chunkCount: number }> {
  try {
    const bytes = await downloadWebsiteKb(doc.storage_key);
    const text = await extractText(bytes, doc.mime_type, doc.file_name);
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("No readable text was found in this document.");

    await websiteDelete("website_ai_chunks", { eq: { document_id: doc.id } });
    const rows = chunks.map((content, chunk_index) => ({
      document_id: doc.id,
      chunk_index,
      content,
    }));
    // Insert in batches
    for (let i = 0; i < rows.length; i += 40) {
      await websiteInsert("website_ai_chunks", rows.slice(i, i + 40));
    }
    await websiteUpdate("website_ai_documents", { eq: { id: doc.id } }, {
      status: "ready",
      error_message: null,
      chunk_count: chunks.length,
      updated_at: new Date().toISOString(),
    });
    return { chunkCount: chunks.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Indexing failed";
    await websiteUpdate("website_ai_documents", { eq: { id: doc.id } }, {
      status: "error",
      error_message: message.slice(0, 500),
      chunk_count: 0,
      updated_at: new Date().toISOString(),
    });
    throw e instanceof Error ? e : new Error(message);
  }
}

/** Rank chunks by simple term overlap (no vector DB required). */
export function rankChunks(query: string, chunks: { id: number; content: string; document_id: number }[], limit = 6) {
  const terms = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (terms.length === 0) return chunks.slice(0, limit);

  const scored = chunks.map((c) => {
    const hay = c.content.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (hay.includes(t)) score += 1;
      // light boost for repeated mentions
      const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      const m = hay.match(re);
      if (m) score += Math.min(3, m.length) * 0.25;
    }
    return { ...c, score };
  });
  const matched = scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
  if (matched.length > 0) return matched.slice(0, limit);
  // Soft fallback: return early chunks so the model still has some context.
  return chunks.slice(0, Math.min(limit, 4));
}
