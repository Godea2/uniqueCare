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

const GOVERNANCE_FOOTER = `
CRITICAL GOVERNANCE (always apply):
- Use ONLY the knowledge excerpts and system instructions below. Do not invent facts, prices, wait times, or clinical advice.
- If unsure or the excerpts do not cover the question, say you do not have that information and invite the visitor to contact Unique Care UK on 020 3917 0260 or via /contact.
- Never claim to book care or process applications yourself — guide them to the website forms or phone.
- Stay warm, professional, and concise.
`;

export async function getWebsiteAiPublicConfig() {
  const row = await websiteSelectOne<AiSettingsRow>("website_ai_settings", { eq: { id: "default" } });
  return {
    enabled: row?.enabled !== false,
    welcomeMessage:
      row?.welcome_message
      || "Hello. Welcome to Unique Care UK. I'm here to help answer your questions about our care services, care assessments, and support options. How can I help you today?",
    updatedAt: row?.updated_at ?? null,
  };
}

export async function answerWebsiteChat(opts: {
  messages: ChatMessage[];
  /** When true, ignore enabled flag (admin test console). */
  bypassEnabled?: boolean;
}): Promise<{ answer: string; usedChunks: number }> {
  const settings = await websiteSelectOne<AiSettingsRow>("website_ai_settings", { eq: { id: "default" } });
  if (!opts.bypassEnabled && settings && settings.enabled === false) {
    return {
      answer:
        "Our online assistant is temporarily unavailable. Please call 020 3917 0260 or use the contact form at /contact and our team will help you.",
      usedChunks: 0,
    };
  }

  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";
  if (!lastUser) return { answer: "Please ask a question about our care services and I will do my best to help.", usedChunks: 0 };

  const allChunks = await websiteSelect<ChunkRow>("website_ai_chunks", {
    columns: "id, document_id, content, chunk_index",
    order: { column: "id", ascending: true },
    limit: 400,
  });

  // Only chunks from ready documents
  const readyDocs = await websiteSelect<{ id: number }>("website_ai_documents", {
    columns: "id",
    eq: { status: "ready" },
    limit: 200,
  });
  const readyIds = new Set(readyDocs.map((d) => d.id));
  const pool = allChunks.filter((c) => readyIds.has(c.document_id));
  const top = rankChunks(lastUser, pool, 6);

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

  try {
    const google = createGoogleGenerativeAI({ apiKey: apiKey() });
    const result = await generateText({
      model: google(modelName()),
      system,
      messages: history,
      maxOutputTokens: 700,
      temperature: 0.3,
    });
    const answer = (result.text || "").trim()
      || "I do not have enough information to answer that confidently. Please contact Unique Care UK on 020 3917 0260 or via /contact.";
    return { answer, usedChunks: top.length };
  } catch (e) {
    const classified = classifyAiError(e);
    throw classified;
  }
}
