import { NextResponse } from "next/server";
import { loginAdmin } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = (body.email ?? "").trim();
    const password = body.password ?? "";
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    const session = await loginAdmin(email, password);
    await writeAudit({
      action: "admin.login",
      entityType: "admin_user",
      entityId: session.userId,
      details: { email: session.email },
    });
    return NextResponse.json({ ok: true, email: session.email });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Login failed" },
      { status: status === 401 ? 401 : 500 },
    );
  }
}
