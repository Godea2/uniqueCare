import type { Metadata } from "next";
import Link from "next/link";
import { Phone } from "lucide-react";
import { getAllPosts } from "@/lib/posts-source";
import { site } from "@/content/site";
import BlogFilter from "@/components/BlogFilter";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Home Care Blog | Advice, Guides & Company News | Unique Care UK",
  description:
    "Read our latest articles on home care advice, choosing the right care provider, and news from Unique Care UK. Expert insights for families across London and Hertfordshire.",
  alternates: { canonical: "/blog" },
};

export default async function BlogPage() {
  const posts = await getAllPosts();
  return (
    <div className="mx-auto max-w-content px-4 pb-16 pt-12 md:pb-20">
      <div className="fade-up">
        <p className="eyebrow">Blog</p>
        <h1 className="mt-2 font-heading text-4xl font-semibold text-ink md:text-5xl">Blog &amp; News</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-muted">
          Care advice, company updates, and insights from the Unique Care UK team.
        </p>
      </div>

      <div className="mt-8">
        <BlogFilter posts={posts} />
      </div>

      <div className="fade-up mt-14 rounded-card border border-line bg-brand-soft p-8 text-center">
        <h2 className="font-heading text-2xl font-semibold text-ink">Need care advice?</h2>
        <p className="mx-auto mt-2 max-w-xl text-ink-muted">
          Our team is here to help. Get in touch for a free, no-obligation care assessment.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link href="/contact" aria-label="Book a free assessment" className="uc-btn-primary">
            Book a free assessment
          </Link>
          <a
            href={site.phonePrimaryTel}
            className="inline-flex items-center gap-2 rounded-full border-2 border-brand-primary px-6 py-3 font-semibold text-brand-primary transition hover:bg-white"
          >
            <Phone className="h-4 w-4" aria-hidden /> {site.phonePrimaryDisplay}
          </a>
        </div>
      </div>
    </div>
  );
}
