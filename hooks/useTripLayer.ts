"use client";
import { MutableRefObject, useEffect } from "react";
import type { MapPoint } from "../lib/types";

type WaypointData = { lat: number; lon: number; order: number; locationId: number | null };

interface TripLayerParams {
  activeTripId: number | null;
  mapReady: boolean;
  waypointStatus: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  leafletRef: MutableRefObject<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  areaSelectMapRef: MutableRefObject<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tripLayerRef: MutableRefObject<any>;
  locationIdToPeak: Map<number, MapPoint>;
  setSelectedPeak: (p: MapPoint | null) => void;
}

export function useTripLayer({
  activeTripId, mapReady, waypointStatus,
  leafletRef, areaSelectMapRef, tripLayerRef,
  locationIdToPeak, setSelectedPeak,
}: TripLayerParams): void {
  useEffect(() => {
    const L = leafletRef.current;
    const map = areaSelectMapRef.current;
    if (!mapReady || !L || !map) return;

    if (!tripLayerRef.current) tripLayerRef.current = L.layerGroup().addTo(map);
    tripLayerRef.current.clearLayers();

    if (!activeTripId) return;

    let cancelled = false;
    async function draw() {
      const res = await fetch(`/api/trips/${activeTripId}/waypoints`);
      if (cancelled || !res.ok) return;
      const data = (await res.json()) as { waypoints: WaypointData[] };
      const wps = [...data.waypoints].sort((a, b) => a.order - b.order);
      if (!tripLayerRef.current || !leafletRef.current) return;
      tripLayerRef.current.clearLayers();

      if (wps.length >= 2) {
        leafletRef.current.polyline(wps.map((w) => [w.lat, w.lon] as [number, number]), {
          color: "#f97316", weight: 4, opacity: 0.85, dashArray: "8 4",
        }).addTo(tripLayerRef.current);
      }

      for (const wp of wps) {
        const m = leafletRef.current.circleMarker([wp.lat, wp.lon], {
          radius: 7, color: "#f97316", weight: 2.5, fillColor: "#fff", fillOpacity: 1, zIndexOffset: 200,
        });
        if (wp.locationId !== null) {
          const peak = locationIdToPeak.get(wp.locationId);
          if (peak) m.on("click", () => setSelectedPeak(peak));
        }
        m.addTo(tripLayerRef.current);
      }
    }
    void draw();
    return () => { cancelled = true; };
  }, [activeTripId, mapReady, waypointStatus]); // eslint-disable-line react-hooks/exhaustive-deps
}
