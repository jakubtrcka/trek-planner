import { db } from "./index";
import { areas, locationAreas } from "./schema";
import { eq, and } from "drizzle-orm";

export async function linkLocationBySlug(
  moduleId: number,
  slug: string,
  locationId: number
): Promise<void> {
  const [area] = await db
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.moduleId, moduleId), eq(areas.slug, slug)))
    .limit(1);

  if (!area) {
    console.warn(`[areas] Area not found for slug="${slug}" moduleId=${moduleId} — skipping link.`);
    return;
  }

  await unlinkAllAreasFromLocation(locationId);
  await linkLocationToArea(locationId, area.id);
}

export type AreaRow = { id: number; slug: string; name: string; sourceUrl: string | null };

export async function getAreas(moduleId: number): Promise<AreaRow[]> {
  return db
    .select({ id: areas.id, slug: areas.slug, name: areas.name, sourceUrl: areas.sourceUrl })
    .from(areas)
    .where(eq(areas.moduleId, moduleId));
}

export async function upsertArea(
  moduleId: number,
  slug: string,
  name: string,
  sourceUrl?: string
): Promise<AreaRow> {
  const [row] = await db
    .insert(areas)
    .values({ moduleId, slug, name, sourceUrl: sourceUrl ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [areas.moduleId, areas.slug],
      set: { name, sourceUrl: sourceUrl ?? null, updatedAt: new Date() },
    })
    .returning({ id: areas.id, slug: areas.slug, name: areas.name, sourceUrl: areas.sourceUrl });
  return row;
}

export async function linkLocationToArea(locationId: number, areaId: number): Promise<void> {
  await db
    .insert(locationAreas)
    .values({ locationId, areaId })
    .onConflictDoNothing();
}

export async function unlinkAllAreasFromLocation(locationId: number): Promise<void> {
  await db.delete(locationAreas).where(eq(locationAreas.locationId, locationId));
}
