import { NextResponse } from "next/server";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { upsertLocations } from "../../../lib/db/locations-repository";
import { linkLocationBySlug } from "../../../lib/db/areas-repository";
import { isAdmin } from "../../../lib/db/admin";
import { auth } from "../../../lib/auth";
import { headers } from "next/headers";
import { db } from "../../../lib/db/index";
import { locationTypes, modules } from "../../../lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PeakSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  altitude: z.number().nullable(),
  mountainLink: z.string().nullable(),
  externalId: z.string().nullable(),
  areaSlug: z.string().nullable(),
});

const PeaksFileSchema = z.object({
  scrapedAt: z.string(),
  countryCode: z.string(),
  peaks: z.array(PeakSchema),
});

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !await isAdmin(session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = z.object({ countryCode: z.string().default("cz") }).parse(
    await request.json().catch(() => ({}))
  );

  const dataFile = path.join(process.cwd(), "data", "peaks.json");
  if (!fs.existsSync(dataFile)) {
    return NextResponse.json({ error: "Soubor data/peaks.json neexistuje. Spusť lokálně: pnpm scrape:peaks" }, { status: 404 });
  }

  const raw = JSON.parse(fs.readFileSync(dataFile, "utf-8")) as unknown;
  const { peaks, countryCode, scrapedAt } = PeaksFileSchema.parse(raw);

  const [locType] = await db
    .select({ id: locationTypes.id, moduleId: modules.id })
    .from(locationTypes)
    .innerJoin(modules, eq(locationTypes.moduleId, modules.id))
    .where(eq(modules.slug, "mountains"))
    .limit(1);

  if (!locType) return NextResponse.json({ error: "Modul 'mountains' nebyl nalezen. Spusť seed." }, { status: 500 });

  const mapped = peaks.map((p) => ({
    name: p.name,
    lat: p.lat,
    lon: p.lon,
    altitude: p.altitude,
    externalUrl: p.mountainLink,
    externalId: p.externalId,
    countryCode: body.countryCode,
    metadata: p.mountainLink ? { mountainLink: p.mountainLink } : null,
  }));

  const upserted = await upsertLocations(mapped, locType.id);

  let linked = 0;
  for (const { id, lat, lon } of upserted) {
    const peak = peaks.find((p) => p.lat === lat && p.lon === lon);
    if (!peak?.areaSlug) continue;
    await linkLocationBySlug(locType.moduleId, peak.areaSlug, id);
    linked += 1;
  }

  console.log(`[sync-peaks] Hotovo: ${upserted.length} vrcholů, ${linked} propojeno. Soubor: ${scrapedAt}`);
  return NextResponse.json({ ok: true, synced: upserted.length, linked, scrapedAt, total: peaks.length });
}
