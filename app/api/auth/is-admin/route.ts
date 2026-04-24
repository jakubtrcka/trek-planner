import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "../../../../lib/auth";
import { isAdmin } from "../../../../lib/db/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ isAdmin: false });
  return NextResponse.json({ isAdmin: await isAdmin(session.user.id) });
}
