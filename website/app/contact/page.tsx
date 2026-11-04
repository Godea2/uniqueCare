import type { Metadata } from "next";
import { Suspense } from "react";
import { Clock3, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import EnquiryForm from "@/components/forms/EnquiryForm";
import { getSiteSettings } from "@/lib/site-source";
import { getBranches, branchMapsUrl } from "@/lib/branches-source";
import { asString, getSectionMap } from "@/lib/sections-source";

export const metadata: Metadata = {
  title: "Contact Us | Book a Free Care Assessment | Unique Care UK",
  description:
    "Get in touch with Unique Care UK for a free, no-obligation care assessment. Call 02039170260 or send us an enquiry online. Home care across London and Hertfordshire.",
  alternates: { canonical: "/contact" },
};

export const revalidate = 60;

export default async function ContactPage() {
  const [site, branches, sections] = await Promise.all([getSiteSettings(), getBranches(), getSectionMap("contact")]);
  const heroS = sections.hero ?? null;
  const formS = sections.form_intro ?? null;
  const heroEyebrow = asString(heroS, "eyebrow", "");
  return (
    <div className="mx-auto max-w-content px-4 pb-16 pt-12 md:pb-20">
      {heroEyebrow && <p className="eyebrow fade-up">{heroEyebrow}</p>}
      <h1 className="fade-up font-heading text-4xl font-semibold text-ink md:text-5xl">
        {asString(heroS, "title", "Contact Us")}
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-muted">
        {asString(heroS, "subtitle", "Send us a message and we will get back to you as soon as possible.")}
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        {/* Contact information */}
        <section aria-labelledby="contact-info-h" className="fade-up">
          <h2 id="contact-info-h" className="font-heading text-2xl font-semibold text-ink">
            Contact Information
          </h2>
          <p className="mt-3 text-ink-muted">
            Reach out to us through any of the channels below, or fill in the form and we&apos;ll get back to
            you as soon as possible.
          </p>

          <ul className="mt-6 space-y-5">
            <li className="flex gap-3">
              <span className="uc-icon-3d h-11 w-11 shrink-0">
                <Phone className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h3 className="font-semibold text-ink">Phone</h3>
                <p className="text-ink-muted">
                  <a href={site.phonePrimaryTel} className="hover:text-brand-primary hover:underline">
                    {site.phonePrimary}
                  </a>
                  {" / "}
                  <a href={site.phoneMobileTel} className="hover:text-brand-primary hover:underline">
                    {site.phoneMobile}
                  </a>
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="uc-icon-3d h-11 w-11 shrink-0">
                <Mail className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h3 className="font-semibold text-ink">Email</h3>
                <p>
                  <a href={`mailto:${site.email}`} className="text-ink-muted hover:text-brand-primary hover:underline">
                    {site.email}
                  </a>
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="uc-icon-3d h-11 w-11 shrink-0">
                <Clock3 className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h3 className="font-semibold text-ink">Business Hours</h3>
                <p className="text-ink-muted">{site.hours}</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="uc-icon-3d h-11 w-11 shrink-0">
                <MapPin className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h3 className="font-semibold text-ink">Our Offices</h3>
                {branches.map((o) => (
                  <div key={o.id} className="mt-2">
                    <p className="text-ink-muted">
                      <strong className="text-ink">{o.name}:</strong> {o.address}
                    </p>
                    {(o.phone || o.email || o.hours) && (
                      <p className="text-sm text-ink-muted">
                        {o.phone && (
                          <a href={`tel:${o.phone.replace(/\s+/g, "")}`} className="hover:text-brand-primary hover:underline">
                            {o.phoneDisplay || o.phone}
                          </a>
                        )}
                        {o.phone && (o.email || o.hours) && " · "}
                        {o.email && (
                          <a href={`mailto:${o.email}`} className="hover:text-brand-primary hover:underline">
                            {o.email}
                          </a>
                        )}
                        {o.email && o.hours && " · "}
                        {o.hours}
                      </p>
                    )}
                    <a
                      href={branchMapsUrl(o)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-sm font-semibold text-brand-primary hover:underline"
                    >
                      Get directions <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  </div>
                ))}
              </div>
            </li>
          </ul>
        </section>

        {/* Form */}
        <section aria-labelledby="contact-form-h" id="contact-form" className="fade-up" data-stagger="1">
          <h2 id="contact-form-h" className="font-heading text-2xl font-semibold text-ink">
            {asString(formS, "title", "Send us a message")}
          </h2>
          <p className="mt-3 text-ink-muted">
            {asString(formS, "text", "Fill in the form below and our team will respond promptly.")}
          </p>
          <div className="mt-6 rounded-card border border-line bg-white p-6 shadow-card md:p-8">
            <Suspense>
              <EnquiryForm phoneDisplay={site.phonePrimaryDisplay} phoneTel={site.phonePrimaryTel} />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}
