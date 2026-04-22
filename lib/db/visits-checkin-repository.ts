import { db } from "./index";
import { userVisits, locations } from "./schema";
import { eq, and } from "drizzle-orm";

export type VisitUpsertResult = { id: number; locationId: number; count: number; visitedAt: Date | null };

export async function upsertVisit(userId: string, locationId: number, visitedAt?: Date): Promise<VisitUpsertResult | null> {
  const now = visitedAt ?? new Date();
  const [existing] = await db.select().from(userVisits)
    .where(and(eq(userVisits.userId, userId), eq(userVisits.locationId, locationId)));
  if (existing) {
    const [updated] = await db.update(userVisits)
      .set({ count: existing.count + 1, visitedAt: now })
      .where(and(eq(userVisits.userId, userId), eq(userVisits.locationId, locationId)))
      .returning({ id: userVisits.id, locationId: userVisits.locationId, count: userVisits.count, visitedAt: userVisits.visitedAt });
    return updated ?? null;
  }
  const [inserted] = await db.insert(userVisits)
    .values({ userId, locationId, visitedAt: now, count: 1 })
    .returning({ id: userVisits.id, locationId: userVisits.locationId, count: userVisits.count, visitedAt: userVisits.visitedAt });
  return inserted ?? null;
}

export async function deleteVisit(userId: string, locationId: number): Promise<boolean> {
  const result = await db.delete(userVisits)
    .where(and(eq(userVisits.userId, userId), eq(userVisits.locationId, locationId)));
  return (result.rowCount ?? 0) > 0;
}

export async function findLocationIdByExternalId(externalId: string): Promise<number | null> {
  const [loc] = await db.select({ id: locations.id })
    .from(locations).where(eq(locations.externalId, externalId));
  return loc?.id ?? null;
}
