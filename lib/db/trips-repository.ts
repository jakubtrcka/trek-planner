import { db } from "./index";
import { trips, tripWaypoints, locations } from "./schema";
import { and, eq } from "drizzle-orm";

export type TripSelect = typeof trips.$inferSelect;
export type WaypointSelect = typeof tripWaypoints.$inferSelect;

export async function createTrip(userId: string, name: string): Promise<TripSelect> {
  const [row] = await db.insert(trips).values({ userId, name }).returning();
  if (!row) throw new Error("Failed to create trip");
  return row;
}

export async function getTripsByUser(userId: string): Promise<TripSelect[]> {
  return db.select().from(trips).where(eq(trips.userId, userId));
}

export async function addWaypoint(
  tripId: number,
  locationId: number,
  order: number
): Promise<void> {
  const [loc] = await db.select({ lat: locations.lat, lon: locations.lon, name: locations.name })
    .from(locations).where(eq(locations.id, locationId));
  if (!loc) throw new Error(`Location ${locationId} not found`);
  await db.insert(tripWaypoints).values({ tripId, locationId, lat: loc.lat, lon: loc.lon, name: loc.name, order });
}

export async function getWaypointsByTrip(tripId: number): Promise<WaypointSelect[]> {
  return db.select().from(tripWaypoints).where(eq(tripWaypoints.tripId, tripId));
}

export async function updateTripAiSummary(tripId: number, summary: string): Promise<void> {
  await db.update(trips).set({ aiSummary: summary }).where(eq(trips.id, tripId));
}

export async function getTripById(id: number, userId: string): Promise<TripSelect | null> {
  const [row] = await db.select().from(trips).where(and(eq(trips.id, id), eq(trips.userId, userId)));
  return row ?? null;
}

export async function updateTrip(
  id: number,
  userId: string,
  patch: { name?: string; notes?: string }
): Promise<TripSelect | null> {
  const [row] = await db.update(trips).set(patch).where(and(eq(trips.id, id), eq(trips.userId, userId))).returning();
  return row ?? null;
}

export async function deleteTrip(id: number, userId: string): Promise<boolean> {
  const result = await db.delete(trips).where(and(eq(trips.id, id), eq(trips.userId, userId))).returning({ id: trips.id });
  return result.length > 0;
}
