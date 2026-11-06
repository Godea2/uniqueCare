import { NextResponse } from "next/server";
import { z } from "zod";
import { emailChatSummary } from "@/lib/chat-summary";
import { clientIp, rateLimitOk } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
  reason: z.enum(["user_declined", "idle_timeout", "closed"]).optional(),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimitOk(`chat-summary:${ip}`, 8, 30 * 60_000)) {
    return NextResponse.json({ error: "Too many summary requests." }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid summary payload" }, { status: 400 });
  }

  // Need at least one visitor message to be worth emailing.
  if (!parsed.data.messages.some((m) => m.role === "user")) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const { ok } = await emailChatSummary(parsed.data.messages);
    return NextResponse.json({ ok, reason: parsed.data.reason ?? "unknown" });
  } catch (e) {
    console.error("[chat/summary]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
