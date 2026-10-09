/**
 * Extract plain text from an uploaded CV (PDF / DOCX / DOC).
 * Returns { text, readable } — readable=false means the file could not be
 * text-extracted (e.g. a scanned image PDF) and should be flagged for
 * manual review rather than silently scored without evidence.
 */
export async function extractCvText(
  bytes: Uint8Array,
  fileName: string,
): Promise<{ text: string; readable: boolean }> {
  const lower = fileName.toLowerCase();
  try {
    if (lower.endsWith(".pdf")) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: Buffer.from(bytes) });
      const result = await parser.getText();
      await parser.destroy();
      const text = (result.text ?? "").trim();
      // Scanned PDFs yield almost no text — flag for manual review
      return { text, readable: text.length >= 40 };
    }
    if (lower.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      const text = (result.value ?? "").trim();
      return { text, readable: text.length >= 40 };
    }
    if (lower.endsWith(".doc")) {
      // Legacy .doc: best-effort printable-text extraction
      const raw = Buffer.from(bytes).toString("latin1");
      const text = raw.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{2,}/g, " ").trim();
      return { text, readable: text.length >= 40 };
    }
    return { text: "", readable: false };
  } catch {
    return { text: "", readable: false };
  }
}
