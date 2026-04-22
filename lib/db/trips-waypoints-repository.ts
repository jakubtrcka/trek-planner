import { db } from "./index";
import { trips, tripWaypoints } from "./schema";
import { and, eq, inArray } from "drizzle-orm";

export async function deleteWaypoint(tripId: number, userId: string, waypointId: number): Promise<boolean> {
  const [trip] = await db.select({ id: trips.id }).from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)));
  if (!trip) return false;
  const result = await db.delete(tripWaypoints)
    .where(and(eq(tripWaypoints.id, waypointId), eq(tripWaypoints.tripId, tripId)))
    .returning({ id: tripWaypoints.id });
  return result.length > 0;
}

export async function reorderWaypoints(tripId: number, userId: string, orderedIds: number[]): Promise<boolean> {
  const [trip] = await db.select({ id: trips.id }).from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)));
  if (!trip) return false;
  const existing = await db.select({ id: tripWaypoints.id }).from(tripWaypoints)
    .where(and(eq(tripWaypoints.tripId, tripId), inArray(tripWaypoints.id, orderedIds)));
  if (existing.length !== orderedIds.length) return false;
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.update(tripWaypoints).set({ order: i }).where(eq(tripWaypoints.id, orderedIds[i]!));
    }
  });
  return true;
}
