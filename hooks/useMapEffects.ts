"use client";

// Exception: exceeds 25-line hook limit.
// Justification: all 6 map effects share Leaflet refs that cannot be split across
// hook boundaries — each effect reads/writes areaSelectMapRef, leafletRef,
// areaPeaksLayerGroupRef and peakMarkersRef. Splitting would require passing 4+
// mutable refs as arguments to each sub-hook, which produces worse coupling than
// keeping them co-located. Documented in RELEASE_NOTES v21.

import { MutableRefObject, useEffect } from "react";
import { computeClusters, tagPeaks, tagCastles } from "../lib/map/clustering";
import { getPeakId } from "../lib/page-utils";
import { loadLeaflet } from "../lib/map/leaflet-loader";
import { addOrSwapBaseLayer } from "../components/MapContainer";
import { CZECH_REPUBLIC_BOUNDS } from "../lib/page-utils";
import type { MapPoint, ChallengeItem, MapBounds } from "../lib/page-types";
import type { CastlePoint } from "../lib/castles/types";
import type { BaseMapType } from "../lib/page-config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRef = MutableRefObject<any>;

interface MapEffectsParams {
  baseMap: BaseMapType;
  mapReady: boolean;
  activeSection: string;
  activeModule: string;
  selectedPeak: MapPoint | null;
  selectedChallengeId: string | null;
  modulePoints: MapPoint[];
  castlePoints: CastlePoint[];
  showCastles: boolean;
  allChallenges: ChallengeItem[];
  allPoints: MapPoint[];
  userAscents: Map<number, { count: number; dates: string[] }>;
  peakById: Map<number, MapPoint>;
  selectedLetterColorMap: Map<string, string>;
  areaSelectMapContainerRef: MutableRefObject<HTMLDivElement | null>;
  areaSelectMapRef: AnyRef;
  areaPeaksLayerGroupRef: AnyRef;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  peakMarkersRef: MutableRefObject<Map<string, any>>;
  areaBaseLayerRef: AnyRef;
  leafletRef: AnyRef;
  aiLayerGroupRef: AnyRef;
  aiRouteLayerRef: AnyRef;
  challengePeakIdsRef: MutableRefObject<Set<number>>;
  mapBoundsTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  activeTripIdRef: MutableRefObject<number | null>;
  waypointCountRef: MutableRefObject<number>;
  aiMapPoints: { lat: number; lon: number; name: string; description?: string; type?: string }[];
  aiRoute: { lat: number; lon: number }[];
  setMapReady: (v: boolean) => void;
  setMapBounds: (b: MapBounds) => void;
  setError: (msg: string) => void;
  setSelectedPeak: (p: MapPoint | null) => void;
  setSelectedCastle: (c: CastlePoint | null) => void;
  setWaypointStatus: (s: string | null) => void;
  computePeakIds: (challenge: ChallengeItem) => number[];
  pointColorByName: (name: string) => string;
}

