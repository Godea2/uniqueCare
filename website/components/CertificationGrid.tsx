"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { FALLBACK_CERTS, type Certification } from "@/lib/certifications-defaults";

const isRemote = (src: string) => /^https?:\/\//i.test(src);


export default function CertificationGrid({ certs }: { certs?: Certification[] }) {
  const CERTS = certs && certs.length > 0 ? certs : FALLBACK_CERTS;
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
            key={c.id}
            type="button"
            onClick={(e) => {
              lastTrigger.current = e.currentTarget;
              setOpen(i);
            }}
            aria-haspopup="dialog"
            className="fade-up uc-card group p-5 text-left"
          >
            <span className="relative block aspect-[4/3] overflow-hidden rounded-lg bg-surface-alt">
              <Image src={c.image} alt={c.imageAlt} unoptimized={isRemote(c.image)} fill sizes="(min-width:1024px) 25vw, 50vw" className="object-contain p-2" />
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
          aria-label={CERTS[open].imageAlt}
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
              <Image src={CERTS[open].image} alt={CERTS[open].imageAlt} unoptimized={isRemote(CERTS[open].image)} fill sizes="(min-width:768px) 42rem, 90vw" className="object-contain" />
            </div>
            <p className="mt-3 text-center text-sm text-ink-muted">
              <strong className="text-ink">{CERTS[open].code}</strong> – {CERTS[open].label}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
