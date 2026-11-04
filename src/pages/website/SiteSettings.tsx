import { useState } from "react";
import type { ComponentProps, FormEvent, ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Payload = Record<string, unknown>;
type Office = { name: string; address: string };

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Keep digits and a leading + only, e.g. "020 3917 0260" ? "02039170260". */
const digits = (v: string) => v.replace(/[^\d+]/g, "");
/** UK local number ? tel: link (07958 367038 ? tel:+447958367038). */
const toTel = (v: string) => {
  const d = digits(v);
  if (!d) return "";
  if (d.startsWith("+")) return `tel:${d}`;
  if (d.startsWith("0")) return `tel:+44${d.slice(1)}`;
  return `tel:+${d}`;
};
/** UK local number ? WhatsApp link. */
const toWhatsapp = (v: string) => {
  const d = digits(v).replace(/^\+/, "");
  if (!d) return "";
  return `https://wa.me/${d.startsWith("0") ? `44${d.slice(1)}` : d}`;
};

export default function SiteSettings() {
  const q = trpc.website.siteSettings.get.useQuery();

  return (
    <div>
      <PageHeader
        title="Site settings"
        subtitle="Contact details, footer text, CQC information and social links shown across the public website."
      />
      {q.isLoading ? <Loading rows={6} />
        : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : q.data ? <SettingsForm key={String(q.data.updatedAt)} payload={q.data.payload} updatedAt={q.data.updatedAt} /> : null}
    </div>
  );
}

function SettingsForm({ payload, updatedAt }: { payload: Payload; updatedAt: string | null }) {
  const utils = trpc.useUtils();
  const social = rec(payload.social);

  const [name, setName] = useState(str(payload.name));
  const [legalName, setLegalName] = useState(str(payload.legalName));
  const [url, setUrl] = useState(str(payload.url));
  const [vat, setVat] = useState(str(payload.vat));
  const [founded, setFounded] = useState(str(payload.founded));

  const [email, setEmail] = useState(str(payload.email));
  const [phonePrimaryDisplay, setPhonePrimaryDisplay] = useState(str(payload.phonePrimaryDisplay) || str(payload.phonePrimary));
  const [phoneMobileDisplay, setPhoneMobileDisplay] = useState(str(payload.phoneMobileDisplay) || str(payload.phoneMobile));
  const [whatsapp, setWhatsapp] = useState(str(payload.whatsapp));
  const [hours, setHours] = useState(str(payload.hours));

  const [footerLocation, setFooterLocation] = useState(str(payload.footerLocation));
  const [footerBlurb, setFooterBlurb] = useState(str(payload.footerBlurb));
  const [areas, setAreas] = useState(Array.isArray(payload.areas) ? payload.areas.map(String).join(", ") : "");

  const [cqcRating, setCqcRating] = useState(str(payload.cqcRating));
  const [cqcReportUrl, setCqcReportUrl] = useState(str(payload.cqcReportUrl));

  const [offices, setOffices] = useState<Office[]>(
    Array.isArray(payload.offices)
      ? payload.offices.map((o) => ({ name: str(rec(o).name), address: str(rec(o).address) }))
      : [],
  );

  const [facebook, setFacebook] = useState(str(social.facebook));
  const [instagram, setInstagram] = useState(str(social.instagram));
  const [linkedin, setLinkedin] = useState(str(social.linkedin));

  const save = trpc.website.siteSettings.update.useMutation({
    onSuccess: () => { void utils.website.siteSettings.get.invalidate(); toast.success("Site settings saved"); },
    onError: (e) => toast.error(e.message),
  });

  const setOffice = (i: number, patch: Partial<Office>) =>
    setOffices((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const foundedNum = Number(founded);
    const next: Payload = {
      // Preserve any keys this form doesn't manage.
      ...payload,
      name: name.trim(),
      legalName: legalName.trim(),
      url: url.trim(),
      vat: vat.trim(),
      ...(founded.trim() && Number.isFinite(foundedNum) ? { founded: Math.round(foundedNum) } : {}),
      email: email.trim(),
      phonePrimary: digits(phonePrimaryDisplay),
      phonePrimaryDisplay: phonePrimaryDisplay.trim(),
      phonePrimaryTel: toTel(phonePrimaryDisplay),
      phoneMobile: digits(phoneMobileDisplay),
      phoneMobileDisplay: phoneMobileDisplay.trim(),
      phoneMobileTel: toTel(phoneMobileDisplay),
      whatsapp: whatsapp.trim(),
      hours: hours.trim(),
      offices: offices
        .map((o) => ({ name: o.name.trim(), address: o.address.trim() }))
        .filter((o) => o.name && o.address),
      footerLocation: footerLocation.trim(),
      footerBlurb: footerBlurb.trim(),
      cqcRating: cqcRating.trim(),
      cqcReportUrl: cqcReportUrl.trim(),
      social: { ...social, facebook: facebook.trim(), instagram: instagram.trim(), linkedin: linkedin.trim() },
      areas: areas.split(",").map((a) => a.trim()).filter(Boolean),
    };
    save.mutate({ payload: next });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Section title="Company">
        <Field id="ss-name" label="Brand name" value={name} onChange={setName} maxLength={120} />
        <Field id="ss-legal" label="Legal name" value={legalName} onChange={setLegalName} maxLength={160} />
        <Field id="ss-url" label="Website URL" value={url} onChange={setUrl} placeholder="https://uniquecareuk.com" maxLength={300} />
        <Field id="ss-vat" label="VAT number" value={vat} onChange={setVat} maxLength={40} />
        <Field id="ss-founded" label="Year founded" value={founded} onChange={setFounded} inputMode="numeric" maxLength={4} />
      </Section>

      <Section title="Contact">
        <Field id="ss-email" label="Email" type="email" value={email} onChange={setEmail} maxLength={200} />
        <Field id="ss-phone1" label="Main phone" value={phonePrimaryDisplay} onChange={setPhonePrimaryDisplay} placeholder="020 3917 0260" hint="Call link is generated automatically." maxLength={40} />
        <Field id="ss-phone2" label="Mobile phone" value={phoneMobileDisplay} onChange={setPhoneMobileDisplay} placeholder="07958 367038" hint="Call link is generated automatically." maxLength={40} />
        <div className="space-y-1.5">
          <Label htmlFor="ss-wa">WhatsApp link</Label>
          <div className="flex gap-2">
            <Input id="ss-wa" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="https://wa.me/447958367038" maxLength={300} />
            <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setWhatsapp(toWhatsapp(phoneMobileDisplay))} disabled={!phoneMobileDisplay.trim()}>
              From mobile
            </Button>
          </div>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ss-hours">Opening hours</Label>
          <Input id="ss-hours" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Mon–Fri: 9am–5pm | Sat–Sun: 24-hour services" maxLength={300} />
        </div>
      </Section>

      <Section title="Offices">
        <div className="space-y-3 sm:col-span-2">
          {offices.length === 0 && <p className="text-sm text-muted-foreground">No offices listed.</p>}
          {offices.map((o, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[14rem_1fr_auto]">
              <Input aria-label={`Office ${i + 1} name`} value={o.name} onChange={(e) => setOffice(i, { name: e.target.value })} placeholder="London Branch" maxLength={120} />
              <Input aria-label={`Office ${i + 1} address`} value={o.address} onChange={(e) => setOffice(i, { address: e.target.value })} placeholder="Full address" maxLength={300} />
              <Button type="button" variant="ghost" size="sm" aria-label={`Remove office ${i + 1}`} onClick={() => setOffices((rows) => rows.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setOffices((rows) => [...rows, { name: "", address: "" }])}>
            <Plus className="mr-1 h-3.5 w-3.5" />Add office
          </Button>
        </div>
      </Section>

      <Section title="Footer & coverage">
        <Field id="ss-footloc" label="Footer location" value={footerLocation} onChange={setFooterLocation} placeholder="London & Essex" maxLength={120} />
        <Field id="ss-areas" label="Areas covered" value={areas} onChange={setAreas} placeholder="London, Essex, Hertfordshire" hint="Comma-separated." maxLength={300} />
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ss-blurb">Footer blurb</Label>
          <Textarea id="ss-blurb" value={footerBlurb} onChange={(e) => setFooterBlurb(e.target.value)} rows={3} maxLength={600} />
        </div>
      </Section>

      <Section title="CQC">
        <Field id="ss-cqc" label="CQC rating" value={cqcRating} onChange={setCqcRating} placeholder="Good" maxLength={40} />
        <Field id="ss-cqcurl" label="CQC report URL" value={cqcReportUrl} onChange={setCqcReportUrl} placeholder="https://www.cqc.org.uk/location/…" maxLength={500} />
      </Section>

      <Section title="Social links">
        <Field id="ss-fb" label="Facebook" value={facebook} onChange={setFacebook} placeholder="https://facebook.com/…" maxLength={500} />
        <Field id="ss-ig" label="Instagram" value={instagram} onChange={setInstagram} placeholder="https://instagram.com/…" maxLength={500} />
        <Field id="ss-li" label="LinkedIn" value={linkedin} onChange={setLinkedin} placeholder="https://linkedin.com/company/…" maxLength={500} />
      </Section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{updatedAt ? `Last saved ${fmtDateTime(updatedAt)}` : "Not saved yet — the website is using its built-in defaults."}</p>
        <Button type="submit" disabled={save.isPending || name.trim().length < 2}>{save.isPending ? "Saving…" : "Save settings"}</Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="uc-card p-4 sm:p-5">
      <h2 className="mb-3 text-sm font-semibold text-[--brand-900]">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  id, label, value, onChange, hint, ...rest
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; hint?: string;
} & Omit<ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
