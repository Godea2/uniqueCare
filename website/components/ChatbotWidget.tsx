"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, Send, X } from "lucide-react";
import { includesWrapUp, isClosingReply } from "@/lib/chat-close";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "ucuk-chat-v1";
const SUMMARY_FLAG_KEY = "ucuk-chat-summary-sent";
/** Idle after wrap-up before we email a summary without a reply. */
const IDLE_SUMMARY_MS = 4 * 60_000;

const CLOSING_THANKS =
  "Thank you for chatting with Unique Care UK. If you need anything else, call 020 3917 0260 or use our contact form — we're here to help.";

function loadSession(): Msg[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Msg[];
    return Array.isArray(parsed) ? parsed.slice(-30) : [];
  } catch {
    return [];
  }
}

function saveSession(msgs: Msg[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-30)));
  } catch {
    /* ignore quota */
  }
}

function summaryAlreadySent(): boolean {
  try {
    return sessionStorage.getItem(SUMMARY_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function markSummarySent() {
  try {
    sessionStorage.setItem(SUMMARY_FLAG_KEY, "1");
  } catch {
    /* ignore */
  }
}

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [welcome, setWelcome] = useState(
    "Hello. Welcome to Unique Care UK. I'm here to help answer your questions about our care services, care assessments, and support options. How can I help you today?",
  );
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [booted, setBooted] = useState(false);
  const [awaitingClose, setAwaitingClose] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<Msg[]>([]);
  const awaitingCloseRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    awaitingCloseRef.current = awaitingClose;
  }, [awaitingClose]);

  const sendSummary = useCallback(async (msgs: Msg[], reason: "user_declined" | "idle_timeout" | "closed") => {
    if (summaryAlreadySent()) return;
    if (!msgs.some((m) => m.role === "user")) return;
    markSummarySent();
    setAwaitingClose(false);
    awaitingCloseRef.current = false;
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    try {
      await fetch("/api/chat/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs, reason }),
        keepalive: true,
      });
    } catch {
      /* best-effort */
    }
  }, []);

  const armIdleSummary = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (!awaitingCloseRef.current || summaryAlreadySent()) return;
      void sendSummary(messagesRef.current, "idle_timeout");
    }, IDLE_SUMMARY_MS);
  }, [sendSummary]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chat/config");
        if (res.ok) {
          const data = (await res.json()) as { enabled?: boolean; welcomeMessage?: string };
          if (!cancelled) {
            setEnabled(data.enabled !== false);
            if (data.welcomeMessage) setWelcome(data.welcomeMessage);
          }
        }
      } catch {
        /* keep defaults */
      } finally {
        if (!cancelled) {
          const prior = loadSession();
          setMessages(prior);
          const last = [...prior].reverse().find((m) => m.role === "assistant");
          if (last && includesWrapUp(last.content) && !summaryAlreadySent()) {
            setAwaitingClose(true);
          }
          setBooted(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (awaitingClose && !summaryAlreadySent()) armIdleSummary();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [awaitingClose, armIdleSummary]);

  // If the visitor leaves while a wrap-up is pending, still try to email a summary.
  useEffect(() => {
    const onLeave = () => {
      if (!awaitingCloseRef.current || summaryAlreadySent()) return;
      const msgs = messagesRef.current;
      if (!msgs.some((m) => m.role === "user")) return;
      markSummarySent();
      const body = JSON.stringify({ messages: msgs, reason: "closed" });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/chat/summary", new Blob([body], { type: "application/json" }));
      }
    };
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, []);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [open, messages, busy]);

  if (!enabled || !booted) return null;

  const visible: Msg[] =
    messages.length > 0 ? messages : [{ role: "assistant", content: welcome }];

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    saveSession(next);
    setInput("");

    // Visitor declined further help after the wrap-up question → email summary.
    if (awaitingClose && isClosingReply(text)) {
      const withThanks = [...next, { role: "assistant" as const, content: CLOSING_THANKS }];
      setMessages(withThanks);
      saveSession(withThanks);
      setBusy(true);
      await sendSummary(next, "user_declined");
      setBusy(false);
      return;
    }

    setAwaitingClose(false);
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      const answer =
        data.answer
        || "I am having trouble responding right now. Please call 020 3917 0260 or use our contact form.";
      const withReply = [...next, { role: "assistant" as const, content: answer }];
      setMessages(withReply);
      saveSession(withReply);
      if (includesWrapUp(answer) && !summaryAlreadySent()) {
        setAwaitingClose(true);
      }
    } catch {
      const withReply = [
        ...next,
        {
          role: "assistant" as const,
          content: "Something went wrong. Please try again, or call 020 3917 0260.",
        },
      ];
      setMessages(withReply);
      saveSession(withReply);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Launcher — stacked above WhatsApp so it is easy to spot (green = WhatsApp, teal = AI chat) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="ucuk-chat-panel"
        aria-label={open ? "Close chat assistant" : "Open chat assistant"}
        title="Chat with Unique Care UK"
        className="fixed bottom-[9.5rem] right-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary text-white shadow-card-hover transition hover:bg-brand-primary-dark sm:h-14 sm:w-14 md:bottom-[5.5rem] md:right-5"
      >
        {open ? <X className="h-6 w-6" aria-hidden /> : <MessageCircle className="h-6 w-6" aria-hidden />}
      </button>

      {open && (
        <div
          id="ucuk-chat-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Unique Care UK chat assistant"
          className="fixed bottom-[13.5rem] right-4 z-40 flex w-[min(100vw-2rem,22rem)] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-lift sm:bottom-36 md:bottom-[10rem] md:right-5"
        >
          <div className="flex items-center gap-3 bg-brand-primary px-4 py-3 text-white">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
              <Bot className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Unique Care UK Assistant</p>
              <p className="truncate text-xs text-white/80">Care questions answered carefully</p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="flex max-h-[min(55vh,24rem)] flex-col gap-3 overflow-y-auto bg-surface-alt px-3 py-3">
            {visible.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "ml-auto bg-brand-primary text-white"
                    : "mr-auto border border-line bg-white text-ink"
                }`}
              >
                {m.content}
              </div>
            ))}
            {busy && (
              <div className="mr-auto inline-flex items-center gap-2 rounded-2xl border border-line bg-white px-3.5 py-2 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            className="flex items-end gap-2 border-t border-line bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="ucuk-chat-input" className="sr-only">
              Your message
            </label>
            <textarea
              id="ucuk-chat-input"
              ref={inputRef}
              rows={1}
              value={input}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask about our care services…"
              className="max-h-28 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-line bg-surface-alt px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-brand-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send message"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white transition hover:bg-brand-primary-dark disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden />
            </button>
          </form>
          <p className="bg-white px-3 pb-2 text-[10px] leading-snug text-ink-muted">
            Answers are based on Unique Care UK guidance. For personalised advice,{" "}
            <a href="/contact" className="font-semibold text-brand-primary hover:underline">
              contact our team
            </a>
            .
          </p>
        </div>
      )}
    </>
  );
}
