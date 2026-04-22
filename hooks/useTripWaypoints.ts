"use client";
import { useState, useEffect, useCallback } from "react";

type Waypoint = { id: number; tripId: number; locationId: number | null; lat: number; lon: number; name: string | null; order: number };

export function useTripWaypoints(tripId: number | null) {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const refetch = useCallback(async () => {
    if (tripId === null) { setWaypoints([]); return; }
    try {
      const res = await fetch(`/api/trips/${tripId}/waypoints`);
      if (!res.ok) return;
      const data = (await res.json()) as { waypoints: Waypoint[] };
      setWaypoints(data.waypoints ?? []);
    } catch { /* ignore */ }
  }, [tripId]);
  useEffect(() => { void refetch(); }, [refetch]);
  return { waypoints, refetch };
}
