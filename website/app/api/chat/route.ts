import { NextResponse } from "next/server";
import { z } from "zod";
import { answerChat } from "@/lib/chatbot";
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
    .max(20),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimitOk(`chat:${ip}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many messages. Please try again shortly." }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid chat payload" }, { status: 400 });
  }

  try {
    const { answer } = await answerChat(parsed.data.messages);
    return NextResponse.json({ answer });
  } catch (e) {
    console.error("[chat]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      {
        answer:
          "I am having trouble responding right now. Please call 020 3917 0260 or use our contact form.",
      },
      { status: 200 },
    );
  }
}
