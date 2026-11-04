import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Link2, Pencil, Search, Trash2, Upload } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, EmptyState, fmtDate } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ConfirmDelete, Pager } from "./shared";
import { MEDIA_FOLDERS, MediaThumb, formatBytes, useMediaUpload } from "./MediaPicker";
import type { MediaAsset } from "./MediaPicker";

const PAGE_SIZE = 36;
const KINDS = ["image", "video", "document", "other"] as const;

export default function MediaLibrary() {
  const utils = trpc.useUtils();
  const [folder, setFolder] = useState("all");
  const [kind, setKind] = useState("all");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput.trim()); setOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const list = trpc.website.media.list.useQuery(
    {
      folder: folder === "all" ? undefined : folder,
      kind: kind === "all" ? undefined : (kind as (typeof KINDS)[number]),
      q: q || undefined,
      limit: PAGE_SIZE,
      offset,
    },
    { placeholderData: keepPreviousData },
  );
  const refresh = () => { void utils.website.media.list.invalidate(); };

  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = useState<MediaAsset | null>(null);
  const [linking, setLinking] = useState(false);

  const del = trpc.website.media.delete.useMutation({
    onSuccess: () => { refresh(); setDeleting(null); toast.success("Asset deleted"); },
    onError: (e) => toast.error(e.message),
  });

  // Upload
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useMediaUpload();
  const [upFolder, setUpFolder] = useState("general");

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    let ok = 0;
    for (const file of files) {
      try {
        await upload(file, upFolder);
        ok += 1;
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof Error ? err.message : "Upload failed"}`);
      }
    }
    if (ok > 0) {
      refresh();
      toast.success(ok === 1 ? "File uploaded" : `${ok} files uploaded`);
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("URL copied");
    } catch {
      toast.error("Could not copy the URL");
    }
  };

  const items = list.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Media library"
        subtitle="Images and videos used across the public website. Upload a file or link one hosted elsewhere."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={upFolder} onValueChange={setUpFolder}>
              <SelectTrigger aria-label="Upload folder" className="h-9 w-36 capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>{MEDIA_FOLDERS.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}</SelectContent>
            </Select>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="sr-only"
              accept="image/*,video/*,application/pdf"
              onChange={onFiles}
              aria-label="Choose files to upload"
            />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload className="mr-1.5 h-4 w-4" />{uploading ? "Uploading…" : "Upload"}
            </Button>
            <Button variant="outline" onClick={() => setLinking(true)}>
              <Link2 className="mr-1.5 h-4 w-4" />Link URL
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={folder} onValueChange={(v) => { setFolder(v); setOffset(0); }}>
          <SelectTrigger aria-label="Filter by folder" className="h-9 w-44 capitalize"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All folders</SelectItem>
            {MEDIA_FOLDERS.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={(v) => { setKind(v); setOffset(0); }}>
          <SelectTrigger aria-label="Filter by type" className="h-9 w-40 capitalize"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {KINDS.map((k) => <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search file name, alt…"
            aria-label="Search media"
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {list.isLoading ? <Loading rows={5} />
        : list.error ? <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
        : items.length === 0 ? <EmptyState title="No media" hint="Upload a file or link an external URL to get started." />
        : (
          <>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {items.map((a) => (
                <li key={a.id} className="uc-card overflow-hidden p-2">
                  <MediaThumb asset={a} />
                  <div className="mt-2 min-w-0">
                    <p className="truncate text-xs font-medium" title={a.fileName}>{a.fileName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      <span className="capitalize">{a.folder}</span>
                      {a.bytes ? ` · ${formatBytes(a.bytes)}` : ""}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground" title={a.alt}>
                      {a.alt ? `Alt: ${a.alt}` : "No alt text"} · {fmtDate(a.createdAt)}
                    </p>
                  </div>
                  <div className="mt-2 flex justify-end gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2" aria-label={`Copy URL of ${a.fileName}`} onClick={() => void copyUrl(a.url)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" aria-label={`Edit ${a.fileName}`} onClick={() => setEditing(a)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" aria-label={`Delete ${a.fileName}`} onClick={() => setDeleting(a)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <Pager offset={offset} limit={PAGE_SIZE} total={list.data?.total ?? 0} onChange={setOffset} />
          </>
        )}

      {linking && <LinkDialog onClose={() => setLinking(false)} onSaved={() => { refresh(); setLinking(false); }} />}
      {editing && (
        <EditDialog
          key={editing.id}
          asset={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { refresh(); setEditing(null); }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        title="Delete this file?"
        description={<>“{deleting?.fileName}” will be removed from the library{deleting?.storageKey ? " and from storage" : ""}. Pages that still use its URL will show a broken file.</>}
        busy={del.isPending}
        onConfirm={() => deleting && del.mutate({ id: deleting.id })}
      />
    </div>
  );
}

function LinkDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [alt, setAlt] = useState("");
  const [folder, setFolder] = useState("general");
  const create = trpc.website.media.createExternal.useMutation({
    onSuccess: () => { toast.success("Link added"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link external URL</DialogTitle>
          <DialogDescription>Add an image or video hosted elsewhere so it can be picked like any other asset.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ url: url.trim(), fileName: fileName.trim() || undefined, alt: alt.trim(), folder });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ml-url">URL</Label>
            <Input id="ml-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" maxLength={2000} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ml-name">Name (optional)</Label>
            <Input id="ml-name" value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="Taken from the URL if blank" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ml-alt">Alt text</Label>
            <Input id="ml-alt" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={300} />
          </div>
          <div className="space-y-1.5">
            <Label>Folder</Label>
            <Select value={folder} onValueChange={setFolder}>
              <SelectTrigger aria-label="Folder" className="capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>{MEDIA_FOLDERS.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || !url.trim()}>{create.isPending ? "Adding…" : "Add link"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ asset, onClose, onSaved }: { asset: MediaAsset; onClose: () => void; onSaved: () => void }) {
  const [alt, setAlt] = useState(asset.alt ?? "");
  const [folder, setFolder] = useState(asset.folder);
  const update = trpc.website.media.update.useMutation({
    onSuccess: () => { toast.success("Asset saved"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const folders = MEDIA_FOLDERS.includes(folder as (typeof MEDIA_FOLDERS)[number]) ? MEDIA_FOLDERS : [...MEDIA_FOLDERS, folder];

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit asset</DialogTitle>
          <DialogDescription className="truncate">{asset.fileName}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ id: asset.id, alt: alt.trim(), folder });
          }}
        >
          <MediaThumb asset={asset} className="mx-auto h-40 w-40" />
          <div className="space-y-1.5">
            <Label htmlFor="me-alt">Alt text</Label>
            <Input id="me-alt" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe the image for screen readers" maxLength={300} />
          </div>
          <div className="space-y-1.5">
            <Label>Folder</Label>
            <Select value={folder} onValueChange={setFolder}>
              <SelectTrigger aria-label="Folder" className="capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>{folders.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="me-url">URL</Label>
            <Input id="me-url" value={asset.url} readOnly onFocus={(e) => e.currentTarget.select()} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
