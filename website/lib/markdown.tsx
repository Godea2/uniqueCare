import React from "react";

/**
 * Tiny, safe markdown renderer for job descriptions coming from the
 * existing application (description_md). React escapes all text by
 * default, so raw HTML can never be injected. Supports: ## / ### headings,
 * - and * bullet lists, **bold**, *italic*, and paragraphs.
 */

function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // split on **bold** and *italic* tokens
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else out.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const els: React.ReactNode[] = [];
  let key = 0;
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const isList = lines.every((l) => /^[-*]\s+/.test(l));
    if (isList) {
      els.push(
        <ul key={key++} className="list-disc space-y-1.5 pl-5">
          {lines.map((l, i) => (
            <li key={i}>{inline(l.replace(/^[-*]\s+/, ""))}</li>
          ))}
        </ul>
      );
      continue;
    }
    if (lines.every((l) => /^\d+\.\s+/.test(l)) && lines.length > 1) {
      els.push(
        <ol key={key++} className="list-decimal space-y-1.5 pl-5">
          {lines.map((l, i) => (
            <li key={i}>{inline(l.replace(/^\d+\.\s+/, ""))}</li>
          ))}
        </ol>
      );
      continue;
    }
    for (const line of lines) {
      if (line.startsWith("### ")) els.push(<h3 key={key++} className="mt-4 font-heading text-xl font-semibold text-ink">{inline(line.slice(4))}</h3>);
      else if (line.startsWith("## ")) els.push(<h2 key={key++} className="mt-4 font-heading text-2xl font-semibold text-ink">{inline(line.slice(3))}</h2>);
      else if (line.startsWith("# ")) els.push(<h2 key={key++} className="mt-4 font-heading text-2xl font-semibold text-ink">{inline(line.slice(2))}</h2>);
      else els.push(<p key={key++}>{inline(line)}</p>);
    }
  }
  return <div className={className ?? "space-y-3 leading-relaxed text-ink-muted"}>{els}</div>;
}
