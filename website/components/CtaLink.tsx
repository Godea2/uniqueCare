import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Link for CMS-supplied CTAs. Internal paths use next/link; `tel:`, `mailto:`,
 * and absolute URLs render as plain anchors (external ones open in a new tab).
 */
export default function CtaLink({
  href,
  className,
  children,
  ariaLabel,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link href={href} className={className} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  const external = /^https?:\/\//i.test(href);
  return (
    <a
      href={href}
      className={className}
      aria-label={ariaLabel}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}
