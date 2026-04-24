import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { CastlesParserService } from "../../../providers/castles/CastlesParserService";
import { upsertLocations } from "../../../lib/db/locations-repository";
import { db } from "../../../lib/db/index";
import { locationTypes, modules } from "../../../lib/db/schema";
import { eq } from "drizzle-orm";
import { isAdmin } from "../../../lib/db/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !await isAdmin(session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [locType] = await db
      .select({ id: locationTypes.id })
      .from(locationTypes)
      .innerJoin(modules, eq(locationTypes.moduleId, modules.id))
      .where(eq(modules.slug, "castles"))
      .limit(1);

    if (!locType) {
      return NextResponse.json({ error: "Modul 'castles' nebyl nalezen. Spusť seed." }, { status: 500 });
    }

    const parser = new CastlesParserService();
    const castles = parser.parse();

    const mapped = castles.map((c) => ({
      name: c.name,
      lat: c.lat,
      lon: c.lon,
      externalId: c.external_id,
      externalUrl: c.external_url,
      metadata: Object.keys(c.metadata).length > 0 ? c.metadata : null,
    }));

    const upserted = await upsertLocations(mapped, locType.id);

    return NextResponse.json({ inserted: upserted.length, total: castles.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Neočekávaná chyba.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
