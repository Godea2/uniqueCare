import type { Metadata } from "next";
import { Download } from "lucide-react";
import LegalPage from "@/components/LegalPage";
import {
  carbonAfterEmissionsSections,
  carbonInfo,
  carbonIntroSections,
  carbonScopes,
  carbonTotal,
} from "@/content/legal/carbon";
import type { LegalSection } from "@/content/legal/privacy";

export const metadata: Metadata = {
  title: "Carbon Reduction Plan | Our Commitment to Net Zero by 2030 | Unique Care UK",
  description:
    "Unique Care UK's Carbon Reduction Plan, published in accordance with PPN 06/21. Read our baseline emissions, reduction targets, and the initiatives driving us to Net Zero by 2030.",
  alternates: { canonical: "/carbon-reduction-plan" },
};

const emissionsSection: LegalSection = {
  id: "baseline-year-emissions",
  title: "3. Baseline Year Emissions",
  blocks: [],
};

const sections: LegalSection[] = [...carbonIntroSections, emissionsSection, ...carbonAfterEmissionsSections];

function EmissionsTable() {
  const max = Math.max(...carbonScopes.map((s) => s.value));
  return (
    <div className="not-prose mt-2">
      <table className="w-full overflow-hidden rounded-card border border-line bg-white text-left shadow-card">
        <caption className="sr-only">Baseline year emissions by scope (tCO2e)</caption>
        <thead>
          <tr className="border-b border-line bg-brand-soft">
            <th scope="col" className="px-5 py-3 text-sm font-semibold text-ink">Scope</th>
            <th scope="col" className="px-5 py-3 text-right text-sm font-semibold text-ink">Emissions (tCO2e)</th>
          </tr>
        </thead>
        <tbody>
          {carbonScopes.map((s) => (
            <tr key={s.label} className="border-b border-line last:border-0">
              <th scope="row" className="px-5 py-3 font-medium text-ink">{s.label}</th>
              <td className="px-5 py-3 text-right text-ink-muted">{s.value}</td>
            </tr>
          ))}
          <tr className="bg-brand-soft">
            <th scope="row" className="px-5 py-3 font-semibold text-ink">Total</th>
            <td className="px-5 py-3 text-right font-semibold text-ink">{carbonTotal} tCO2e</td>
          </tr>
        </tbody>
      </table>

      <figure className="mt-6" aria-label="Bar chart of baseline emissions by scope">
        <div className="space-y-3">
          {carbonScopes.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-sm font-medium text-ink">{s.label}</span>
              <div
                role="img"
                aria-label={`${s.label}: ${s.value} tonnes of CO2 equivalent`}
                className="h-7 rounded-r-md bg-brand-primary"
                style={{ width: `${Math.max(8, (s.value / max) * 100)}%` }}
              />
              <span className="text-sm text-ink-muted" aria-hidden>{s.value}</span>
            </div>
          ))}
        </div>
        <figcaption className="mt-2 text-xs text-ink-muted">
          Baseline year 2022 emissions (tCO2e). Total: {carbonTotal} tCO2e.
        </figcaption>
      </figure>
    </div>
  );
}

export default function CarbonReductionPlanPage() {
  return (
    <>
      <div className="mx-auto max-w-content px-4 pt-10">
        <a
          href={carbonInfo.pdfPath}
          download
          className="inline-flex items-center gap-2 rounded-full border-2 border-brand-primary px-5 py-2.5 text-sm font-semibold text-brand-primary transition hover:bg-brand-soft"
        >
          <Download className="h-4 w-4" aria-hidden /> Download the signed PDF
        </a>
      </div>
      <LegalPage
        eyebrow="Sustainability"
        title="Carbon Reduction Plan"
        dateLine={`Publication date: ${carbonInfo.publicationDate}`}
        infoCard={[
          { label: "Supplier", value: carbonInfo.supplier },
          { label: "Baseline year", value: carbonInfo.baselineYear },
          { label: "Net Zero target", value: carbonInfo.netZeroTarget },
        ]}
        sections={sections}
        injectAfter={{ "baseline-year-emissions": <EmissionsTable /> }}
      />
    </>
  );
}
