import Link from "next/link";
import Image from "next/image";
import { Facebook, Instagram, Linkedin, Mail, MapPin, Phone } from "lucide-react";
import { services } from "@/content/services";
import { areas } from "@/content/areas";
import { adminPortalUrl, site } from "@/content/site";
import SubscribeForm from "@/components/forms/SubscribeForm";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-brand-primary-dark text-white/85">
      <div className="mx-auto grid max-w-content gap-10 px-4 py-14 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Image
            src="/images/logo-horizontal.png"
            alt="Unique Care UK"
            width={340}
            height={96}
            className="h-12 w-auto rounded-md bg-white/95 p-1.5"
          />
          <p className="mt-4 text-sm leading-relaxed">
            ISO 9001 &amp; ISO 45001 certified home care provider. Compassionate, personalised care across
            London, Essex, and Hertfordshire since 2017.
          </p>
          <p className="mt-4 flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden /> {site.footerLocation}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            <a href={site.phonePrimaryTel} className="hover:underline">{site.phonePrimary}</a>
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 shrink-0" aria-hidden />
            <a href={`mailto:${site.email}`} className="hover:underline">{site.email}</a>
          </p>
          <div className="mt-4 flex gap-3">
            <a href={site.social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Unique Care UK on Facebook"
               className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
              <Facebook className="h-5 w-5" aria-hidden />
            </a>
            <a href={site.social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Unique Care UK on Instagram"
               className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
              <Instagram className="h-5 w-5" aria-hidden />
            </a>
            <a href={site.social.linkedin} target="_blank" rel="noopener noreferrer" aria-label="Unique Care UK on LinkedIn"
               className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
              <Linkedin className="h-5 w-5" aria-hidden />
            </a>
          </div>
        </div>

        <nav aria-label="Services">
          <h2 className="font-heading text-lg font-semibold text-white">Services</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {services.map((s) => (
              <li key={s.slug}>
                <Link href={`/services/${s.slug}`} className="hover:text-white hover:underline">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Areas">
          <h2 className="font-heading text-lg font-semibold text-white">Areas</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {areas.map((a) => (
              <li key={a.slug}>
                <Link href={`/areas/${a.slug}`} className="hover:text-white hover:underline">
                  {a.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Company">
          <h2 className="font-heading text-lg font-semibold text-white">Company</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link href="/about" className="hover:text-white hover:underline">About us</Link></li>
            <li><Link href="/reviews" className="hover:text-white hover:underline">Reviews</Link></li>
            <li><Link href="/careers" className="hover:text-white hover:underline">Careers</Link></li>
            <li><Link href="/blog" className="hover:text-white hover:underline">Blog &amp; news</Link></li>
            <li><Link href="/contact" className="hover:text-white hover:underline">Contact</Link></li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-4 px-4 py-6">
          <div>
            <h2 className="font-heading text-lg font-semibold text-white">Stay in the loop</h2>
            <p className="text-sm text-white/75">Care advice and company news, straight to your inbox.</p>
          </div>
          <SubscribeForm tone="dark" />
        </div>
      </div>

      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-5 gap-y-2 px-4 py-5 text-xs text-white/70">
          <span>© {year} {site.legalName}. All rights reserved.</span>
          <Link href="/privacy" className="hover:text-white hover:underline">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-white hover:underline">Terms of Service</Link>
          <Link href="/modern-slavery" className="hover:text-white hover:underline">Modern Slavery Statement</Link>
          <Link href="/carbon-reduction-plan" className="hover:text-white hover:underline">Carbon Reduction Plan</Link>
          <a href={adminPortalUrl || "#"} rel="nofollow" className="hover:text-white hover:underline">
            Admin portal
          </a>
          <span className="ml-auto">VAT: {site.vat}</span>
        </div>
      </div>
    </footer>
  );
}
