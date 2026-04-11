import { NextResponse } from "next/server";
import { getStoredHoryCredentials } from "../../../lib/hory-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const stored = getStoredHoryCredentials();

  return NextResponse.json({
    hasStoredCredentials: stored.hasCredentials
  });
}
