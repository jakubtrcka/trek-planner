import { db } from "./index";
import { locations, locationTypes } from "./schema";
import { and, eq, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

export type Location = InferSelectModel<typeof locations>;

export async function getAllLocations(limit = 20000): Promise<Location[]> {
  return db.select().from(locations).limit(limit);
}

export async function getLocationsByCountry(countryCode: string): Promise<Location[]> {
  return db.select().from(locations).where(eq(locations.countryCode, countryCode));
}

export async function getAllLocationsByModule(moduleId: number, limit = 20000): Promise<Location[]> {
  const rows = await db.select().from(locations)
    .innerJoin(locationTypes, eq(locationTypes.id, locations.typeId))
    .where(eq(locationTypes.moduleId, moduleId)).limit(limit);
  return rows.map((r) => r.locations);
}

export async function getLocationsByModuleAndCountry(moduleId: number, countryCode: string, limit = 20000): Promise<Location[]> {
  const rows = await db.select().from(locations)
    .innerJoin(locationTypes, eq(locationTypes.id, locations.typeId))
    .where(and(eq(locationTypes.moduleId, moduleId), eq(locations.countryCode, countryCode)))
    .limit(limit);
  return rows.map((r) => r.locations);
}

export type UpsertedLocation = { id: number; lat: number; lon: number };

export async function upsertLocations(
  points: Array<{
    name: string; lat: number; lon: number; altitude?: number | null;
    externalUrl?: string | null; externalId?: string | null; countryCode?: string | null; metadata?: Record<string, unknown> | null;
  }>,
  typeId: number,
  sourceId?: number
): Promise<UpsertedLocation[]> {
  if (points.length === 0) return [];
  const BATCH = 500;
  const result: UpsertedLocation[] = [];
  for (let i = 0; i < points.length; i += BATCH) {
    const batch = points.slice(i, i + BATCH).map((p) => ({
      typeId,
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      altitude: p.altitude ?? null,
      externalUrl: p.externalUrl ?? null,
      externalId: p.externalId ?? null,
      countryCode: p.countryCode ?? null,
      metadata: p.metadata ?? null,
      sourceId: sourceId ?? null,
    }));
    const rows = await db.insert(locations).values(batch)
      .onConflictDoUpdate({
        target: [locations.lat, locations.lon],
        set: { name: locations.name, altitude: locations.altitude, externalId: sql`EXCLUDED.external_id`, updatedAt: new Date() },
      })
      .returning({ id: locations.id, lat: locations.lat, lon: locations.lon });
    result.push(...rows);
  }
  return result;
}
