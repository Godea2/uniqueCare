"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Gauge, Loader2, Plus, Trash2, XCircle } from "lucide-react";
import { adminFetch, errorMessage, fmtDate } from "@/lib/admin/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { useAdminList } from "@/components/admin/useAdminList";
import {
  ConfirmDialog, EmptyState, ErrorBlock, LoadingBlock, PageHeader, ShowMore, StatusBadge, Tabs,
  btnDangerGhost, btnGhost, btnPrimary, btnSm, card,
} from "@/components/admin/ui";

type Overview = {
  base: string;
  https: boolean;
  robotsTxt: { ok: boolean; status: number | null; referencesSitemap: boolean };
  sitemapXml: { ok: boolean; status: number | null; urlCount: number };
  backlinks: { total: number; pending: number; acquired: number };
  directories: { name: string; domain: string; url: string; why: string; listed: boolean; tracked: boolean }[];
};

type Backlink = {
  id: number;
  domain: string;
  url: string | null;
  notes: string | null;
  status: "pending" | "acquired";
  createdAt: string;
};

type Speed = {
  url: string;
  strategy: "mobile" | "desktop";
  stubbed: boolean;
  message: string | null;
  scores: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null };
  metrics: { fcp: string | null; lcp: string | null; tbt: string | null; cls: string | null; speedIndex: string | null } | null;
  fetchedAt: string;
};

const SPEED_PAGES = [
  { path: "/", label: "Home" },
  { path: "/services", label: "Services" },
  { path: "/areas", label: "Areas" },
  { path: "/careers/jobs", label: "Jobs" },
  { path: "/blog", label: "Blog" },
  { path: "/contact", label: "Contact" },
];

function Check({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-3">
      {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />}
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {detail && <p className="text-xs text-slate-500">{detail}</p>}
      </div>
    </div>
  );
}

