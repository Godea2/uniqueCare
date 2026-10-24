"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const CERTS = [
  { src: "/images/iso9001.jpeg", code: "ISO 9001:2015", label: "Quality Management", alt: "ISO 9001:2015 - Quality Management" },
  { src: "/images/iso45001.jpeg", code: "ISO 45001:2018", label: "Occupational Health & Safety", alt: "ISO 45001:2018 - Occupational Health & Safety" },
  { src: "/images/iso14001.jpeg", code: "ISO 14001:2015", label: "Environmental Management", alt: "ISO 14001:2015 - Environmental Management" },
  { src: "/images/iso27001.jpeg", code: "ISO 27001:2022", label: "Information Security Management", alt: "ISO 27001:2022 - Information Security Management" },
];

export default function CertificationGrid() {
  const [open, setOpen] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      lastTrigger.current?.focus();
    };
  }, [open]);

  return (
    <>
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {CERTS.map((c, i) => (
          <button
            key={c.code}
            type="button"
            onClick={(e) => {
              lastTrigger.current = e.currentTarget;
              setOpen(i);
            }}
            aria-haspopup="dialog"
            className="fade-up group rounded-card border border-line bg-white p-5 text-left shadow-card transition hover:-translate-y-1 hover:shadow-card-hover"
          >
            <span className="relative block aspect-[4/3] overflow-hidden rounded-lg bg-surface-alt">
              <Image src={c.src} alt={c.alt} fill sizes="(min-width:1024px) 25vw, 50vw" className="object-contain p-2" />
            </span>
            <span className="mt-3 block font-semibold text-ink">{c.code}</span>
            <span className="block text-sm text-ink-muted">{c.label}</span>
          </button>
        ))}
      </div>

      {open !== null && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={CERTS[open].alt}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(null);
          }}
        >
          <div className="relative w-full max-w-2xl rounded-card bg-white p-4">
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label="Close certificate viewer"
              className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-card"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            <div className="relative aspect-[4/3] w-full">
              <Image src={CERTS[open].src} alt={CERTS[open].alt} fill sizes="(min-width:768px) 42rem, 90vw" className="object-contain" />
            </div>
            <p className="mt-3 text-center text-sm text-ink-muted">
              <strong className="text-ink">{CERTS[open].code}</strong> — {CERTS[open].label}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
