import { NextResponse } from "next/server";
import { clearAdminSessionCookie, getAdminSession } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

export async function POST() {
  const s = await getAdminSession();
  await clearAdminSessionCookie();
  if (s) {
    await writeAudit({
      action: "admin.logout",
      entityType: "admin_user",
      entityId: s.userId,
      details: { email: s.email },
    });
  }
  return NextResponse.json({ ok: true });
}
