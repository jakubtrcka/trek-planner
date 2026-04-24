import { NextResponse } from "next/server";
import { z } from "zod";
import { HoryScraperService } from "../../../providers/hory/HoryScraperService";
import { upsertLocations } from "../../../lib/db/locations-repository";
import { linkLocationBySlug } from "../../../lib/db/areas-repository";
import { resolveHoryCredentials } from "../../../lib/hory-auth";
import { db } from "../../../lib/db/index";
import { locationTypes, modules } from "../../../lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let syncRunning = false;

async function runSync(countryCode: string) {
  const [locType] = await db
    .select({ id: locationTypes.id, moduleId: modules.id })
    .from(locationTypes)
    .innerJoin(modules, eq(locationTypes.moduleId, modules.id))
    .where(eq(modules.slug, "mountains"))
    .limit(1);

  if (!locType) throw new Error("Modul 'mountains' nebyl nalezen. Spusť seed.");

  const credentials = resolveHoryCredentials();
  const service = new HoryScraperService(credentials);
  const { points } = await service.scrapeMapPoints({
    targetUrl: process.env.HORY_TARGET_URL ?? "https://cs.hory.app/country/czech-republic",
  });

  const peakIdFromUrl = (url: string | null): string | null => {
    if (!url) return null;
    const m = url.match(/\/mountain\/(\d+)-/);
    return m ? m[1] : null;
  };

  const slugFromSource = (source: string | undefined): string | null => {
    if (!source) return null;
    try {
      const pathname = new URL(source).pathname;
      const match = pathname.match(/^\/area\/([^/]+)/);
      return match ? match[1] : null;
    } catch { return null; }
  };

  const areaSlugByLatLon = new Map<string, string>();
  const mapped = points.map((p) => {
    const slug = slugFromSource(p.source);
    if (slug) areaSlugByLatLon.set(`${p.lat}:${p.lon}`, slug);
    return {
      name: p.peakName ?? p.name ?? "Neznámý vrchol",
      lat: p.lat,
      lon: p.lon,
      altitude: typeof p.altitude === "number" ? p.altitude : null,
      externalUrl: p.mountainLink ?? null,
      externalId: peakIdFromUrl(p.mountainLink ?? null),
      countryCode,
      metadata: p.mountainLink ? { mountainLink: p.mountainLink } : null,
    };
  });

  const upserted = await upsertLocations(mapped, locType.id);

  let linked = 0;
  for (const { id, lat, lon } of upserted) {
    const slug = areaSlugByLatLon.get(`${lat}:${lon}`);
    if (!slug) continue;
    await linkLocationBySlug(locType.moduleId, slug, id);
    linked += 1;
  }

  console.log(`[sync-peaks] Hotovo: ${upserted.length} vrcholů, ${linked} propojeno.`);
}

export async function POST(request: Request) {
  if (syncRunning) {
    return NextResponse.json({ status: "already_running" }, { status: 202 });
  }

  const body = z.object({ countryCode: z.string().default("cz") }).parse(
    await request.json().catch(() => ({}))
  );

  syncRunning = true;
  runSync(body.countryCode)
    .catch((err) => console.error("[sync-peaks] Chyba:", (err as Error).message))
    .finally(() => { syncRunning = false; });

  return NextResponse.json({ status: "started" }, { status: 202 });
}
