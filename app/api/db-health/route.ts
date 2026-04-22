import { NextResponse } from "next/server";
import { db } from "../../../lib/db/index";
import { locations } from "../../../lib/db/schema";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await db.select({ count: sql<number>`count(*)` }).from(locations);
    return NextResponse.json({ ok: true, locationCount: Number(result[0].count) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DB nedostupná.";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
