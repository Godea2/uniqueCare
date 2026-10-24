import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";
import { posts } from "@/content/posts";
import { site } from "@/content/site";
import BlogFilter from "@/components/BlogFilter";

export const metadata: Metadata = {
  title: "Home Care Blog | Advice, Guides & Company News | Unique Care UK",
  description:
    "Read our latest articles on home care advice, choosing the right care provider, and news from Unique Care UK. Expert insights for families across London and Hertfordshire.",
  alternates: { canonical: "/blog" },
};

export default function BlogPage() {
  return (
    <div className="mx-auto max-w-content px-4 pb-16 pt-12 md:pb-20">
      <p className="eyebrow">Blog</p>
      <h1 className="mt-2 font-heading text-4xl font-semibold text-ink md:text-5xl">Blog &amp; News</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-muted">
        Care advice, company updates, and insights from the Unique Care UK team.
      </p>

      <div className="mt-8">
        <BlogFilter posts={posts} />
      </div>

      <div className="mt-14 rounded-card border border-line bg-brand-soft p-8 text-center">
        <h2 className="font-heading text-2xl font-semibold text-ink">Need care advice?</h2>
        <p className="mx-auto mt-2 max-w-xl text-ink-muted">
          Our team is here to help. Get in touch for a free, no-obligation care assessment.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 font-semibold text-white transition hover:bg-brand-primary-dark"
          >
            Book a free assessment <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <a
            href={site.phonePrimaryTel}
            className="inline-flex items-center gap-2 rounded-full border-2 border-brand-primary px-6 py-3 font-semibold text-brand-primary transition hover:bg-white"
          >
            <Phone className="h-4 w-4" aria-hidden /> Call us now
          </a>
        </div>
      </div>
    </div>
  );
}
