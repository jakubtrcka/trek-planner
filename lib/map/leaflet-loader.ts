// Load maplibre-gl first, then the Leaflet plugin which requires both.
// Uses the canonical "leaflet" specifier so the plugin's internal require('leaflet')
// resolves to the same module instance (both hit dist/leaflet-src.js via package.json "main").
export async function loadLeaflet(): Promise<LeafletInstance> {
  await import("maplibre-gl");
  await import("@maplibre/maplibre-gl-leaflet");
  const leafletModule = await import("leaflet");
  const globalLeaflet =
    typeof window !== "undefined"
      ? ((window as typeof window & { L?: unknown; leaflet?: unknown }).L ??
          (window as typeof window & { L?: unknown; leaflet?: unknown }).leaflet)
      : undefined;

  const candidates = [
    leafletModule,
    (leafletModule as { default?: unknown }).default,
    globalLeaflet,
  ] as Array<unknown>;

  for (const candidate of candidates) {
    if (
      candidate &&
      typeof (candidate as { map?: unknown }).map === "function" &&
      typeof (candidate as { tileLayer?: unknown }).tileLayer === "function" &&
      typeof (candidate as { layerGroup?: unknown }).layerGroup === "function" &&
      typeof (candidate as { circleMarker?: unknown }).circleMarker === "function"
    ) {
      return candidate as LeafletInstance;
    }
  }

  throw new Error(
    `Leaflet module has unexpected shape: ${candidates
      .map((candidate) => {
        if (!candidate || typeof candidate !== "object") return String(candidate);
        return Object.getOwnPropertyNames(candidate).slice(0, 12).join(", ");
      })
      .join(" | ")}`
  );
}

// Intentionally broad: Leaflet has no official TS definitions we can lean on here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LeafletInstance = Record<string, any>;
