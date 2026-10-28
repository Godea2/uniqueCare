"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, Loader2, RefreshCw, XCircle } from "lucide-react";
import { adminFetch, errorMessage, fmtDateTime } from "@/lib/admin/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { EmptyState, ErrorBlock, PageHeader, SearchBox, Tabs, btnGhost, btnPrimary, card } from "@/components/admin/ui";

type Issue = { level: "error" | "warn"; message: string };
type Page = {
  path: string;
  url: string;
  group: string;
  httpStatus: number | null;
  title: string | null;
  titleLength: number;
  description: string | null;
  descriptionLength: number;
  canonical: string | null;
  robots: string | null;
  h1Count: number;
  og: { title: string | null; description: string | null; image: string | null };
  issues: Issue[];
  score: number;
};
type Scan = {
  base: string;
  scannedAt: string;
  pages: Page[];
  summary: { pages: number; avgScore: number; withErrors: number; withWarnings: number; clean: number };
};

function scoreTone(score: number): string {
  if (score >= 90) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  if (score >= 70) return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
}

function Field({ label, value, length }: { label: string; value: string | null; length?: number }) {
  return (
    <div>
      <dt className="admin-label">
        {label}
        {length != null && value ? <span className="ml-1 normal-case text-slate-400">({length} chars)</span> : null}
      </dt>
      <dd className={`break-words text-sm ${value ? "" : "italic text-red-500"}`}>{value || "Missing"}</dd>
    </div>
  );
}

export default function SeoPage() {
  const toast = useAdminToast();
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const run = useCallback(
    async (manual = false) => {
      setLoading(true);
      try {
        setScan(await adminFetch<Scan>("/api/admin/seo"));
        setError(null);
        if (manual) toast.push("ok", "Scan complete");
      } catch (e) {
        setError(errorMessage(e));
        if (manual) toast.push("err", errorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(() => {
    if (!scan) return [];
    const needle = q.trim().toLowerCase();
    return scan.pages
      .filter((p) => {
        if (filter === "errors" && !p.issues.some((i) => i.level === "error")) return false;
        if (filter === "warnings" && !p.issues.some((i) => i.level === "warn")) return false;
        if (filter === "clean" && p.issues.length > 0) return false;
        if (needle && !`${p.path} ${p.title ?? ""} ${p.group}`.toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort((a, b) => a.score - b.score);
  }, [scan, filter, q]);

  const s = scan?.summary;

  return (
    <div>
      <PageHeader
        title="On-page SEO"
        description="Scans every public page for titles, meta descriptions, canonical tags, headings and social preview tags."
        actions={
          <>
            <Link href="/admin/seo/offpage" className={btnGhost}>Off-page SEO</Link>
            <button type="button" className={btnPrimary} onClick={() => run(true)} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {scan ? "Re-scan" : "Scan site"}
            </button>
          </>
        }
      />

      {error && <div className="mb-4"><ErrorBlock message={error} onRetry={() => run(true)} /></div>}

      {loading && !scan && (
        <div className={`${card} flex items-center justify-center gap-2 px-6 py-14 text-sm text-slate-500`}>
          <Loader2 className="h-4 w-4 animate-spin" /> Scanning pages — this can take up to a minute…
        </div>
      )}

      {scan && s && (
        <div className="space-y-5">
          <p className="text-xs text-slate-500">
            Scanned <strong>{scan.base}</strong> · {fmtDateTime(scan.scannedAt)}
            {loading && <span className="ml-2 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Re-scanning…</span>}
          </p>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className={`${card} p-5`}>
              <p className="admin-label">Average score</p>
              <p className="font-heading text-3xl font-semibold">{s.avgScore}<span className="text-base text-slate-400">/100</span></p>
              <p className="text-xs text-slate-500">{s.pages} pages scanned</p>
            </div>
            <div className={`${card} p-5`}>
              <p className="admin-label">Pages with errors</p>
              <p className="font-heading text-3xl font-semibold text-red-600">{s.withErrors}</p>
            </div>
            <div className={`${card} p-5`}>
              <p className="admin-label">Pages with warnings</p>
              <p className="font-heading text-3xl font-semibold text-amber-600">{s.withWarnings}</p>
            </div>
            <div className={`${card} p-5`}>
              <p className="admin-label">Clean pages</p>
              <p className="font-heading text-3xl font-semibold text-emerald-600">{s.clean}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              active={filter}
              onChange={setFilter}
              tabs={[
                { key: "all", label: "All", count: s.pages },
                { key: "errors", label: "Errors", count: s.withErrors },
                { key: "warnings", label: "Warnings" },
                { key: "clean", label: "Clean", count: s.clean },
              ]}
            />
            <SearchBox value={q} onChange={setQ} placeholder="Search path or title" />
          </div>

          {shown.length === 0 ? (
            <EmptyState title="No pages match" description="Try a different filter or search." />
          ) : (
            <ul className="space-y-2">
              {shown.map((p) => {
                const isOpen = open === p.path;
                const errs = p.issues.filter((i) => i.level === "error").length;
                const warns = p.issues.length - errs;
                return (
                  <li key={p.path} className={`${card} overflow-hidden`}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : p.path)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <span className={`inline-flex h-9 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${scoreTone(p.score)}`}>
                        {p.score}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{p.path}</p>
                        <p className="truncate text-xs text-slate-500">{p.title ?? "No title"}</p>
                      </div>
                      <span className="hidden shrink-0 items-center gap-3 text-xs sm:flex">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{p.group}</span>
                        {errs > 0 && <span className="inline-flex items-center gap-1 text-red-600"><XCircle className="h-3.5 w-3.5" /> {errs}</span>}
                        {warns > 0 && <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> {warns}</span>}
                        {p.issues.length === 0 && <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> OK</span>}
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`} />
                    </button>

                    {isOpen && (
                      <div className="space-y-4 border-t border-slate-100 px-4 py-4 dark:border-slate-800">
                        {p.issues.length > 0 && (
                          <ul className="space-y-1">
                            {p.issues.map((i, idx) => (
                              <li key={idx} className={`flex items-start gap-2 text-sm ${i.level === "error" ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>
                                {i.level === "error" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                                {i.message}
                              </li>
                            ))}
                          </ul>
                        )}
                        <dl className="grid gap-4 sm:grid-cols-2">
                          <Field label="Title" value={p.title} length={p.titleLength} />
                          <Field label="Meta description" value={p.description} length={p.descriptionLength} />
                          <Field label="Canonical" value={p.canonical} />
                          <Field label="Robots" value={p.robots ?? "index, follow (default)"} />
                          <Field label="og:title" value={p.og.title} />
                          <Field label="og:description" value={p.og.description} />
                          <Field label="og:image" value={p.og.image} />
                          <div>
                            <dt className="admin-label">H1 headings</dt>
                            <dd className="text-sm">{p.h1Count}</dd>
                          </div>
                        </dl>
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primary hover:underline">
                          Open page <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
