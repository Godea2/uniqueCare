import { Link } from "react-router";
import { BookOpen, ExternalLink, FlaskConical, ScrollText } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader, Loading, ErrorState, Chip, fmtDateTime } from "@/components/common";
import { Button } from "@/components/ui/button";

const WEBSITE_URL = (import.meta.env.VITE_WEBSITE_URL as string | undefined)?.replace(/\/$/, "") || "https://uniquecareuk.com";

const SECTIONS = [
  { to: "/website/ai/knowledge", label: "Knowledge base", hint: "Upload and index the documents the assistant answers from.", icon: BookOpen },
  { to: "/website/ai/prompt", label: "Prompt and settings", hint: "Edit the system prompt and welcome message, switch the assistant on or off, restore earlier versions.", icon: ScrollText },
  { to: "/website/ai/test", label: "Test console", hint: "Chat with the assistant and see how many knowledge chunks it used.", icon: FlaskConical },
] as const;

export default function AiAssistant() {
  const settings = trpc.website.ai.settingsGet.useQuery();
  const docs = trpc.website.ai.documentsList.useQuery();

  if (settings.isLoading) return <Loading rows={4} />;
  if (settings.error) return <ErrorState message={settings.error.message} onRetry={() => settings.refetch()} />;
  const s = settings.data!;
  const items = docs.data?.items ?? [];
  const ready = items.filter((d) => d.status === "ready").length;
  const failed = items.filter((d) => d.status === "error").length;

  return (
    <div>
      <PageHeader
        title="AI Assistant"
        subtitle="The chat assistant on the public website. Manage what it knows, how it behaves and test it before visitors see changes."
        actions={
          <Button variant="outline" asChild>
            <a href={WEBSITE_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 h-4 w-4" />View public site
            </a>
          </Button>
        }
      />

      <div className="uc-card mb-8 flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <Chip value={s.enabled ? "active" : "paused"} label={s.enabled ? "Enabled" : "Disabled"} />
          <div>
            <p className="text-sm font-medium">
              The assistant is {s.enabled ? "live on the public website" : "switched off for website visitors"}
            </p>
            <p className="text-xs text-muted-foreground">
              {s.updatedAt ? `Last changed ${fmtDateTime(s.updatedAt)}${s.updatedBy ? ` by ${s.updatedBy}` : ""}` : "Settings have not been saved yet."}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {docs.isLoading ? "Loading documents…" : `${ready} of ${items.length} documents ready${failed ? ` · ${failed} with errors` : ""}`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map(({ to, label, hint, icon: Icon }) => (
          <Link
            key={to} to={to}
            className="uc-card uc-focus flex items-start gap-3 p-4 transition-colors hover:border-[--brand-500]"
          >
            <span className="mt-0.5 rounded-lg bg-[--brand-50] p-2 text-[--brand-900]"><Icon className="h-4 w-4" aria-hidden /></span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
