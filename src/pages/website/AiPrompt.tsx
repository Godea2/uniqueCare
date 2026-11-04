import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ArrowLeft, History, RotateCcw } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, EmptyState, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { RouterOutputs } from "@/lib/router-types";
import { rowStyle } from "./shared";

type Version = RouterOutputs["website"]["ai"]["promptVersions"]["items"][number];

export default function AiPrompt() {
  const utils = trpc.useUtils();
  const settings = trpc.website.ai.settingsGet.useQuery();
  const versions = trpc.website.ai.promptVersions.useQuery();

  const [enabled, setEnabled] = useState(true);
  const [welcome, setWelcome] = useState("");
  const [prompt, setPrompt] = useState("");
  const [note, setNote] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [restoring, setRestoring] = useState<Version | null>(null);

  useEffect(() => {
    if (settings.data && !loaded) {
      setEnabled(settings.data.enabled);
      setWelcome(settings.data.welcomeMessage);
      setPrompt(settings.data.systemPrompt);
      setLoaded(true);
    }
  }, [settings.data, loaded]);

  const refresh = () => {
    void utils.website.ai.settingsGet.invalidate();
    void utils.website.ai.promptVersions.invalidate();
  };

  const save = trpc.website.ai.settingsUpdate.useMutation({
    onSuccess: () => { refresh(); setNote(""); toast.success("Assistant settings saved"); },
    onError: (e) => toast.error(e.message),
  });
  const restore = trpc.website.ai.restorePrompt.useMutation({
    onSuccess: (res) => {
      setPrompt(res.systemPrompt);
      setRestoring(null);
      refresh();
      toast.success("Prompt restored");
    },
    onError: (e) => toast.error(e.message),
  });

  if (settings.isLoading) return <Loading rows={5} />;
  if (settings.error) return <ErrorState message={settings.error.message} onRetry={() => settings.refetch()} />;

  const s = settings.data!;
  const dirty = enabled !== s.enabled || welcome !== s.welcomeMessage || prompt !== s.systemPrompt;
  const valid = welcome.trim().length > 0 && prompt.trim().length >= 20;
  const items = versions.data?.items ?? [];

  return (
    <div>
      <Link to="/website/ai" className="mb-3 inline-flex items-center gap-1 text-xs text-[--brand-600] hover:underline">
        <ArrowLeft className="h-3 w-3" />AI Assistant
      </Link>
      <PageHeader
        title="Prompt and settings"
        subtitle={s.updatedAt ? `Last saved ${fmtDateTime(s.updatedAt)}${s.updatedBy ? ` by ${s.updatedBy}` : ""}.` : "Control how the assistant behaves on the public website."}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <form
          className="uc-card space-y-5 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              enabled, welcomeMessage: welcome.trim(), systemPrompt: prompt.trim(), note: note.trim() || undefined,
            });
          }}
        >
          <div className="flex items-center justify-between gap-4 rounded-xl border bg-white/70 p-3" style={rowStyle}>
            <div>
              <Label htmlFor="ai-enabled" className="text-sm font-medium">Assistant enabled</Label>
              <p className="text-xs text-muted-foreground">When off, visitors see a message pointing them to the phone line and contact form.</p>
            </div>
            <Switch id="ai-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-welcome">Welcome message</Label>
            <Textarea
              id="ai-welcome" value={welcome} onChange={(e) => setWelcome(e.target.value)}
              rows={3} maxLength={1000}
            />
            <p className="text-[11px] text-muted-foreground">The first message visitors see when they open the chat. {welcome.length}/1000</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-prompt">System prompt</Label>
            <Textarea
              id="ai-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)}
              rows={18} maxLength={20000} className="font-mono text-xs leading-relaxed"
            />
            <p className="text-[11px] text-muted-foreground">
              Instructions that set the assistant's tone, scope and limits. At least 20 characters. {prompt.length}/20000
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-note">Change note (optional)</Label>
            <Input
              id="ai-note" value={note} onChange={(e) => setNote(e.target.value)}
              maxLength={200} placeholder="What changed and why"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button" variant="outline" disabled={!dirty || save.isPending}
              onClick={() => { setEnabled(s.enabled); setWelcome(s.welcomeMessage); setPrompt(s.systemPrompt); }}
            >
              Discard changes
            </Button>
            <Button type="submit" disabled={!dirty || !valid || save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[--brand-900]">
            <History className="h-4 w-4" aria-hidden />Version history
          </h2>
          {versions.isLoading ? <Loading rows={3} />
            : versions.error ? <ErrorState message={versions.error.message} onRetry={() => versions.refetch()} />
            : items.length === 0 ? <EmptyState title="No versions yet" hint="A version is recorded each time you save." />
            : (
              <ul className="uc-card divide-y" style={rowStyle}>
                {items.map((v) => (
                  <li key={v.id} className="flex items-start justify-between gap-3 px-4 py-3" style={rowStyle}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" title={v.note}>{v.note}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {fmtDateTime(v.createdAt)}{v.createdBy ? ` · ${v.createdBy}` : ""}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{v.prompt}</p>
                    </div>
                    <Button
                      size="sm" variant="outline" className="shrink-0"
                      disabled={v.prompt === s.systemPrompt}
                      onClick={() => setRestoring(v)}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Restore
                    </Button>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </div>

      {restoring && (
        <Dialog open onOpenChange={(v) => { if (!v) setRestoring(null); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Restore this prompt version?</DialogTitle>
              <DialogDescription>
                From {fmtDateTime(restoring.createdAt)}. It replaces the live system prompt immediately. Unsaved edits in the form will be replaced.
              </DialogDescription>
            </DialogHeader>
            <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border bg-white/70 p-3 text-xs" style={rowStyle}>{restoring.prompt}</pre>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRestoring(null)} disabled={restore.isPending}>Cancel</Button>
              <Button onClick={() => restore.mutate({ id: restoring.id })} disabled={restore.isPending}>
                {restore.isPending ? "Restoring…" : "Restore"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
