"use client";

import type { MutableRefObject } from "react";
import type { LeafletInstance } from "../lib/map/leaflet-loader";
import type { BaseMapType } from "../lib/page-config";

interface MapContainerProps {
  containerRef: MutableRefObject<HTMLDivElement | null>;
}

export function MapContainer({ containerRef }: MapContainerProps) {
  return <div ref={containerRef} className="absolute inset-0 app-map" />;
}

// Exported so page.tsx can call it inside its useEffect without carrying the implementation
export function addOrSwapBaseLayer(
  map: LeafletInstance,
  L: LeafletInstance,
  baseLayerRef: MutableRefObject<LeafletInstance | null>,
  baseMap: BaseMapType
): void {
  if (baseLayerRef.current) {
    map.removeLayer(baseLayerRef.current);
    baseLayerRef.current = null;
  }

  if (baseMap === "mapycz-outdoor" || baseMap === "mapycz-warm") {
    const gl = L.maplibreGL({
      style: "https://tiles.openfreemap.org/styles/liberty",
      attribution:
        '&copy; <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OSM</a>',
    });
    if (baseMap === "mapycz-warm") {
      gl.on("add", () => {
        const container = gl.getMaplibreMap?.()?.getContainer?.();
        if (container) {
          (container as HTMLElement).style.filter =
            "sepia(0.4) saturate(0.75) brightness(1.04) contrast(0.95)";
        }
      });
    }
    gl.addTo(map);
    baseLayerRef.current = gl;
    return;
  }

  if (baseMap === "mapycz-basic") {
    baseLayerRef.current = L.tileLayer(
      "/api/mapy-tiles?layer=basic&z={z}&x={x}&y={y}&retina=1",
      {
        maxZoom: 20,
        tileSize: 512,
        zoomOffset: -1,
        attribution: '&copy; <a href="https://mapy.com/" target="_blank" rel="noreferrer">Mapy.com</a>',
        className: "map-attribution",
      }
    ).addTo(map);
    return;
  }

  baseLayerRef.current = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
      className: "map-attribution",
    }
  ).addTo(map);
}
