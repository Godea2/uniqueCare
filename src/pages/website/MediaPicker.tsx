import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, ImageIcon, Link2, Search, Upload, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Loading, ErrorState, EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import type { RouterOutputs } from "@/lib/router-types";
import { cn } from "@/lib/utils";
import { Pager } from "./shared";

export type MediaAsset = RouterOutputs["website"]["media"]["list"]["items"][number];
export type MediaKind = "image" | "video";

/** Suggested folders. The API accepts any short folder name. */
export const MEDIA_FOLDERS = ["general", "brand", "hero", "services", "areas", "branches", "certifications", "team", "blog"] as const;

const PAGE_SIZE = 24;

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Upload a file to storage and register it in the media library. */
export function useMediaUpload() {
  const prepare = trpc.website.media.prepareUpload.useMutation();
  const register = trpc.website.media.register.useMutation();
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File, folder: string, alt = ""): Promise<MediaAsset> => {
    setUploading(true);
    try {
      const prep = await prepare.mutateAsync({ fileName: file.name, folder, mimeType: file.type || undefined });
      const res = await fetch(prep.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || prep.mimeType },
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      return await register.mutateAsync({
        key: prep.key,
        fileName: file.name,
        folder,
        alt,
        mimeType: file.type || undefined,
        bytes: file.size,
      });
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading };
}

