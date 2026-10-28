"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Renders the public-site chrome (header, footer, CTA band, WhatsApp button)
 * around the page — but not on /admin, which has its own shell.
 */
export default function PublicChrome({
  header,
  footer,
  cta,
  floating,
  children,
}: {
  header: ReactNode;
  footer: ReactNode;
  cta: ReactNode;
  floating: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return <>{children}</>;
  }
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {header}
      <main id="main-content">{children}</main>
      {cta}
      {footer}
      {floating}
    </>
  );
}
