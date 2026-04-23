import { NextResponse } from "next/server";
import { getAllLocationsByModule } from "../../../lib/db/locations-repository";
import { db } from "../../../lib/db/index";
import { modules } from "../../../lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [mod] = await db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.slug, "castles"))
      .limit(1);

    if (!mod) {
      return NextResponse.json({ locations: [], count: 0 });
    }

    const locations = await getAllLocationsByModule(mod.id);
    return NextResponse.json({ locations, count: locations.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chyba při načítání zámků.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
