import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

/**
 * Public website chat.
 *
 * Prefer the staff portal bridge (same GEMINI_API_KEY + model chain as recruitment
 * scoring, plus portal system prompt + knowledge chunks). Fall back to a local
 * Gemini call when the bridge is unavailable but GEMINI_API_KEY is set on Vercel.
 */

export type ChatMessage = { role: "user" | "assistant"; content: string };

type Settings = {
  enabled: boolean;
  welcome_message: string;
  system_prompt: string;
};

const FALLBACK_WELCOME =
  "Hello. Welcome to Unique Care UK. I'm here to help answer your questions about our care services, care assessments, and support options. How can I help you today?";

const GOVERNANCE = `
CRITICAL RULES:
- For greetings or small talk, reply warmly in 1-2 short sentences and invite care-related questions.
- For care questions, prefer the approved knowledge excerpts. Do not invent prices, wait times, or clinical advice.
- If unsure, say you do not have that information and invite the visitor to call 020 3917 0260 or use /contact.
- For emergencies tell them to call 999.
- Stay warm, professional, concise (British English).
`;

function portalBase(): string {
  return (
    process.env.JOBS_PORTAL_URL
    || process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL
    // Production Unique Care portal — used when env is missing so chat still works.
    || "https://portal.uniquecareuk.online"
  ).replace(/\/$/, "");
}

function bridgeSecret(): string {
  return (
    process.env.WEBSITE_NOTIFY_SECRET
    || process.env.WEBSITE_REVALIDATE_SECRET
    || process.env.REVALIDATE_SECRET
    || ""
  );
}

/** Try several portal hosts in case the env URL is stale or wrong. */
function portalCandidates(): string[] {
  const primary = portalBase();
  const extras = [
    "https://portal.uniquecareuk.online",
    "https://unique-care-six.vercel.app",
  ];
  return [...new Set([primary, ...extras].map((u) => u.replace(/\/$/, "")).filter(Boolean))];
}

function supabaseBase() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_URL ?? "";
}
function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

async function rest<T>(path: string): Promise<T | null> {
  if (!supabaseBase() || !serviceKey()) return null;
  try {
    const res = await fetch(`${supabaseBase()}/rest/v1/${path}`, {
      headers: {
        apikey: serviceKey(),
        Authorization: `Bearer ${serviceKey()}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function rankChunks(query: string, chunks: { content: string }[], limit = 8) {
  const terms = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (!terms.length) return chunks.slice(0, limit);
  return chunks
    .map((c) => {
      const hay = c.content.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (hay.includes(t)) score += 1;
        const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
        const m = hay.match(re);
        if (m) score += Math.min(3, m.length) * 0.25;
      }
      return { ...c, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function isGreeting(text: string): boolean {
  return /^(hi|hello|hey|good\s+(morning|afternoon|evening)|thanks|thank you|ok|okay)\b[.!?]*$/i.test(text.trim());
}

export async function getChatPublicConfig() {
  const rows = await rest<Settings[]>("website_ai_settings?id=eq.default&select=enabled,welcome_message,system_prompt&limit=1");
  const row = rows?.[0];
  return {
    enabled: row ? row.enabled !== false : true,
    welcomeMessage: row?.welcome_message || FALLBACK_WELCOME,
  };
}

/** Ask the portal (shared Gemini key + RAG) to answer. */
async function answerViaPortal(messages: ChatMessage[]): Promise<{ answer: string } | null> {
  const secret = bridgeSecret();
  if (!secret) {
    console.warn("[chat] portal bridge skipped — REVALIDATE_SECRET / WEBSITE_NOTIFY_SECRET not set on the website");
    return null;
  }
  const payload = JSON.stringify({ messages });
  for (const base of portalCandidates()) {
    try {
      const res = await fetch(`${base}/api/public/website-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: payload,
        cache: "no-store",
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.warn(`[chat] portal bridge ${base} HTTP ${res.status}: ${detail.slice(0, 200)}`);
        continue;
      }
      const data = (await res.json()) as { answer?: string };
      if (!data.answer?.trim()) continue;
      return { answer: data.answer.trim() };
    } catch (e) {
      console.warn(`[chat] portal bridge ${base} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}

/** Local Gemini fallback when the portal bridge is unavailable. */
async function answerLocally(messages: ChatMessage[]): Promise<{ answer: string }> {
  const settingsRows = await rest<Settings[]>(
    "website_ai_settings?id=eq.default&select=enabled,welcome_message,system_prompt&limit=1",
  );
  const settings = settingsRows?.[0];
  if (settings && settings.enabled === false) {
    return {
      answer:
        "Our online assistant is temporarily unavailable. Please call 020 3917 0260 or use the contact form at /contact.",
    };
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";
  if (!lastUser) {
    return { answer: "Please ask a question about our care services and I will do my best to help." };
  }

  const readyDocs = await rest<{ id: number }[]>(
    "website_ai_documents?status=eq.ready&select=id&limit=200",
  );
  const readyIds = new Set((readyDocs ?? []).map((d) => d.id));
  const chunks = await rest<{ document_id: number; content: string }[]>(
    "website_ai_chunks?select=document_id,content&order=id.asc&limit=800",
  );
  const pool = (chunks ?? []).filter((c) => readyIds.has(c.document_id));
  const greeting = isGreeting(lastUser);
  let top = greeting ? [] : rankChunks(lastUser, pool, 8);
  if (!greeting && top.length === 0 && pool.length > 0) top = pool.slice(0, 4);

  const knowledge = top.length
    ? top.map((c, i) => `[Excerpt ${i + 1}]\n${c.content}`).join("\n\n")
    : "(No matching knowledge-base excerpts were found.)";

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return {
      answer:
        "I cannot answer right now. Please call Unique Care UK on 020 3917 0260 or send a message via /contact.",
    };
  }

  const system = [
    settings?.system_prompt?.trim() || "You are the Unique Care UK website assistant.",
    GOVERNANCE,
    "Approved knowledge excerpts:",
    knowledge,
  ].join("\n\n");

  const google = createGoogleGenerativeAI({ apiKey });
  const models = [
    process.env.GEMINI_MODEL || "gemini-2.0-flash",
    ...(process.env.GEMINI_FALLBACK_MODELS ?? "gemini-flash-latest,gemini-flash-lite-latest")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
  ];
  let lastError: unknown;
  for (const model of [...new Set(models)]) {
    try {
      const result = await generateText({
        model: google(model),
        system,
        messages: messages.slice(-12).map((m) => ({
          role: m.role,
          content: m.content.slice(0, 4000),
        })),
        maxOutputTokens: 700,
        temperature: 0.35,
      });
      const answer =
        (result.text || "").trim()
        || "I do not have enough information to answer that confidently. Please contact Unique Care UK on 020 3917 0260 or via /contact.";
      return { answer };
    } catch (e) {
      lastError = e;
    }
  }
  console.error("[chat] local Gemini failed:", lastError instanceof Error ? lastError.message : lastError);
  return {
    answer:
      "I am having trouble responding right now. Please call 020 3917 0260 or use our contact form.",
  };
}

export async function answerChat(messages: ChatMessage[]): Promise<{ answer: string }> {
  const viaPortal = await answerViaPortal(messages);
  if (viaPortal) return viaPortal;
  return answerLocally(messages);
}
