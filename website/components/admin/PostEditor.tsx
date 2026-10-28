"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, Save } from "lucide-react";
import { adminFetch, errorMessage } from "@/lib/admin/client";
import { useAdminToast } from "./AdminToast";
import { ErrorBlock, LoadingBlock, PageHeader, StatusBadge, btnGhost, btnPrimary, card } from "./ui";

const CATEGORIES = ["Care Advice", "Company News", "Health Tips", "Industry Updates"] as const;
const STATUSES = ["draft", "published", "archived"] as const;

type Post = {
  id: number;
  title: string;
  slug: string;
  category: (typeof CATEGORIES)[number];
  imageUrl: string | null;
  excerpt: string;
  content: string;
  status: (typeof STATUSES)[number];
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

export default function PostEditor({ id }: { id?: string }) {
  const router = useRouter();
  const toast = useAdminToast();
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(!!id);
  const [category, setCategory] = useState<Post["category"]>("Care Advice");
  const [imageUrl, setImageUrl] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<Post["status"]>("draft");
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    adminFetch<Post>(`/api/admin/posts/${id}`)
      .then((p) => {
        if (!alive) return;
        setTitle(p.title);
        setSlug(p.slug);
        setCategory(p.category);
        setImageUrl(p.imageUrl ?? "");
        setExcerpt(p.excerpt);
        setContent(p.content);
        setStatus(p.status);
      })
      .catch((e) => alive && setLoadError(errorMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => setImgBroken(false), [imageUrl]);

  function onTitle(v: string) {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  async function save(nextStatus?: Post["status"]) {
    if (title.trim().length < 2) {
      toast.push("err", "Please add a title");
      return;
    }
    setSaving(true);
    const body = JSON.stringify({
      title,
      slug: slug || slugify(title),
      category,
      imageUrl: imageUrl.trim(),
      excerpt,
      content,
      status: nextStatus ?? status,
    });
    try {
      const saved = id
        ? await adminFetch<Post>(`/api/admin/posts/${id}`, { method: "PATCH", body })
        : await adminFetch<Post>("/api/admin/posts", { method: "POST", body });
      toast.push("ok", saved.status === "published" ? "Post published" : "Post saved");
      if (nextStatus) setStatus(nextStatus);
      setSlug(saved.slug);
      if (!id) router.replace(`/admin/posts/${saved.id}/edit`);
    } catch (e) {
      toast.push("err", errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock />;
  if (loadError) return <ErrorBlock message={loadError} />;

  return (
    <div>
      <Link href="/admin/posts" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-primary">
        <ArrowLeft className="h-4 w-4" /> All posts
      </Link>
      <PageHeader
        title={id ? "Edit post" : "New post"}
        description="Published posts appear on the blog within a few minutes. Posts with the same address as a built-in article replace it."
        actions={
          <>
            <StatusBadge status={status} />
            {id && status === "published" && slug && (
              <Link href={`/blog/${slug}`} target="_blank" className={btnGhost}>
                <ExternalLink className="h-4 w-4" /> View live
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className={`${card} space-y-4 p-5`}>
          <div>
            <label htmlFor="post-title" className="admin-label">Title</label>
            <input id="post-title" className="admin-input" value={title} maxLength={200} onChange={(e) => onTitle(e.target.value)} />
          </div>
          <div>
            <label htmlFor="post-slug" className="admin-label">Page address</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">/blog/</span>
              <input
                id="post-slug"
                className="admin-input"
                value={slug}
                maxLength={80}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
              />
            </div>
          </div>
          <div>
            <label htmlFor="post-excerpt" className="admin-label">Excerpt</label>
            <textarea id="post-excerpt" rows={3} maxLength={500} className="admin-input" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">{excerpt.length}/500 · Shown on blog cards and in search results.</p>
          </div>
          <div>
            <label htmlFor="post-content" className="admin-label">Content</label>
            <textarea
              id="post-content"
              rows={20}
              className="admin-input font-mono"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={"Start writing…\n\nLeave a blank line between paragraphs.\n\n## Use ## for headings\n\n- Use a dash for bullet points\n\n**Bold** and *italic* are supported."}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className={`${card} space-y-4 p-5`}>
            <div>
              <label htmlFor="post-status" className="admin-label">Status</label>
              <select id="post-status" className="admin-input" value={status} onChange={(e) => setStatus(e.target.value as Post["status"])}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="post-category" className="admin-label">Category</label>
              <select id="post-category" className="admin-input" value={category} onChange={(e) => setCategory(e.target.value as Post["category"])}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <button type="button" className={btnPrimary} disabled={saving} onClick={() => save()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </button>
              {status !== "published" && (
                <button type="button" className={btnGhost} disabled={saving} onClick={() => save("published")}>
                  Save &amp; publish
                </button>
              )}
            </div>
          </div>

          <div className={`${card} p-5`}>
            <label htmlFor="post-image" className="admin-label">Featured image URL</label>
            <input
              id="post-image"
              className="admin-input"
              placeholder="https://… or /images/blog-1.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            {imageUrl && !imgBroken && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" onError={() => setImgBroken(true)} className="mt-3 aspect-[16/10] w-full rounded-lg object-cover" />
            )}
            {imageUrl && imgBroken && <p className="mt-2 text-xs text-red-600">That image couldn&apos;t be loaded.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
