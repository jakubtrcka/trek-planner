import { NextResponse } from "next/server";
import { db } from "../../../lib/db/index";
import { modules } from "../../../lib/db/schema";
import { eq } from "drizzle-orm";
import { getAreas } from "../../../lib/db/areas-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [mod] = await db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.slug, "mountains"))
      .limit(1);

    if (!mod) {
      return NextResponse.json({ error: "Modul 'mountains' nenalezen." }, { status: 500 });
    }

    const areas = await getAreas(mod.id);
    return NextResponse.json({ areas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chyba při načítání oblastí.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
