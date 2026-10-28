import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, EmptyState, Chip, fmtDate } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import type { RouterOutputs } from "@/lib/router-types";
import { ConfirmDelete, FilterBar, Pager, rowStyle, thClass, useListParams } from "./shared";

type Post = RouterOutputs["website"]["posts"]["list"]["items"][number];
const STATUSES = ["draft", "published", "archived"] as const;
const CATEGORIES = ["Care Advice", "Company News", "Health Tips", "Industry Updates"] as const;
const WEBSITE_URL = (import.meta.env.VITE_WEBSITE_URL as string | undefined)?.replace(/\/$/, "") || "https://uniquecareuk.com";

export default function Posts() {
  const utils = trpc.useUtils();
  const params = useListParams();
  const q = trpc.website.posts.list.useQuery(params.input, { placeholderData: keepPreviousData });
  const [editing, setEditing] = useState<Post | "new" | null>(null);
  const [deleting, setDeleting] = useState<Post | null>(null);

  const refresh = () => { void utils.website.posts.list.invalidate(); void utils.website.dashboard.invalidate(); };
  const del = trpc.website.posts.delete.useMutation({
    onSuccess: () => { refresh(); setDeleting(null); toast.success("Post deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const items = q.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Blog posts"
        subtitle="Articles shown on the public website blog. Only published posts are visible."
        actions={<Button onClick={() => setEditing("new")}><Plus className="mr-1.5 h-4 w-4" />New post</Button>}
      />
      <FilterBar params={params} statuses={STATUSES} counts={q.data?.counts} placeholder="Search title, slug…" />

      {q.isLoading ? <Loading rows={5} />
        : q.error ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : items.length === 0 ? <EmptyState title="No posts" hint="Write your first article." />
        : (
          <>
            <div className="uc-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground" style={rowStyle}>
                    <th className={thClass}>Title</th>
                    <th className={thClass}>Category</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>Updated</th>
                    <th className={`${thClass} text-right`}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className="border-b last:border-0" style={rowStyle}>
                      <td className="max-w-80 px-4 py-2">
                        <p className="truncate font-medium" title={p.title}>{p.title}</p>
                        <p className="truncate text-xs text-muted-foreground">/blog/{p.slug}</p>
                      </td>
                      <td className="px-4 py-2 text-xs">{p.category}</td>
                      <td className="px-4 py-2"><Chip value={p.status} /></td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDate(p.updatedAt)}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          {p.status === "published" && (
                            <Button size="sm" variant="ghost" asChild aria-label={`View ${p.title} on the website`}>
                              <a href={`${WEBSITE_URL}/blog/${p.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setEditing(p)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                          <Button size="sm" variant="ghost" aria-label={`Delete ${p.title}`} onClick={() => setDeleting(p)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager offset={params.offset} limit={params.limit} total={q.data?.total ?? 0} onChange={params.setOffset} />
          </>
        )}

      {editing && (
        <PostEditor
          key={editing === "new" ? "new" : editing.id}
          post={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { refresh(); setEditing(null); }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        title="Delete this post?"
        description={<>“{deleting?.title}” will be permanently removed{deleting?.status === "published" ? " and disappear from the public blog" : ""}. Consider archiving it instead.</>}
        busy={del.isPending}
        onConfirm={() => deleting && del.mutate({ id: deleting.id })}
      />
    </div>
  );
}

function PostEditor({ post, onClose, onSaved }: { post: Post | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>((post?.category as (typeof CATEGORIES)[number]) ?? "Care Advice");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>((post?.status as (typeof STATUSES)[number]) ?? "draft");
  const [imageUrl, setImageUrl] = useState(post?.imageUrl ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [content, setContent] = useState(post?.content ?? "");

  const opts = {
    onSuccess: () => { toast.success(post ? "Post saved" : "Post created"); onSaved(); },
    onError: (e: { message: string }) => toast.error(e.message),
  };
  const create = trpc.website.posts.create.useMutation(opts);
  const update = trpc.website.posts.update.useMutation(opts);
  const busy = create.isPending || update.isPending;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{post ? "Edit post" : "New post"}</DialogTitle>
          <DialogDescription>Blank line = new paragraph · <code>## Heading</code> · <code>- bullet</code> · <code>**bold**</code></DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const payload = { title, slug: slug || undefined, category, status, imageUrl, excerpt, content };
            if (post) update.mutate({ id: post.id, ...payload });
            else create.mutate(payload);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="post-title">Title</Label>
              <Input id="post-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-slug">URL slug</Label>
              <Input id="post-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from title" maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-image">Image URL</Label>
              <Input id="post-image" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://… or /images/blog-1.jpg" maxLength={2000} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="post-excerpt">Excerpt</Label>
              <Textarea id="post-excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} maxLength={500} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="post-content">Content</Label>
              <Textarea id="post-content" value={content} onChange={(e) => setContent(e.target.value)} rows={14} maxLength={100000} className="font-mono text-[13px]" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || title.trim().length < 2}>{busy ? "Saving…" : "Save post"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
