import { NextResponse } from "next/server";
import { getAllLocationsByModule } from "../../../lib/db/locations-repository";
import { db } from "../../../lib/db/index";
import { modules, locationTypes, locations } from "../../../lib/db/schema";
import { eq, count } from "drizzle-orm";
import { ensureDbInitialized } from "../../../lib/db/lazy-init";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let castlesSyncStarted = false;

export async function GET() {
  try {
    await ensureDbInitialized();

    const [mod] = await db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.slug, "castles"))
      .limit(1);

    if (!mod) {
      return NextResponse.json({ locations: [], count: 0 });
    }

    const allLocations = await getAllLocationsByModule(mod.id);

    if (allLocations.length === 0 && !castlesSyncStarted) {
      castlesSyncStarted = true;
      syncCastles(mod.id).catch((err) => {
        castlesSyncStarted = false;
        console.error("[castles] Auto-sync selhal:", err);
      });
    }

    return NextResponse.json({ locations: allLocations, count: allLocations.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chyba při načítání zámků.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

async function syncCastles(moduleId: number) {
  const [locType] = await db
    .select({ id: locationTypes.id })
    .from(locationTypes)
    .where(eq(locationTypes.moduleId, moduleId))
    .limit(1);

  if (!locType) return;

  const [{ total }] = await db
    .select({ total: count() })
    .from(locations)
    .where(eq(locations.typeId, locType.id));

  if (total > 0) {
    console.log(`[castles] Zámky již v DB (${total}), sync přeskočen.`);
    return;
  }

  console.log("[castles] Spouštím auto-sync z Overpassu...");
  const { CastlesScraperService } = await import("../../../providers/castles/CastlesScraperService");
  const { CastlesParserService } = await import("../../../providers/castles/CastlesParserService");
  const { upsertLocations } = await import("../../../lib/db/locations-repository");

  const rawCastles = await new CastlesScraperService().scrape();
  const castles = new CastlesParserService().parseRaw(rawCastles);
  const mapped = castles.map((c) => ({
    name: c.name,
    lat: c.lat,
    lon: c.lon,
    externalId: c.external_id,
    externalUrl: c.external_url,
    metadata: Object.keys(c.metadata).length > 0 ? c.metadata : null,
  }));

  const upserted = await upsertLocations(mapped, locType.id);
  console.log(`[castles] Auto-sync dokončen: ${upserted.length} zámků uloženo.`);
}
