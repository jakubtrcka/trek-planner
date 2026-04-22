"use client";
import { useState, useEffect, useCallback } from "react";

type Trip = { id: number; name: string; aiSummary: string | null; createdAt: string };

export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/trips");
      const data = (await res.json()) as { trips: Trip[] };
      setTrips(data.trips ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refetch(); }, [refetch]);
  const createTrip = useCallback(async (name: string): Promise<Trip | null> => {
    const res = await fetch("/api/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (!res.ok) return null;
    const data = (await res.json()) as { trip: Trip };
    await refetch();
    return data.trip;
  }, [refetch]);
  const renameTrip = useCallback(async (id: number, name: string): Promise<boolean> => {
    const res = await fetch(`/api/trips/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (!res.ok) return false;
    await refetch();
    return true;
  }, [refetch]);
  const deleteTrip = useCallback(async (id: number): Promise<boolean> => {
    const res = await fetch(`/api/trips/${id}`, { method: "DELETE" });
    if (!res.ok) return false;
    await refetch();
    return true;
  }, [refetch]);
  return { trips, count: trips.length, loading, createTrip, renameTrip, deleteTrip, refetch };
}
