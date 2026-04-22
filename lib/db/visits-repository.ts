import { db } from "./index";
import { userVisits, locations, locationTypes, modules } from "./schema";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";

export type VisitInput = { userId: string; externalId: string; visitedAt: Date; count: number; rawDates: string[] };

const MetadataSchema = z.object({ rawDates: z.array(z.string()).default([]) });

export async function upsertUserVisits(inputs: VisitInput[]): Promise<void> {
  for (let i = 0; i < inputs.length; i += 100) {
    const batch = inputs.slice(i, i + 100);
    const locs = await db.select({ id: locations.id, externalId: locations.externalId })
      .from(locations).where(inArray(locations.externalId, batch.map((inp) => inp.externalId)));
    const locMap = new Map(locs.map((l) => [l.externalId, l.id]));
    for (const inp of batch) {
      const locationId = locMap.get(inp.externalId);
      if (!locationId) continue;
      await db.insert(userVisits)
        .values({ userId: inp.userId, locationId, visitedAt: inp.visitedAt, count: inp.count, metadata: { rawDates: inp.rawDates } })
        .onConflictDoUpdate({
          target: [userVisits.userId, userVisits.locationId],
          set: { visitedAt: inp.visitedAt, count: inp.count, metadata: { rawDates: inp.rawDates } },
        });
    }
  }
}

export async function getUserVisitsByModule(userId: string, moduleSlug: string): Promise<Map<string, { count: number; dates: string[] }>> {
  const rows = await db
    .select({ externalId: locations.externalId, count: userVisits.count, metadata: userVisits.metadata })
    .from(userVisits)
    .innerJoin(locations, eq(userVisits.locationId, locations.id))
    .innerJoin(locationTypes, eq(locations.typeId, locationTypes.id))
    .innerJoin(modules, eq(locationTypes.moduleId, modules.id))
    .where(and(eq(userVisits.userId, userId), eq(modules.slug, moduleSlug)));
  const result = new Map<string, { count: number; dates: string[] }>();
  for (const row of rows) {
    if (!row.externalId) continue;
    const meta = MetadataSchema.safeParse(row.metadata);
    result.set(row.externalId, { count: row.count, dates: meta.success ? meta.data.rawDates : [] });
  }
  return result;
}

export type UserVisitEntry = { locationId: string; count: number; visitedAt: string };

export async function getUserVisits(userId: string): Promise<UserVisitEntry[]> {
  const rows = await db
    .select({ externalId: locations.externalId, count: userVisits.count, visitedAt: userVisits.visitedAt })
    .from(userVisits)
    .innerJoin(locations, eq(userVisits.locationId, locations.id))
    .where(eq(userVisits.userId, userId));
  return rows.flatMap((row) =>
    row.externalId
      ? [{ locationId: row.externalId, count: row.count, visitedAt: (row.visitedAt ?? new Date()).toISOString() }]
      : []
  );
}
