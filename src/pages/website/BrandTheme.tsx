import { useState } from "react";
import type { ComponentProps, FormEvent, ReactNode } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { MediaField } from "./MediaPicker";

type Payload = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const HEX = /^#[0-9a-f]{6}$/i;

const THEME_FIELDS = [
  { key: "brandPrimary", label: "Brand primary", fallback: "#124b99" },
  { key: "brandPrimaryDark", label: "Brand primary (dark)", fallback: "#0c3875" },
  { key: "brandSecondary", label: "Brand secondary", fallback: "#0089ca" },
  { key: "brandSoft", label: "Brand soft background", fallback: "#eaf5fb" },
  { key: "brandInk", label: "Brand ink", fallback: "#0a2540" },
  { key: "brandGold", label: "Accent gold", fallback: "#d9a441" },
  { key: "ink", label: "Body text", fallback: "#1a1f24" },
  { key: "inkMuted", label: "Muted text", fallback: "#5b6670" },
  { key: "surface", label: "Surface", fallback: "#ffffff" },
  { key: "surfaceAlt", label: "Surface (alternate)", fallback: "#f7f8f7" },
  { key: "border", label: "Border", fallback: "#e3e7e6" },
  { key: "cqcGood", label: "CQC 'Good' colour", fallback: "#2e7d32" },
] as const;

const BRAND_FIELDS = [
  { key: "logoUrl", label: "Logo (horizontal)" },
  { key: "logoMarkUrl", label: "Logo mark" },
  { key: "faviconUrl", label: "Favicon" },
  { key: "ogImageUrl", label: "Social share image (Open Graph)" },
  { key: "appleTouchIconUrl", label: "Apple touch icon" },
] as const;

export default function BrandTheme() {
  const q = trpc.website.siteSettings.get.useQuery();
  return (
    <div>
      <PageHeader
        title="Brand & theme"
        subtitle="Colours, logos, default SEO, the call-to-action band and WhatsApp button shown across the public website."
      />
      {q.isLoading ? <Loading rows={6} />
        : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : q.data ? <BrandForm key={String(q.data.updatedAt)} payload={q.data.payload} updatedAt={q.data.updatedAt} /> : null}
    </div>
  );
}

