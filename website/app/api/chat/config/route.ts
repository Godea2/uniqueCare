import { NextResponse } from "next/server";
import { getChatPublicConfig } from "@/lib/chatbot";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET() {
  const config = await getChatPublicConfig();
  return NextResponse.json(config, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
