import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

export type ChatMessage = { role: "user" | "assistant"; content: string };

type Settings = {
  enabled: boolean;
  welcome_message: string;
  system_prompt: string;
};

const base = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_JOBS_SUPABASE_URL ?? "";
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function rest<T>(path: string): Promise<T | null> {
  if (!base() || !serviceKey()) return null;
  try {
    const res = await fetch(`${base()}/rest/v1/${path}`, {
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

function rankChunks(query: string, chunks: { content: string }[], limit = 6) {
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
      }
      return { ...c, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const FALLBACK_WELCOME =
  "Hello. Welcome to Unique Care UK. I'm here to help answer your questions about our care services, care assessments, and support options. How can I help you today?";

const GOVERNANCE = `
CRITICAL RULES:
- Answer ONLY from the knowledge excerpts and instructions below. Do not invent facts, prices, or clinical advice.
- If unsure, say you do not have that information and invite the visitor to call 020 3917 0260 or use /contact.
- For emergencies tell them to call 999.
- Stay warm, professional, concise (British English). Point to /services, /areas, /about, /contact when helpful.
`;

export async function getChatPublicConfig() {
  const rows = await rest<Settings[]>("website_ai_settings?id=eq.default&select=enabled,welcome_message,system_prompt&limit=1");
  const row = rows?.[0];
  return {
    enabled: row ? row.enabled !== false : true,
    welcomeMessage: row?.welcome_message || FALLBACK_WELCOME,
  };
}

export async function answerChat(messages: ChatMessage[]): Promise<{ answer: string }> {
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
    "website_ai_chunks?select=document_id,content&order=id.asc&limit=400",
  );
  const pool = (chunks ?? []).filter((c) => readyIds.has(c.document_id));
  const top = rankChunks(lastUser, pool, 6);
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
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const result = await generateText({
    model: google(model),
    system,
    messages: messages.slice(-12).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 4000),
    })),
    maxOutputTokens: 700,
    temperature: 0.3,
  });

  const answer =
    (result.text || "").trim()
    || "I do not have enough information to answer that confidently. Please contact Unique Care UK on 020 3917 0260 or via /contact.";
  return { answer };
}
