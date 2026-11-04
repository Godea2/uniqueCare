import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ArrowLeft, Eye, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, EmptyState, Chip, fmtDate, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RouterOutputs } from "@/lib/router-types";
import { ConfirmDelete, rowStyle, thClass } from "./shared";
import { formatBytes } from "./MediaPicker";

type Doc = RouterOutputs["website"]["ai"]["documentsList"]["items"][number];

const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";
const EXTENSIONS = ["pdf", "docx", "txt", "md"];
const MAX_BYTES = 25 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
};

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export default function AiKnowledge() {
  const utils = trpc.useUtils();
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const list = trpc.website.ai.documentsList.useQuery(q ? { q } : undefined);
  const refresh = () => { void utils.website.ai.documentsList.invalidate(); };

  const [deleting, setDeleting] = useState<Doc | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const prepare = trpc.website.ai.documentsPrepareUpload.useMutation();
  const register = trpc.website.ai.documentsRegister.useMutation();
  const reindex = trpc.website.ai.documentsReindex.useMutation({
    onSuccess: (res) => { refresh(); toast.success(`Re-indexed (${res.chunkCount} chunks)`); },
    onError: (e) => { refresh(); toast.error(e.message); },
    onSettled: () => setBusyId(null),
  });
  const reindexAll = trpc.website.ai.documentsReindexAll.useMutation({
    onSuccess: (res) => {
      refresh();
      if (res.failed > 0) toast.warning(`Re-indexed ${res.indexed} documents, ${res.failed} failed`);
      else toast.success(`Re-indexed ${res.indexed} documents`);
    },
    onError: (e) => { refresh(); toast.error(e.message); },
  });
  const preview = trpc.website.ai.documentsPreviewUrl.useMutation({
    onSuccess: (res) => { window.open(res.url, "_blank", "noopener,noreferrer"); },
    onError: (e) => toast.error(e.message),
    onSettled: () => setBusyId(null),
  });
  const del = trpc.website.ai.documentsDelete.useMutation({
    onSuccess: () => { refresh(); setDeleting(null); toast.success("Document deleted"); },
    onError: (e) => toast.error(e.message),
  });

  async function uploadOne(file: File) {
    const ext = extOf(file.name);
    if (!EXTENSIONS.includes(ext)) throw new Error("Unsupported file type. Use PDF, DOCX, TXT or MD.");
    if (file.size > MAX_BYTES) throw new Error("File is larger than 25 MB.");
    const mimeType = file.type || MIME_BY_EXT[ext] || "application/octet-stream";
    const target = await prepare.mutateAsync({ fileName: file.name, mimeType });
    const put = await fetch(target.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": mimeType } });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    await register.mutateAsync({
      key: target.key, fileName: file.name, title: target.title, mimeType, bytes: file.size,
    });
  }

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    let ok = 0;
    for (const file of files) {
      try {
        await uploadOne(file);
        ok += 1;
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof Error ? err.message : "Upload failed"}`);
      }
    }
    setUploading(false);
    refresh();
    if (ok > 0) toast.success(ok === 1 ? "Document uploaded and indexed" : `${ok} documents uploaded and indexed`);
  };

  const items = list.data?.items ?? [];

  return (
    <div>
      <Link to="/website/ai" className="mb-3 inline-flex items-center gap-1 text-xs text-[--brand-600] hover:underline">
        <ArrowLeft className="h-3 w-3" />AI Assistant
      </Link>
      <PageHeader
        title="Knowledge base"
        subtitle="Documents the assistant searches when answering visitors. Supported types: PDF, DOCX, TXT and Markdown."
        actions={
          <>
            <input
              ref={fileRef} type="file" multiple accept={ACCEPT} className="sr-only"
              onChange={onFiles} aria-label="Choose documents to upload"
            />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload className="mr-1.5 h-4 w-4" />{uploading ? "Uploading…" : "Upload"}
            </Button>
            <Button variant="outline" onClick={() => reindexAll.mutate()} disabled={reindexAll.isPending || items.length === 0}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${reindexAll.isPending ? "animate-spin" : ""}`} />
              {reindexAll.isPending ? "Re-indexing…" : "Re-index all"}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex">
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={qInput} onChange={(e) => setQInput(e.target.value)}
            placeholder="Search title or file name…" aria-label="Search documents" className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {list.isLoading ? <Loading rows={5} />
        : list.error ? <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
        : items.length === 0 ? <EmptyState title="No documents" hint={q ? "Nothing matches this search." : "Upload a PDF, DOCX, TXT or MD file to build the knowledge base."} />
        : (
          <div className="uc-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground" style={rowStyle}>
                  <th className={thClass}>Document</th>
                  <th className={thClass}>Status</th>
                  <th className={`${thClass} text-right`}>Chunks</th>
                  <th className={thClass}>Added</th>
                  <th className={thClass}>Updated</th>
                  <th className={`${thClass} text-right`}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => {
                  const busy = busyId === d.id;
                  return (
                    <tr key={d.id} className="border-b align-top last:border-0" style={rowStyle}>
                      <td className="px-4 py-2">
                        <p className="font-medium">{d.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.fileName}{d.bytes ? ` · ${formatBytes(d.bytes)}` : ""}
                        </p>
                        {d.status === "error" && d.errorMessage && (
                          <p className="mt-1 max-w-md text-xs text-red-700">{d.errorMessage}</p>
                        )}
                      </td>
                      <td className="px-4 py-2"><Chip value={d.status} /></td>
                      <td className="px-4 py-2 text-right tabular-nums">{d.chunkCount}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                        {fmtDate(d.createdAt)}{d.createdBy ? <span className="block">{d.createdBy}</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{fmtDateTime(d.updatedAt)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        <Button
                          size="sm" variant="ghost" disabled={busy} aria-label={`Preview ${d.title}`}
                          onClick={() => { setBusyId(d.id); preview.mutate({ id: d.id }); }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost" disabled={busy} aria-label={`Re-index ${d.title}`}
                          onClick={() => { setBusyId(d.id); reindex.mutate({ id: d.id }); }}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${busy && reindex.isPending ? "animate-spin" : ""}`} />
                        </Button>
                        <Button size="sm" variant="ghost" aria-label={`Delete ${d.title}`} onClick={() => setDeleting(d)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      {!list.isLoading && !list.error && items.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">{items.length} {items.length === 1 ? "document" : "documents"}</p>
      )}

      <ConfirmDelete
        open={!!deleting}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        title="Delete this document?"
        description={<>“{deleting?.title}” and its indexed chunks will be removed. The assistant will no longer use it to answer questions.</>}
        busy={del.isPending}
        onConfirm={() => deleting && del.mutate({ id: deleting.id })}
      />
    </div>
  );
}
