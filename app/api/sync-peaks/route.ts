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

const SyncRequestSchema = z.object({ countryCode: z.string().default("cz") });

export async function POST(request: Request) {
  try {
    const body = SyncRequestSchema.parse(await request.json().catch(() => ({})));
    const { countryCode } = body;

    const [locType] = await db
      .select({ id: locationTypes.id, moduleId: modules.id })
      .from(locationTypes)
      .innerJoin(modules, eq(locationTypes.moduleId, modules.id))
      .where(eq(modules.slug, "mountains"))
      .limit(1);

    if (!locType) {
      return NextResponse.json({ error: "Modul 'mountains' nebyl nalezen. Spusť seed." }, { status: 500 });
    }

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

    return NextResponse.json({ inserted: upserted.length, linked, total: points.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Neplatná data.", details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Neočekávaná chyba.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
