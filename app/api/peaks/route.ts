import { NextResponse } from "next/server";
import { getAllLocations, getLocationsByCountry } from "../../../lib/db/locations-repository";
import { getLocationAreaSlugsMap } from "../../../lib/db/locations-area-repository";
import { db } from "../../../lib/db/index";
import { modules } from "../../../lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const countryCode = searchParams.get("country");

    const [mod] = await db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.slug, "mountains"))
      .limit(1);

    const [rawLocations, areaSlugsMap] = await Promise.all([
      countryCode ? getLocationsByCountry(countryCode) : getAllLocations(),
      mod ? getLocationAreaSlugsMap(mod.id) : Promise.resolve(new Map<number, string[]>()),
    ]);

    const locations = rawLocations.map((loc) => ({
      ...loc,
      areaSlugs: areaSlugsMap.get(loc.id) ?? [],
    }));

    return NextResponse.json({ locations, count: locations.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chyba při načítání lokalit.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
