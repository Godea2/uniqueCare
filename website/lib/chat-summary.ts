import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { escapeHtml, sendEmail } from "@/lib/email";
import { portalBaseUrl } from "@/lib/portal-url";
import { WRAP_UP_QUESTION, includesWrapUp } from "@/lib/chat-close";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export { WRAP_UP_QUESTION, includesWrapUp, isClosingReply } from "@/lib/chat-close";

export function chatSummaryInbox(): string {
  return (process.env.CHAT_SUMMARY_TO || process.env.EMAIL_TO || "kaytoba49@gmail.com").trim();
}

/** Ensure the assistant reply ends with the wrap-up question (once). */
export function ensureWrapUp(answer: string, messages: ChatMessage[]): string {
  const userTurns = messages.filter((m) => m.role === "user").length;
  if (userTurns < 1) return answer;
  // Skip wrap-up on pure greeting-only threads until there is a real Q&A.
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  if (/^(hi|hello|hey|good\s+(morning|afternoon|evening))\b[.!?]*$/i.test(lastUser.trim()) && userTurns === 1) {
    return answer;
  }
  if (includesWrapUp(answer)) return answer;
  const trimmed = answer.trim();
  return `${trimmed}\n\n${WRAP_UP_QUESTION}`;
}

function transcriptHtml(messages: ChatMessage[]): string {
  const rows = messages
    .map((m) => {
      const who = m.role === "user" ? "Visitor" : "Assistant";
      return `<p style="margin:0 0 10px"><strong>${who}:</strong> ${escapeHtml(m.content).replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");
  return rows || "<p>(Empty conversation)</p>";
}

function transcriptText(messages: ChatMessage[]): string {
  return messages.map((m) => `${m.role === "user" ? "Visitor" : "Assistant"}: ${m.content}`).join("\n\n");
}

async function summariseWithAi(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return "AI summary unavailable (no Gemini key). See the full transcript below.";
  }
  try {
    const google = createGoogleGenerativeAI({ apiKey });
    const result = await generateText({
      model: google(process.env.GEMINI_MODEL || "gemini-2.0-flash"),
      system:
        "Summarise this Unique Care UK website chat for a care admin. British English. 4–8 short bullet points covering: visitor intent, services discussed, any follow-up needed, and urgency. Do not invent facts.",
      prompt: transcriptText(messages).slice(0, 12_000),
      maxOutputTokens: 500,
      temperature: 0.2,
    });
    return (result.text || "").trim() || "No summary generated.";
  } catch (e) {
    console.warn("[chat-summary] AI summarise failed:", e instanceof Error ? e.message : e);
    return "AI summary unavailable. See the full transcript below.";
  }
}

/**
 * Email a conversation summary to the admin inbox.
 * Returns false if email delivery failed (still safe to call once from the client).
 */
export async function emailChatSummary(messages: ChatMessage[]): Promise<{ ok: boolean }> {
  const usable = messages.filter((m) => m.content.trim());
  if (usable.length === 0) return { ok: false };

  const summary = await summariseWithAi(usable);
  const when = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
  const site = portalBaseUrl().includes("portal.")
    ? "https://www.uniquecareuk.com"
    : (process.env.NEXT_PUBLIC_SITE_URL || "https://www.uniquecareuk.com");

  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">
      <h2 style="margin:0 0 8px">Website chat summary</h2>
      <p style="margin:0 0 16px;color:#555">Ended ${escapeHtml(when)} (UK time). Source: ${escapeHtml(site)}</p>
      <h3 style="margin:0 0 8px">Summary</h3>
      <div style="margin:0 0 20px;padding:12px;background:#f6f8fa;border-radius:8px">${escapeHtml(summary).replace(/\n/g, "<br/>")}</div>
      <h3 style="margin:0 0 8px">Full conversation</h3>
      <div style="padding:12px;border:1px solid #e5e7eb;border-radius:8px">${transcriptHtml(usable)}</div>
    </div>
  `;

  const ok = await sendEmail({
    to: chatSummaryInbox(),
    subject: `Website chat summary — Unique Care UK (${when})`,
    html,
    text: `Website chat summary (${when})\n\n${summary}\n\n---\n\n${transcriptText(usable)}`,
  });
  return { ok };
}
