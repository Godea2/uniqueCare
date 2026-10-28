import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock3 } from "lucide-react";
import { readingTime } from "@/content/posts";
import { getAllPosts, getPostBySlug, getRelatedPosts, isRemoteImage } from "@/lib/posts-source";
import Breadcrumbs from "@/components/Breadcrumbs";
import ShareButtons from "@/components/ShareButtons";
import { Markdown } from "@/lib/markdown";
import { JsonLd, articleJsonLd } from "@/lib/jsonld";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await getPostBySlug(params.slug);
  if (!p) return {};
  return {
    title: `${p.title} | Unique Care UK Blog`,
    description: p.excerpt,
    alternates: { canonical: `/blog/${p.slug}` },
    openGraph: { type: "article", publishedTime: p.date, images: [{ url: p.image }] },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const p = await getPostBySlug(params.slug);
  if (!p) notFound();
  const related = await getRelatedPosts(p.slug);

  return (
    <>
      <JsonLd data={articleJsonLd(p)} />
      <Breadcrumbs items={[{ name: "Blog", url: "/blog" }, { name: p.title, url: `/blog/${p.slug}` }]} />

      <div className="mx-auto max-w-content px-4 pb-16 pt-6 md:pb-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <article>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-primary">
                {p.category}
              </span>
              <time dateTime={p.date} className="text-ink-muted">
                {p.dateLong}
              </time>
              <span className="flex items-center gap-1 text-ink-muted">
                <Clock3 className="h-3.5 w-3.5" aria-hidden /> {readingTime(p)} min read
              </span>
            </div>
            <h1 className="mt-4 font-heading text-4xl font-semibold leading-tight text-ink md:text-5xl">
              {p.title}
            </h1>
            <p className="mt-4 font-heading text-xl leading-relaxed text-ink-muted">{p.excerpt}</p>

            <Image
              src={p.image}
              alt={p.imageAlt}
              width={1200}
              height={750}
              priority
              unoptimized={isRemoteImage(p.image)}
              className="mt-8 w-full rounded-card object-cover shadow-card"
            />

            <Markdown text={p.body.join("\n\n")} className="prose-legal mt-8" />

            <div className="mt-8 border-t border-line pt-6">
              <ShareButtons title={p.title} slug={p.slug} />
            </div>

            <Link
              href="/blog"
              className="mt-8 inline-flex items-center gap-1.5 font-semibold text-brand-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to all posts
            </Link>
          </article>

          <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-card border border-line bg-brand-soft p-6">
              <h2 className="font-heading text-xl font-semibold text-ink">Need care advice?</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                Speak to our team for a free, no-obligation care assessment tailored to your needs.
              </p>
              <Link
                href="/contact"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-primary-dark"
              >
                Get in Touch <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>

            <nav aria-label="Related posts" className="rounded-card border border-line bg-white p-6 shadow-card">
              <h2 className="font-heading text-xl font-semibold text-ink">Related Posts</h2>
              <ul className="mt-3 space-y-4">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/blog/${r.slug}`} className="group flex gap-3">
                      <span className="relative block h-16 w-20 shrink-0 overflow-hidden rounded-lg">
                        <Image src={r.image} alt="" fill sizes="5rem" unoptimized={isRemoteImage(r.image)} className="object-cover" />
                      </span>
                      <span>
                        <span className="text-xs text-ink-muted">{r.dateShort}</span>
                        <span className="block text-sm font-semibold leading-snug text-ink group-hover:text-brand-primary">
                          {r.title}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        </div>
      </div>
    </>
  );
}
