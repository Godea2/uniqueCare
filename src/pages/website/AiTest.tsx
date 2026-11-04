import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ArrowLeft, Send, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { rowStyle } from "./shared";

type Msg = { role: "user" | "assistant"; content: string; usedChunks?: number };

export default function AiTest() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const chat = trpc.website.ai.testChat.useMutation({
    onSuccess: (res) => {
      setMessages((m) => [...m, { role: "assistant", content: res.answer, usedChunks: res.usedChunks }]);
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, chat.isPending]);

  function send() {
    const text = input.trim();
    if (!text || chat.isPending) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    // The API accepts at most 20 messages; send the most recent ones.
    chat.mutate({ messages: next.slice(-20).map(({ role, content }) => ({ role, content })) });
  }

  return (
    <div>
      <Link to="/website/ai" className="mb-3 inline-flex items-center gap-1 text-xs text-[--brand-600] hover:underline">
        <ArrowLeft className="h-3 w-3" />AI Assistant
      </Link>
      <PageHeader
        title="Test console"
        subtitle="Try the assistant with the current prompt and knowledge base."
        actions={
          <Button variant="outline" onClick={() => setMessages([])} disabled={messages.length === 0 || chat.isPending}>
            <Trash2 className="mr-1.5 h-4 w-4" />Clear conversation
          </Button>
        }
      />

      <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
        This console bypasses the Enabled setting, so it works even when the assistant is switched off for website visitors. Nothing here is shown to the public.
      </p>

      <div className="uc-card flex h-[32rem] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">Ask a question a visitor might ask, for example about services, areas or careers.</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl border px-3.5 py-2.5 text-sm",
                  m.role === "user" ? "border-[--brand-500] bg-[--brand-50] text-[--brand-900]" : "bg-white",
                )}
                style={m.role === "user" ? undefined : rowStyle}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                {m.role === "assistant" && m.usedChunks !== undefined && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {m.usedChunks === 0 ? "No knowledge chunks used" : `Used ${m.usedChunks} knowledge ${m.usedChunks === 1 ? "chunk" : "chunks"}`}
                  </p>
                )}
              </div>
            </div>
          ))}
          {chat.isPending && (
            <div className="flex justify-start">
              <div className="rounded-2xl border bg-white px-3.5 py-2.5 text-sm text-muted-foreground" style={rowStyle}>Thinking…</div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="flex items-end gap-2 border-t p-3"
          style={rowStyle}
          onSubmit={(e) => { e.preventDefault(); send(); }}
        >
          <Textarea
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={2} maxLength={4000} placeholder="Type a message. Enter to send, Shift+Enter for a new line."
            aria-label="Message" className="min-h-0 flex-1 resize-none"
          />
          <Button type="submit" disabled={chat.isPending || !input.trim()}>
            <Send className="mr-1.5 h-4 w-4" />Send
          </Button>
        </form>
      </div>
    </div>
  );
}
