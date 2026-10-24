"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Post } from "@/content/posts";

const CATEGORIES = ["All", "Care Advice", "Company News"];

export default function BlogFilter({ posts }: { posts: Post[] }) {
  const [cat, setCat] = useState("All");
  const shown = cat === "All" ? posts : posts.filter((p) => p.category === cat);

  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter posts by category">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={cat === c}
            onClick={() => setCat(c)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              cat === c ? "bg-brand-primary text-white" : "border border-line bg-white text-ink hover:bg-brand-soft"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {shown.map((p) => (
          <article
            key={p.slug}
            className="group overflow-hidden rounded-card border border-line bg-white shadow-card transition hover:-translate-y-1 hover:shadow-card-hover"
          >
            <Link href={`/blog/${p.slug}`} className="block">
              <span className="relative block aspect-[16/10] overflow-hidden">
                <Image
                  src={p.image}
                  alt={p.imageAlt}
                  fill
                  sizes="(min-width:768px) 33vw, 100vw"
                  className="object-cover transition-transform group-hover:scale-105"
                />
              </span>
              <span className="block p-5">
                <span className="flex items-center gap-3 text-xs">
                  <span className="rounded-full bg-brand-soft px-3 py-1 font-semibold text-brand-primary">
                    {p.category}
                  </span>
                  <time dateTime={p.date} className="text-ink-muted">
                    {p.dateShort}
                  </time>
                </span>
                <h2 className="mt-3 font-heading text-lg font-semibold leading-snug text-ink group-hover:text-brand-primary">
                  {p.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{p.excerpt}</p>
                <span className="mt-3 inline-block text-sm font-semibold text-brand-primary">Read more</span>
              </span>
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