/** Square preview of an asset (image, video frame or file icon). */
export function MediaThumb({ asset, className }: { asset: Pick<MediaAsset, "kind" | "url" | "alt" | "fileName">; className?: string }) {
  return (
    <div className={cn("flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-slate-100", className)}>
      {asset.kind === "image" ? (
        <img src={asset.url} alt={asset.alt || asset.fileName} loading="lazy" className="h-full w-full object-cover" />
      ) : asset.kind === "video" ? (
        <video src={asset.url} muted preload="metadata" className="h-full w-full object-cover" aria-label={asset.fileName} />
      ) : (
        <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}

export function MediaPicker({
  open, onOpenChange, onSelect, kindFilter,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string, alt?: string) => void;
  kindFilter?: MediaKind;
}) {
  const utils = trpc.useUtils();
  const [folder, setFolder] = useState("all");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [tab, setTab] = useState<"library" | "upload" | "link">("library");

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput.trim()); setOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const list = trpc.website.media.list.useQuery(
    {
      folder: folder === "all" ? undefined : folder,
      kind: kindFilter,
      q: q || undefined,
      limit: PAGE_SIZE,
      offset,
    },
    { enabled: open && tab === "library", placeholderData: keepPreviousData },
  );

  const choose = (asset: Pick<MediaAsset, "url" | "alt">) => {
    onSelect(asset.url, asset.alt || undefined);
    onOpenChange(false);
  };

  // Upload tab state
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useMediaUpload();
  const [upFolder, setUpFolder] = useState("general");
  const [upAlt, setUpAlt] = useState("");

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (kindFilter && !file.type.startsWith(`${kindFilter}/`)) {
      toast.error(`Please choose ${kindFilter === "image" ? "an image" : "a video"} file`);
      return;
    }
    try {
      const asset = await upload(file, upFolder, upAlt.trim());
      void utils.website.media.list.invalidate();
      toast.success("File uploaded");
      choose(asset);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  };

  // Link tab state
  const [linkUrl, setLinkUrl] = useState("");
  const [linkAlt, setLinkAlt] = useState("");
  const createExternal = trpc.website.media.createExternal.useMutation({
    onSuccess: (asset) => {
      void utils.website.media.list.invalidate();
      toast.success("Link added to the library");
      choose(asset);
    },
    onError: (e) => toast.error(e.message),
  });

  const items = list.data?.items ?? [];
  const tabs = [
    { id: "library", label: "Library", icon: ImageIcon },
    { id: "upload", label: "Upload", icon: Upload },
    { id: "link", label: "External URL", icon: Link2 },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Choose {kindFilter === "video" ? "a video" : kindFilter === "image" ? "an image" : "media"}</DialogTitle>
          <DialogDescription>Pick from the library, upload a new file, or link an external URL.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Media source">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "uc-focus inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                tab === id
                  ? "border-[--brand-500] bg-[--brand-50] text-[--brand-900]"
                  : "border-[--card-line] bg-white text-[--ink-500] hover:text-[--brand-900]",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />{label}
            </button>
          ))}
        </div>

        {tab === "library" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={folder} onValueChange={(v) => { setFolder(v); setOffset(0); }}>
                <SelectTrigger aria-label="Folder" className="h-9 w-44 capitalize"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All folders</SelectItem>
                  {MEDIA_FOLDERS.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}
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

            {list.isLoading ? <Loading rows={3} />
              : list.error ? <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
              : items.length === 0 ? <EmptyState title="No media found" hint="Upload a file or link an external URL." />
              : (
                <>
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {items.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => choose(a)}
                          className="uc-focus uc-card group block w-full overflow-hidden p-1.5 text-left transition-colors hover:border-[--brand-500]"
                          title={a.fileName}
                        >
                          <MediaThumb asset={a} />
                          <span className="mt-1.5 block truncate text-[11px] font-medium">{a.fileName}</span>
                          <span className="block truncate text-[10px] capitalize text-muted-foreground">{a.folder}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Pager offset={offset} limit={PAGE_SIZE} total={list.data?.total ?? 0} onChange={setOffset} />
                </>
              )}
          </div>
        )}

        {tab === "upload" && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Folder</Label>
                <Select value={upFolder} onValueChange={setUpFolder}>
                  <SelectTrigger aria-label="Upload folder" className="capitalize"><SelectValue /></SelectTrigger>
                  <SelectContent>{MEDIA_FOLDERS.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mp-up-alt">Alt text (optional)</Label>
                <Input id="mp-up-alt" value={upAlt} onChange={(e) => setUpAlt(e.target.value)} maxLength={300} placeholder="Describe the image" />
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              className="sr-only"
              accept={kindFilter ? `${kindFilter}/*` : "image/*,video/*,application/pdf"}
              onChange={onFile}
              aria-label="Choose a file to upload"
            />
            <Button type="button" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" />{uploading ? "Uploading…" : "Choose file and upload"}
            </Button>
            <p className="text-[11px] text-muted-foreground">The file is uploaded, added to the library and selected automatically.</p>
          </div>
        )}

        {tab === "link" && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              createExternal.mutate({
                url: linkUrl.trim(),
                alt: linkAlt.trim(),
                folder: "general",
                kind: kindFilter,
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="mp-link-url">Image or video URL</Label>
              <Input id="mp-link-url" type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" maxLength={2000} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-link-alt">Alt text (optional)</Label>
              <Input id="mp-link-alt" value={linkAlt} onChange={(e) => setLinkAlt(e.target.value)} maxLength={300} />
            </div>
            <Button type="submit" disabled={createExternal.isPending || !linkUrl.trim()}>
              <Link2 className="mr-1.5 h-4 w-4" />{createExternal.isPending ? "Adding…" : "Use this URL"}
            </Button>
          </form>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * URL text input with a "Browse" button that opens the MediaPicker.
 * The text input stays editable as a fallback for relative paths such as /images/x.jpg.
 */
export function MediaField({
  id, label, value, onChange, onAltChange, kindFilter, placeholder, hint, maxLength = 500,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (url: string) => void;
  /** Called with the asset's alt text when one is picked and it has alt text. */
  onAltChange?: (alt: string) => void;
  kindFilter?: MediaKind;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
}) {
  const [open, setOpen] = useState(false);
  const isImage = kindFilter !== "video" && /\.(png|jpe?g|gif|webp|avif|svg|ico)(\?|$)/i.test(value);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        {isImage && (
          <img src={value} alt="" className="h-9 w-9 shrink-0 rounded-md border object-cover" style={{ borderColor: "var(--line)" }} />
        )}
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "https://… or /images/file.jpg"} maxLength={maxLength} />
        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setOpen(true)}>
          <ImageIcon className="mr-1.5 h-3.5 w-3.5" />Browse
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0" aria-label={`Clear ${label}`} onClick={() => onChange("")}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        kindFilter={kindFilter}
        onSelect={(url, alt) => { onChange(url); if (alt && onAltChange) onAltChange(alt); }}
      />
    </div>
  );
}