export function useMapEffects({
  baseMap, mapReady, activeSection, activeModule,
  selectedPeak, selectedChallengeId, modulePoints, castlePoints, showCastles,
  allChallenges, allPoints, userAscents, peakById, selectedLetterColorMap,
  areaSelectMapContainerRef, areaSelectMapRef, areaPeaksLayerGroupRef,
  peakMarkersRef, areaBaseLayerRef, leafletRef, aiLayerGroupRef, aiRouteLayerRef,
  challengePeakIdsRef, mapBoundsTimerRef, activeTripIdRef, waypointCountRef,
  aiMapPoints, aiRoute,
  setMapReady, setMapBounds, setError, setSelectedPeak, setSelectedCastle, setWaypointStatus,
  computePeakIds, pointColorByName,
}: MapEffectsParams): void {
  // Map init + base layer swap
  useEffect(() => {
    if (!areaSelectMapContainerRef.current) return;
    let cancelled = false;
    async function initMap() {
      try {
        const L = await loadLeaflet();
        if (cancelled || !areaSelectMapContainerRef.current) return;
        leafletRef.current = L;
        if (!areaSelectMapRef.current) {
          areaSelectMapRef.current = L.map(areaSelectMapContainerRef.current, { renderer: L.svg({ padding: 0.5 }) });
          areaSelectMapRef.current.fitBounds(CZECH_REPUBLIC_BOUNDS, { padding: [12, 12] });
        }
        addOrSwapBaseLayer(areaSelectMapRef.current, L, areaBaseLayerRef, baseMap);
        if (!areaPeaksLayerGroupRef.current) areaPeaksLayerGroupRef.current = L.layerGroup().addTo(areaSelectMapRef.current);
        areaSelectMapRef.current.invalidateSize();
        areaSelectMapRef.current.off("moveend");
        areaSelectMapRef.current.on("moveend", () => {
          if (mapBoundsTimerRef.current) clearTimeout(mapBoundsTimerRef.current);
          mapBoundsTimerRef.current = setTimeout(() => {
            const b = areaSelectMapRef.current?.getBounds();
            if (b) setMapBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
          }, 250);
        });
        const b = areaSelectMapRef.current.getBounds();
        setMapBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
        if (!cancelled) setMapReady(true);
      } catch (err) { console.error("Map init failed", err); if (!cancelled) setError("Nepodařilo se inicializovat mapu."); }
    }
    void initMap();
    return () => { cancelled = true; };
  }, [baseMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Invalidate map size on panel switch
  useEffect(() => {
    if (!mapReady) return;
    const t = setTimeout(() => { areaSelectMapRef.current?.invalidateSize(); }, 50);
    return () => clearTimeout(t);
  }, [mapReady, activeSection, activeModule]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render peak + castle markers (unified clustering)
  useEffect(() => {
    const L = leafletRef.current;
    const group = areaPeaksLayerGroupRef.current;
    if (!mapReady || !L || !group) return;
    function radiusForZoom(zoom: number) { return zoom >= 13 ? 7 : 5; }
    function clusterColor(kinds: Set<import("../lib/map/clustering").PointKind>) {
      if (kinds.has("peak") && kinds.has("castle")) return "#7c3aed";
      if (kinds.has("castle")) return "#7c3aed";
      return "#0f172a";
    }
    function renderMarkers() {
      peakMarkersRef.current.clear(); group.clearLayers();
      const zoom = areaSelectMapRef.current?.getZoom() ?? 8;
      const b = areaSelectMapRef.current?.getBounds();
      const bounds = b ? { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() } : { west: 12, south: 49, east: 19, north: 51 };
      const tagged = [...tagPeaks(modulePoints), ...(showCastles ? tagCastles(castlePoints) : [])];
      for (const item of computeClusters(tagged, zoom, bounds)) {
        if (item.type === "cluster") {
          const size = Math.min(28 + Math.round(Math.sqrt(item.count)), 52);
          const bg = clusterColor(item.kinds);
          const m = L.marker([item.lat, item.lon], { icon: L.divIcon({ html: `<span>${item.count}</span>`, className: "cluster-marker", iconSize: [size, size], iconAnchor: [size / 2, size / 2], style: `background:${bg}` }), interactive: true, zIndexOffset: -100 });
          m.addTo(group);
          m.on("click", () => { const map = areaSelectMapRef.current; if (map) map.setView([item.lat, item.lon], Math.min(map.getZoom() + 2, 14)); });
        } else if (item.kind === "castle") {
          const marker = L.circleMarker([item.point.lat, item.point.lon], { radius: radiusForZoom(zoom), color: "#7c3aed", weight: 2, fillColor: "#ede9fe", fillOpacity: 0.9, zIndexOffset: 100 });
          marker.on("click", () => setSelectedCastle(item.point));
          marker.addTo(group);
        } else {
          const latN = Number(item.point.lat); const lonN = Number(item.point.lon);
          if (!Number.isFinite(latN) || !Number.isFinite(lonN)) continue;
          const peakId = getPeakId(item.point.mountainLink);
          const ascended = peakId !== null && userAscents.has(peakId);
          const title = item.point.peakName || item.point.name || "Bez názvu";
          const marker = L.circleMarker([latN, lonN], { radius: radiusForZoom(zoom), color: ascended ? "#78350f" : "#0f172a", weight: ascended ? 1.5 : 1, fillColor: ascended ? "#fbbf24" : pointColorByName(title), fillOpacity: 0.92 });
          marker.on("click", () => {
            setSelectedPeak(item.point);
            const tripId = activeTripIdRef.current; const locId = item.point.locationId;
            if (tripId !== null && locId !== undefined) {
              const order = waypointCountRef.current++;
              void fetch(`/api/trips/${tripId}/waypoints`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId: locId, order }) })
                .then((r) => { setWaypointStatus(r.ok ? "Přidáno do tripu" : "Chyba přidání"); setTimeout(() => setWaypointStatus(null), 2500); });
            }
          });
          marker.addTo(group);
          if (item.point.mountainLink) peakMarkersRef.current.set(item.point.mountainLink, marker);
        }
      }
    }
    renderMarkers();
    areaSelectMapRef.current?.off("zoomend"); areaSelectMapRef.current?.on("zoomend", renderMarkers); areaSelectMapRef.current?.on("moveend", renderMarkers);
    return () => { areaSelectMapRef.current?.off("zoomend", renderMarkers); areaSelectMapRef.current?.off("moveend", renderMarkers); };
  }, [mapReady, modulePoints, castlePoints, showCastles, selectedLetterColorMap, userAscents]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pan to selected peak
  useEffect(() => {
    if (!areaSelectMapRef.current) return;
    const z = areaSelectMapRef.current?.getZoom() ?? 10; const r = z >= 13 ? 7 : 5;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    peakMarkersRef.current.forEach((marker: any) => { marker.setStyle({ color: "#0f172a", weight: 1, radius: r }); });
    if (!selectedPeak) return;
    const map = areaSelectMapRef.current;
    const marker = selectedPeak.mountainLink ? peakMarkersRef.current.get(selectedPeak.mountainLink) : null;
    if (marker) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = marker as any;
      map.flyTo(m.getLatLng(), 13, { duration: 0.8 }); const origStyle = m.options;
      m.setStyle({ radius: 10, color: "#fff", weight: 3 }); m.bringToFront();
      setTimeout(() => m.setStyle(origStyle), 2000);
    } else { map.setView([Number(selectedPeak.lat), Number(selectedPeak.lon)], 14); }
  }, [selectedPeak]); // eslint-disable-line react-hooks/exhaustive-deps

  // Challenge highlight
  useEffect(() => {
    if (!mapReady || !areaSelectMapRef.current) return;
    const newIds = new Set<number>();
    if (selectedChallengeId) { const ch = allChallenges.find((c) => c.id === selectedChallengeId); if (ch) computePeakIds(ch).forEach((id) => newIds.add(id)); }
    challengePeakIdsRef.current = newIds;
    const cz = areaSelectMapRef.current?.getZoom() ?? 10; const cr = cz >= 13 ? 7 : 5;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    peakMarkersRef.current.forEach((marker: any, link: string) => {
      const peakId = getPeakId(link);
      const inChallenge = peakId !== null && newIds.has(peakId);
      const ascended = peakId !== null && userAscents.has(peakId);
      const title = (peakId !== null ? peakById.get(peakId) : undefined)?.peakName ?? (peakId !== null ? peakById.get(peakId) : undefined)?.name ?? "";
      if (inChallenge) { marker.setStyle({ radius: cr + 3, color: "#059669", weight: 2.5, fillColor: ascended ? "#fbbf24" : "#10b981", fillOpacity: 1 }); marker.bringToFront(); }
      else marker.setStyle({ radius: cr, color: ascended ? "#78350f" : "#0f172a", weight: ascended ? 1.5 : 1, fillColor: ascended ? "#fbbf24" : pointColorByName(title), fillOpacity: 0.92 });
    });
  }, [mapReady, selectedChallengeId, allChallenges, allPoints, userAscents]); // eslint-disable-line react-hooks/exhaustive-deps

  // AI overlay
  useEffect(() => {
    if (!mapReady || !leafletRef.current || !areaSelectMapRef.current) return;
    const L = leafletRef.current; const map = areaSelectMapRef.current;
    if (!aiLayerGroupRef.current) aiLayerGroupRef.current = L.layerGroup().addTo(map);
    aiLayerGroupRef.current.clearLayers();
    for (const pt of aiMapPoints) {
      const color = pt.type === "peak" ? "#10b981" : pt.type === "cafe" ? "#f59e0b" : pt.type === "castle" ? "#8b5cf6" : "#6366f1";
      L.marker([pt.lat, pt.lon], { icon: L.divIcon({ className: "", html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.35)"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) })
        .bindPopup(`<strong>${pt.name}</strong>${pt.description ? `<br/><span style="font-size:12px">${pt.description}</span>` : ""}`).addTo(aiLayerGroupRef.current);
    }
    if (aiRouteLayerRef.current) { aiRouteLayerRef.current.remove(); aiRouteLayerRef.current = null; }
    if (aiRoute.length >= 2) {
      aiRouteLayerRef.current = L.polyline(aiRoute.map((p) => [p.lat, p.lon]), { color: "#6366f1", weight: 4, opacity: 0.85 }).addTo(map);
      map.fitBounds(aiRouteLayerRef.current.getBounds().pad(0.1), { maxZoom: 14 });
    } else if (aiMapPoints.length > 0) {
      const bounds = L.latLngBounds(aiMapPoints.map((p) => [p.lat, p.lon]));
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.2), { maxZoom: 14 });
    }
  }, [mapReady, aiMapPoints, aiRoute]); // eslint-disable-line react-hooks/exhaustive-deps
}
