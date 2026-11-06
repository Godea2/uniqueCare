import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { websiteSelect, websiteSelectOne } from "../lib/website-db";
import { rankChunks } from "../lib/website-kb-index";
import { AiMisconfigured, classifyAiError } from "./ai-client";
import { modelName } from "./provider";

export type ChatMessage = { role: "user" | "assistant"; content: string };

type AiSettingsRow = {
  id: string;
  enabled: boolean;
  welcome_message: string;
  system_prompt: string;
  updated_at: string;
  updated_by: string | null;
};

type ChunkRow = { id: number; document_id: number; content: string; chunk_index: number };

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) {
    throw new AiMisconfigured("GEMINI_API_KEY is not set. Add it on the server to enable the website assistant.");
  }
  return key;
}

/** Same fallback chain as recruitment scoring so the website reuses the working key/model. */
function chatModelChain(): string[] {
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-flash-latest,gemini-flash-lite-latest,gemini-2.0-flash")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([modelName(), ...fallbacks])];
}

const GOVERNANCE_FOOTER = `
CRITICAL GOVERNANCE (always apply):
- For greetings or small talk (e.g. "hi", "hello"), reply warmly in 1-2 short sentences and invite care-related questions. Do not invent service facts.
- For care questions, prefer the approved knowledge excerpts below. You may also use the system prompt company context.
- Do not invent prices, wait times, clinical advice, availability, or CQC claims that are not in the excerpts / prompt.
- If unsure or the excerpts do not cover the question, say you do not have that information and invite the visitor to contact Unique Care UK on 020 3917 0260 or via /contact.
- Never claim to book care or process applications yourself — guide them to the website forms or phone.
- Stay warm, professional, and concise (British English).
- After answering a substantive care question (not a pure greeting), end your reply with exactly this closing question on its own final line: Is there still anything else I can help you with?
`;

function isGreeting(text: string): boolean {
  return /^(hi|hello|hey|good\s+(morning|afternoon|evening)|thanks|thank you|ok|okay)\b[.!?]*$/i.test(text.trim());
}

export async function getWebsiteAiPublicConfig() {
  try {
    const row = await websiteSelectOne<AiSettingsRow>("website_ai_settings", { eq: { id: "default" } });
    return {
      enabled: row?.enabled !== false,
      welcomeMessage:
        row?.welcome_message
        || "Hello. Welcome to Unique Care UK. I'm here to help answer your questions about our care services, care assessments, and support options. How can I help you today?",
      updatedAt: row?.updated_at ?? null,
    };
  } catch {
    return {
      enabled: true,
      welcomeMessage:
        "Hello. Welcome to Unique Care UK. I'm here to help answer your questions about our care services, care assessments, and support options. How can I help you today?",
      updatedAt: null,
    };
  }
}

export async function answerWebsiteChat(opts: {
  messages: ChatMessage[];
  /** When true, ignore enabled flag (admin test console). */
  bypassEnabled?: boolean;
}): Promise<{ answer: string; usedChunks: number }> {
  let settings: AiSettingsRow | null = null;
  try {
    settings = await websiteSelectOne<AiSettingsRow>("website_ai_settings", { eq: { id: "default" } });
  } catch {
    settings = null;
  }

  if (!opts.bypassEnabled && settings && settings.enabled === false) {
    return {
      answer:
        "Our online assistant is temporarily unavailable. Please call 020 3917 0260 or use the contact form at /contact and our team will help you.",
      usedChunks: 0,
    };
  }

  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";
  if (!lastUser) {
    return { answer: "Please ask a question about our care services and I will do my best to help.", usedChunks: 0 };
  }

  let pool: ChunkRow[] = [];
  try {
    const allChunks = await websiteSelect<ChunkRow>("website_ai_chunks", {
      columns: "id, document_id, content, chunk_index",
      order: { column: "id", ascending: true },
      limit: 800,
    });
    const readyDocs = await websiteSelect<{ id: number }>("website_ai_documents", {
      columns: "id",
      eq: { status: "ready" },
      limit: 200,
    });
    const readyIds = new Set(readyDocs.map((d) => d.id));
    pool = allChunks.filter((c) => readyIds.has(c.document_id));
  } catch {
    pool = [];
  }

  const greeting = isGreeting(lastUser);
  let top = greeting ? [] : rankChunks(lastUser, pool, 8);
  // If nothing matched the query, still give the model a little general knowledge context.
  if (!greeting && top.length === 0 && pool.length > 0) {
    top = pool.slice(0, 4);
  }

  const knowledge = top.length
    ? top.map((c, i) => `[Excerpt ${i + 1}]\n${c.content}`).join("\n\n")
    : "(No matching knowledge-base excerpts were found for this question.)";

  const system = [
    settings?.system_prompt?.trim() || "You are the Unique Care UK website assistant.",
    GOVERNANCE_FOOTER,
    "Approved knowledge excerpts:",
    knowledge,
  ].join("\n\n");

  const history = opts.messages.slice(-12).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content.slice(0, 4000),
  }));

  const google = createGoogleGenerativeAI({ apiKey: apiKey() });
  let lastError: unknown;
  for (const model of chatModelChain()) {
    try {
      const result = await generateText({
        model: google(model),
        system,
        messages: history,
        maxOutputTokens: 700,
        temperature: 0.35,
        maxRetries: 0,
      });
      const answer = (result.text || "").trim()
        || "I do not have enough information to answer that confidently. Please contact Unique Care UK on 020 3917 0260 or via /contact.";
      return { answer, usedChunks: top.length };
    } catch (e) {
      lastError = e;
      const classified = classifyAiError(e);
      // Try next model only for overload / not-found style failures.
      if (!/overloaded|unavailable|not found|404|429|RESOURCE_EXHAUSTED/i.test(classified.message + String(e))) {
        throw classified;
      }
    }
  }
  throw classifyAiError(lastError);
}
