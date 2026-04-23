import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdmin(email: string): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  return adminEmails.includes(email);
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ isAdmin: false });
  return NextResponse.json({ isAdmin: isAdmin(session.user.email) });
}
