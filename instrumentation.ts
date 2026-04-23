export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { db } = await import("./lib/db/index");

  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("[startup] Migrace hotové.");

  const { seedModules } = await import("./lib/db/seed");
  await seedModules();
  console.log("[startup] Seed hotový.");

  syncCastlesIfEmpty().catch((err) =>
    console.error("[startup] Auto-sync zámků selhal:", err)
  );
}

async function syncCastlesIfEmpty() {
  const { db } = await import("./lib/db/index");
  const { locationTypes, modules, locations } = await import("./lib/db/schema");
  const { eq, count } = await import("drizzle-orm");

  const [locType] = await db
    .select({ id: locationTypes.id })
    .from(locationTypes)
    .innerJoin(modules, eq(locationTypes.moduleId, modules.id))
    .where(eq(modules.slug, "castles"))
    .limit(1);

  if (!locType) return;

  const [{ total }] = await db
    .select({ total: count() })
    .from(locations)
    .where(eq(locations.typeId, locType.id));

  if (total > 0) {
    console.log(`[startup] Zámky již v DB (${total}), sync přeskočen.`);
    return;
  }

  console.log("[startup] Žádné zámky v DB, spouštím auto-sync z Overpassu...");
  const { CastlesScraperService } = await import("./providers/castles/CastlesScraperService");
  const { CastlesParserService } = await import("./providers/castles/CastlesParserService");
  const { upsertLocations } = await import("./lib/db/locations-repository");

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
  console.log(`[startup] Auto-sync dokončen: ${upserted.length} zámků uloženo.`);
}
