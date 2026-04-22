import { db } from "./index";
import { locations, locationAreas, areas } from "./schema";
import { eq, and } from "drizzle-orm";

export async function getLocationsByArea(moduleId: number, areaSlug: string) {
  return db
    .select()
    .from(locations)
    .innerJoin(locationAreas, eq(locationAreas.locationId, locations.id))
    .innerJoin(areas, and(eq(areas.id, locationAreas.areaId), eq(areas.moduleId, moduleId), eq(areas.slug, areaSlug)))
    .then((rows) => rows.map((r) => r.locations));
}

export async function getLocationAreaSlugsMap(moduleId: number): Promise<Map<number, string[]>> {
  const rows = await db
    .select({ locationId: locationAreas.locationId, slug: areas.slug })
    .from(locationAreas)
    .innerJoin(areas, and(eq(areas.id, locationAreas.areaId), eq(areas.moduleId, moduleId)));

  const map = new Map<number, string[]>();
  for (const row of rows) {
    const existing = map.get(row.locationId) ?? [];
    existing.push(row.slug);
    map.set(row.locationId, existing);
  }
  return map;
}