function BrandForm({ payload, updatedAt }: { payload: Payload; updatedAt: string | null }) {
  const utils = trpc.useUtils();
  const theme = rec(payload.theme);
  const brand = rec(payload.brand);
  const seo = rec(payload.seo);
  const cta = rec(payload.ctaBand);
  const primary = rec(cta.primaryCta);
  const secondary = rec(cta.secondaryCta);

  const [colors, setColors] = useState<Record<string, string>>(
    () => Object.fromEntries(THEME_FIELDS.map((f) => [f.key, str(theme[f.key]) || f.fallback])),
  );
  const [assets, setAssets] = useState<Record<string, string>>(
    () => Object.fromEntries(BRAND_FIELDS.map((f) => [f.key, str(brand[f.key])])),
  );

  const [defaultTitle, setDefaultTitle] = useState(str(seo.defaultTitle));
  const [titleTemplate, setTitleTemplate] = useState(str(seo.titleTemplate));
  const [defaultDescription, setDefaultDescription] = useState(str(seo.defaultDescription));
  const [keywords, setKeywords] = useState(Array.isArray(seo.keywords) ? seo.keywords.map(String).join(", ") : str(seo.keywords));

  const [ctaTitle, setCtaTitle] = useState(str(cta.title));
  const [ctaText, setCtaText] = useState(str(cta.text));
  const [primaryLabel, setPrimaryLabel] = useState(str(primary.label));
  const [primaryHref, setPrimaryHref] = useState(str(primary.href));
  const [secondaryLabel, setSecondaryLabel] = useState(str(secondary.label));
  const [secondaryHref, setSecondaryHref] = useState(str(secondary.href));
  const [ctaImage, setCtaImage] = useState(str(cta.image));

  const [whatsappEnabled, setWhatsappEnabled] = useState(payload.whatsappEnabled !== false);

  const save = trpc.website.siteSettings.update.useMutation({
    onSuccess: () => { void utils.website.siteSettings.get.invalidate(); toast.success("Brand and theme saved"); },
    onError: (e) => toast.error(e.message),
  });

  const invalidColors = THEME_FIELDS.filter((f) => !HEX.test(colors[f.key]?.trim() ?? ""));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (invalidColors.length > 0) {
      toast.error(`Use 6-digit hex colours (e.g. #124b99): ${invalidColors.map((f) => f.label).join(", ")}`);
      return;
    }
    const cleanPrimary = { ...primary, label: primaryLabel.trim(), href: primaryHref.trim() };
    const cleanSecondary = { ...secondary, label: secondaryLabel.trim(), href: secondaryHref.trim() };
    const next: Payload = {
      // Preserve every key this form does not manage.
      ...payload,
      theme: { ...theme, ...Object.fromEntries(THEME_FIELDS.map((f) => [f.key, colors[f.key].trim().toLowerCase()])) },
      brand: { ...brand, ...Object.fromEntries(BRAND_FIELDS.map((f) => [f.key, assets[f.key].trim()])) },
      seo: {
        ...seo,
        defaultTitle: defaultTitle.trim(),
        titleTemplate: titleTemplate.trim(),
        defaultDescription: defaultDescription.trim(),
        keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
      },
      ctaBand: {
        ...cta,
        title: ctaTitle.trim(),
        text: ctaText.trim(),
        primaryCta: cleanPrimary,
        secondaryCta: cleanSecondary,
        image: ctaImage.trim(),
      },
      whatsappEnabled,
    };
    save.mutate({ payload: next });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Section title="Theme colours" description="Hex colours applied across the public website.">
        {THEME_FIELDS.map((f) => (
          <ColorField
            key={f.key}
            id={`theme-${f.key}`}
            label={f.label}
            value={colors[f.key] ?? ""}
            fallback={f.fallback}
            onChange={(v) => setColors((c) => ({ ...c, [f.key]: v }))}
          />
        ))}
      </Section>

      <Section title="Logos and icons" description="Pick from the media library, upload a new file, or paste a URL.">
        {BRAND_FIELDS.map((f) => (
          <MediaField
            key={f.key}
            id={`brand-${f.key}`}
            label={f.label}
            kindFilter="image"
            value={assets[f.key] ?? ""}
            onChange={(v) => setAssets((a) => ({ ...a, [f.key]: v }))}
          />
        ))}
      </Section>

      <Section title="Default SEO" description="Used by pages that do not set their own title or description.">
        <Field id="seo-title" label="Default title" value={defaultTitle} onChange={setDefaultTitle} maxLength={200} />
        <Field id="seo-template" label="Title template" value={titleTemplate} onChange={setTitleTemplate} placeholder="%s | Unique Care UK" hint="%s is replaced with the page title." maxLength={200} />
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="seo-desc">Default description</Label>
          <Textarea id="seo-desc" value={defaultDescription} onChange={(e) => setDefaultDescription(e.target.value)} rows={3} maxLength={400} />
        </div>
        <Field id="seo-keywords" label="Keywords" value={keywords} onChange={setKeywords} placeholder="home care, live-in care, London" hint="Comma-separated." maxLength={600} className="sm:col-span-2" />
      </Section>

      <Section title="Call-to-action band" description="The banner shown above the footer on most pages.">
        <Field id="cta-title" label="Title" value={ctaTitle} onChange={setCtaTitle} maxLength={160} />
        <MediaField id="cta-image" label="Background image" kindFilter="image" value={ctaImage} onChange={setCtaImage} />
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="cta-text">Text</Label>
          <Textarea id="cta-text" value={ctaText} onChange={(e) => setCtaText(e.target.value)} rows={2} maxLength={400} />
        </div>
        <Field id="cta-p-label" label="Primary button label" value={primaryLabel} onChange={setPrimaryLabel} maxLength={80} />
        <Field id="cta-p-href" label="Primary button link" value={primaryHref} onChange={setPrimaryHref} placeholder="/contact" maxLength={500} />
        <Field id="cta-s-label" label="Secondary button label" value={secondaryLabel} onChange={setSecondaryLabel} maxLength={80} />
        <Field id="cta-s-href" label="Secondary button link" value={secondaryHref} onChange={setSecondaryHref} placeholder="tel:+442039170260" maxLength={500} />
      </Section>

      <Section title="Chat">
        <div className="flex items-start gap-2 sm:col-span-2">
          <Checkbox id="wa-enabled" checked={whatsappEnabled} onCheckedChange={(v) => setWhatsappEnabled(v === true)} className="mt-0.5" />
          <div>
            <Label htmlFor="wa-enabled">Show the floating WhatsApp button</Label>
            <p className="text-[11px] text-muted-foreground">The WhatsApp number is set under Settings.</p>
          </div>
        </div>
      </Section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{updatedAt ? `Last saved ${fmtDateTime(updatedAt)}` : "Not saved yet. The website is using its built-in defaults."}</p>
        <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save brand & theme"}</Button>
      </div>
    </form>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="uc-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-[--brand-900]">{title}</h2>
      {description && <p className="mb-3 text-xs text-muted-foreground">{description}</p>}
      <div className={description ? "grid gap-3 sm:grid-cols-2" : "mt-3 grid gap-3 sm:grid-cols-2"}>{children}</div>
    </section>
  );
}

function Field({
  id, label, value, onChange, hint, className, ...rest
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; className?: string;
} & Omit<ComponentProps<typeof Input>, "id" | "value" | "onChange" | "className">) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : "space-y-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ColorField({
  id, label, value, fallback, onChange,
}: { id: string; label: string; value: string; fallback: string; onChange: (v: string) => void }) {
  const valid = HEX.test(value.trim());
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={valid ? value.trim().toLowerCase() : fallback}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-white p-1"
          style={{ borderColor: "var(--line)" }}
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fallback}
          maxLength={7}
          aria-invalid={!valid}
          className="font-mono text-sm"
        />
        <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0" aria-label={`Reset ${label} to default`} onClick={() => onChange(fallback)}>
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
      {!valid && <p role="alert" className="text-[11px] text-red-600">Use a 6-digit hex colour, e.g. {fallback}.</p>}
    </div>
  );
}
