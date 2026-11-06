/** Client-safe helpers for detecting end-of-chat wrap-up / decline. */

export const WRAP_UP_QUESTION = "Is there still anything else I can help you with?";

export function includesWrapUp(text: string): boolean {
  return /is there still anything else i can help you with\??/i.test(text);
}

/** User declined further help after the wrap-up question. */
export function isClosingReply(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!]+$/g, "");
  if (!t) return false;
  if (
    /^(no|nope|nah|no thanks|no thank you|nothing|nothing else|that's all|thats all|that is all|all good|i'm good|im good|i am good|not really|we're good|were good|done|finished)$/i.test(
      t,
    )
  ) {
    return true;
  }
  return /^(no|nope|nah)\b/.test(t) && t.length < 40;
}
