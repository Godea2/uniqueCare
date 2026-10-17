/** ASCII-safe line for classic PDF Helvetica. */
function pdfSafe(text: string): string {
  return text
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
}

function escapePdf(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) return [line || " "];
  const out: string[] = [];
  let rest = line;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(" ", maxChars);
    if (cut < maxChars * 0.5) cut = maxChars;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Minimal multi-page PDF from plain text (no external PDF library).
 * Used for offer letters, training certificates and outcome letters.
 */
export function renderTextPdf(content: string, meta?: { title?: string; author?: string }): Uint8Array {
  const title = pdfSafe(meta?.title ?? "Document");
  const author = pdfSafe(meta?.author ?? "Unique Care UK");
  const lines = pdfSafe(content).split(/\r?\n/).flatMap((l) => wrapLine(l, 90));
  const linesPerPage = 48;
  const pages: string[][] = [];
  for (let i = 0; i < Math.max(lines.length, 1); i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push([" "]);

  type Obj = { id: number; body: string };
  const objs: Obj[] = [];
  const pageContentBodies: string[] = [];

  for (const pageLines of pages) {
    const ops = ["BT", "/F1 11 Tf", "14 TL", "50 800 Td"];
    for (const line of pageLines) {
      ops.push(`(${escapePdf(line)}) Tj`, "T*");
    }
    ops.push("ET");
    const stream = ops.join("\n");
    pageContentBodies.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  }

  const fontId = 3 + pages.length * 2;
  const infoId = fontId + 1;
  const catalogId = 1;
  const pagesId = 2;
  const contentIds = pages.map((_, i) => 3 + i * 2);
  const pageIds = pages.map((_, i) => 4 + i * 2);

  objs.push({ id: catalogId, body: `<< /Type /Catalog /Pages ${pagesId} 0 R >>` });
  objs.push({
    id: pagesId,
    body: `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  });

  for (let i = 0; i < pages.length; i++) {
    objs.push({ id: contentIds[i]!, body: pageContentBodies[i]! });
    objs.push({
      id: pageIds[i]!,
      body: `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    });
  }

  objs.push({ id: fontId, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" });
  objs.push({
    id: infoId,
    body: `<< /Title (${escapePdf(title)}) /Author (${escapePdf(author)}) /Creator (UniqueCare Connect) /Producer (UniqueCare Connect) >>`,
  });

  objs.sort((a, b) => a.id - b.id);
  const parts: Buffer[] = [];
  const offsets = new Map<number, number>();
  let cursor = 0;
  const write = (s: string) => {
    const buf = Buffer.from(s, "latin1");
    parts.push(buf);
    cursor += buf.length;
  };

  write("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  for (const obj of objs) {
    offsets.set(obj.id, cursor);
    write(`${obj.id} 0 obj\n${obj.body}\nendobj\n`);
  }

  const xrefStart = cursor;
  const size = infoId + 1;
  write(`xref\n0 ${size}\n`);
  write("0000000000 65535 f \n");
  for (let i = 1; i < size; i++) {
    write(`${String(offsets.get(i) ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  write(`trailer\n<< /Size ${size} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return new Uint8Array(Buffer.concat(parts));
}
