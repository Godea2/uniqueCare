import Link from "next/link";
import type { LegalBlock, LegalSection } from "@/content/legal/privacy";

function Block({ block }: { block: LegalBlock }) {
  if (block.type === "h3") {
    return <h3>{block.text}</h3>;
  }
  if (block.type === "list") {
    return (
      <ul>
        {block.items.map((item, i) => (
          <li key={i}>{linkify(item)}</li>
        ))}
      </ul>
    );
  }
  return <p>{linkify(block.text)}</p>;
}

/** Turn known URLs/mentions into links without changing the wording. */
export function linkify(text: string): React.ReactNode {
  const patterns: [RegExp, (m: string, key: string) => React.ReactNode][] = [
    [/ico\.org\.uk/, (m, k) => (
      <a key={k} href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">{m}</a>
    )],
    [/modernslaveryhelpline\.org/, (m, k) => (
      <a key={k} href="https://www.modernslaveryhelpline.org" target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">{m}</a>
    )],
    [/info@uniquecareuk\.com/, (m, k) => (
      <a key={k} href="mailto:info@uniquecareuk.com" className="text-brand-primary hover:underline">{m}</a>
    )],
    [/\b02039170260\b/, (m, k) => (
      <a key={k} href="tel:+442039170260" className="text-brand-primary hover:underline">{m}</a>
    )],
  ];
  let out: React.ReactNode[] = [text];
  patterns.forEach(([re, render], pi) => {
    out = out.flatMap((node, ni) => {
      if (typeof node !== "string") return [node];
      const parts = node.split(re);
      return parts.flatMap((part, i) => (i === 0 ? [part] : [render(node.match(re)![0], `${pi}-${ni}-${i}`), part]));
    });
  });
  return <>{out}</>;
}

export default function LegalPage({
  eyebrow,
  title,
  dateLine,
  infoCard,
  sections,
  injectAfter,
}: {
  eyebrow: string;
  title: string;
  dateLine?: string;
  infoCard?: { label: string; value: string }[];
  sections: LegalSection[];
  /** Extra content rendered immediately after the named section id. */
  injectAfter?: Record<string, React.ReactNode>;
}) {
  return (
    <div className="bg-surface">
      <div className="mx-auto max-w-content px-4 pb-16 pt-10">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 font-heading text-4xl font-semibold text-ink md:text-5xl">{title}</h1>
        {dateLine && <p className="mt-3 text-sm text-ink-muted">{dateLine}</p>}

        {infoCard && (
          <dl className="mt-6 grid gap-4 rounded-card border border-line bg-brand-soft p-6 sm:grid-cols-2 lg:grid-cols-4">
            {infoCard.map((f) => (
              <div key={f.label}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{f.label}</dt>
                <dd className="mt-1 font-semibold text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-10 grid gap-10 lg:grid-cols-[240px_1fr]">
          <aside className="hidden lg:block">
            <nav aria-label="On this page" className="sticky top-28">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">On this page</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {sections.map((s) => (
                  <li key={s.id}>
                    <Link href={`#${s.id}`} className="text-ink-muted hover:text-brand-primary hover:underline">
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <div className="prose-legal">
            {sections.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
                <h2 id={`${s.id}-h`}>{s.title}</h2>
                {s.blocks.map((b, j) => (
                  <Block key={j} block={b} />
                ))}
                {injectAfter?.[s.id]}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