function ScoreRing({ label, value }: { label: string; value: number | null }) {
  const tone =
    value == null ? "text-slate-400 border-slate-200 dark:border-slate-700"
    : value >= 90 ? "text-emerald-600 border-emerald-500"
    : value >= 50 ? "text-amber-600 border-amber-500"
    : "text-red-600 border-red-500";
  return (
    <div className="text-center">
      <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 text-xl font-bold ${tone}`}>
        {value ?? "—"}
      </div>
      <p className="mt-1.5 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

export default function OffPageSeoPage() {
  const toast = useAdminToast();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await adminFetch<Overview>("/api/admin/seo/offpage"));
      setOverviewError(null);
    } catch (e) {
      setOverviewError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  /* PageSpeed */
  const [speedPath, setSpeedPath] = useState("/");
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [speed, setSpeed] = useState<Speed | null>(null);
  const [speedBusy, setSpeedBusy] = useState(false);

  async function runSpeed() {
    setSpeedBusy(true);
    try {
      const r = await adminFetch<Speed>(`/api/admin/seo/offpage/pagespeed?path=${encodeURIComponent(speedPath)}&strategy=${strategy}`);
      setSpeed(r);
      if (!r.stubbed) toast.push("ok", "PageSpeed results updated");
    } catch (e) {
      toast.push("err", errorMessage(e));
    } finally {
      setSpeedBusy(false);
    }
  }

  /* Backlinks */
  const [tab, setTab] = useState("all");
  const list = useAdminList<Backlink>("/api/admin/seo/offpage/backlinks", { status: tab, pageSize: 20 });
  const [domain, setDomain] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<Backlink | null>(null);

  async function addBacklink(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      await adminFetch("/api/admin/seo/offpage/backlinks", {
        method: "POST",
        body: JSON.stringify({ domain, url, notes, status: "pending" }),
      });
      toast.push("ok", "Backlink added");
      setDomain("");
      setUrl("");
      setNotes("");
      await Promise.all([list.reload(), loadOverview()]);
    } catch (err) {
      toast.push("err", errorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  async function setStatus(b: Backlink, status: Backlink["status"]) {
    setBusyId(b.id);
    try {
      await adminFetch(`/api/admin/seo/offpage/backlinks?id=${b.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast.push("ok", status === "acquired" ? "Marked as acquired" : "Marked as pending");
      await Promise.all([list.reload(), loadOverview()]);
    } catch (err) {
      toast.push("err", errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    try {
      await adminFetch(`/api/admin/seo/offpage/backlinks?id=${toDelete.id}`, { method: "DELETE" });
      toast.push("ok", "Backlink deleted");
      setToDelete(null);
      await Promise.all([list.reload(), loadOverview()]);
    } catch (err) {
      toast.push("err", errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const c = list.counts;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Off-page SEO"
        description="Technical health checks, page speed and the backlinks and listings that build your site's authority."
        actions={<Link href="/admin/seo" className={btnGhost}>On-page SEO</Link>}
      />

      {/* Technical */}
      <section aria-labelledby="tech-h">
        <h2 id="tech-h" className="mb-3 font-heading text-lg font-semibold">Technical signals</h2>
        {overviewError && <ErrorBlock message={overviewError} onRetry={loadOverview} />}
        {!overview && !overviewError && <LoadingBlock />}
        {overview && (
          <div className={`${card} grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4`}>
            <Check ok={overview.https} label="HTTPS" detail={overview.base} />
            <Check
              ok={overview.robotsTxt.ok}
              label="robots.txt"
              detail={overview.robotsTxt.ok ? (overview.robotsTxt.referencesSitemap ? "Found · references sitemap" : "Found · no sitemap reference") : `Not reachable (${overview.robotsTxt.status ?? "no response"})`}
            />
            <Check
              ok={overview.sitemapXml.ok}
              label="sitemap.xml"
              detail={overview.sitemapXml.ok ? `${overview.sitemapXml.urlCount} URLs listed` : `Not reachable (${overview.sitemapXml.status ?? "no response"})`}
            />
            <Check
              ok={overview.backlinks.acquired > 0}
              label="Backlinks tracked"
              detail={`${overview.backlinks.acquired} acquired · ${overview.backlinks.pending} pending`}
            />
          </div>
        )}
      </section>

      {/* PageSpeed */}
      <section aria-labelledby="speed-h">
        <h2 id="speed-h" className="mb-3 font-heading text-lg font-semibold">Page speed</h2>
        <div className={`${card} p-5`}>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="speed-page" className="admin-label">Page</label>
              <select id="speed-page" className="admin-input !w-auto" value={speedPath} onChange={(e) => setSpeedPath(e.target.value)}>
                {SPEED_PAGES.map((p) => <option key={p.path} value={p.path}>{p.label} ({p.path})</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="speed-strategy" className="admin-label">Device</label>
              <select id="speed-strategy" className="admin-input !w-auto" value={strategy} onChange={(e) => setStrategy(e.target.value as "mobile" | "desktop")}>
                <option value="mobile">Mobile</option>
                <option value="desktop">Desktop</option>
              </select>
            </div>
            <button type="button" className={btnPrimary} onClick={runSpeed} disabled={speedBusy}>
              {speedBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />} {speedBusy ? "Testing… (up to 60s)" : "Run test"}
            </button>
          </div>

          {speed && (
            <div className="mt-6">
              {speed.stubbed && (
                <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  {speed.message}
                </p>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <ScoreRing label="Performance" value={speed.scores.performance} />
                <ScoreRing label="Accessibility" value={speed.scores.accessibility} />
                <ScoreRing label="Best practices" value={speed.scores.bestPractices} />
                <ScoreRing label="SEO" value={speed.scores.seo} />
              </div>
              {speed.metrics && (
                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                  {([
                    ["First Contentful Paint", speed.metrics.fcp],
                    ["Largest Contentful Paint", speed.metrics.lcp],
                    ["Total Blocking Time", speed.metrics.tbt],
                    ["Cumulative Layout Shift", speed.metrics.cls],
                    ["Speed Index", speed.metrics.speedIndex],
                  ] as const).map(([k, v]) => (
                    <div key={k}>
                      <dt className="admin-label">{k}</dt>
                      <dd className="font-semibold">{v ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="mt-4 text-xs text-slate-500">{speed.url} · {speed.strategy}</p>
            </div>
          )}
        </div>
      </section>

      {/* Directories */}
      <section aria-labelledby="dir-h">
        <h2 id="dir-h" className="mb-3 font-heading text-lg font-semibold">Recommended listings</h2>
        {overview && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {overview.directories.map((d) => (
              <li key={d.domain} className={`${card} flex items-start gap-3 p-4`}>
                {d.listed ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-slate-300 dark:border-slate-600" />}
                <div className="min-w-0 flex-1">
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold hover:text-brand-primary">
                    {d.name} <ExternalLink className="h-3 w-3" />
                  </a>
                  <p className="text-xs text-slate-500">{d.why}</p>
                </div>
                {!d.tracked && (
                  <button type="button" className={`${btnGhost} ${btnSm}`} onClick={() => { setDomain(d.domain); setUrl(d.url); document.getElementById("bl-domain")?.focus(); }}>
                    Track
                  </button>
                )}
                {d.tracked && !d.listed && <StatusBadge status="pending" />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Backlinks */}
      <section aria-labelledby="bl-h">
        <h2 id="bl-h" className="mb-3 font-heading text-lg font-semibold">Backlink tracker</h2>
        <form onSubmit={addBacklink} className={`${card} mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.5fr_1.5fr_auto] lg:items-end`}>
          <div>
            <label htmlFor="bl-domain" className="admin-label">Domain</label>
            <input id="bl-domain" required className="admin-input" placeholder="example.co.uk" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <div>
            <label htmlFor="bl-url" className="admin-label">Link URL (optional)</label>
            <input id="bl-url" type="url" className="admin-input" placeholder="https://example.co.uk/directory/unique-care" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div>
            <label htmlFor="bl-notes" className="admin-label">Notes (optional)</label>
            <input id="bl-notes" className="admin-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button type="submit" disabled={adding} className={btnPrimary}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </button>
        </form>

        <div className="mb-4">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { key: "all", label: "All", count: c.all },
              { key: "pending", label: "Pending", count: c.pending },
              { key: "acquired", label: "Acquired", count: c.acquired },
            ]}
          />
        </div>

        {list.error && <div className="mb-4"><ErrorBlock message={list.error} onRetry={() => list.reload()} /></div>}
        {list.loading && list.items.length === 0 ? (
          <LoadingBlock />
        ) : list.items.length === 0 && !list.error ? (
          <EmptyState title="No backlinks tracked yet" description="Add the sites you've contacted or earned links from to track your progress." />
        ) : (
          <ul className="space-y-3">
            {list.items.map((b) => {
              const busy = busyId === b.id;
              return (
                <li key={b.id} className={`${card} flex flex-wrap items-center gap-3 p-4`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{b.domain}</span>
                      <StatusBadge status={b.status} />
                    </div>
                    {b.url && (
                      <a href={b.url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-xs text-brand-primary hover:underline">{b.url}</a>
                    )}
                    <p className="text-xs text-slate-500">{b.notes ? `${b.notes} · ` : ""}Added {fmtDate(b.createdAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    {b.status === "pending" ? (
                      <button type="button" disabled={busy} className={`${btnPrimary} ${btnSm}`} onClick={() => setStatus(b, "acquired")}>Mark acquired</button>
                    ) : (
                      <button type="button" disabled={busy} className={`${btnGhost} ${btnSm}`} onClick={() => setStatus(b, "pending")}>Mark pending</button>
                    )}
                    <button type="button" disabled={busy} className={`${btnDangerGhost} ${btnSm}`} onClick={() => setToDelete(b)} aria-label={`Delete ${b.domain}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <ShowMore hasMore={list.hasMore} loading={list.loadingMore} shown={list.items.length} total={list.total} onClick={list.loadMore} />
      </section>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this backlink?"
        message={<><strong>{toDelete?.domain}</strong> will be removed from the tracker.</>}
        busy={!!toDelete && busyId === toDelete.id}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
