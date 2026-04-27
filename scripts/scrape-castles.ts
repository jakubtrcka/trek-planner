import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "fs";
import path from "path";

const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const OUT_FILE = path.join(process.cwd(), "data", "castles.geojson");
const TIMEOUT_MS = 120_000;

// Historic castles in CZ + SK bounding box
const QUERY = `[out:json][timeout:90];
(
  node["historic"="castle"](47.5,12.0,51.5,22.7);
  way["historic"="castle"](47.5,12.0,51.5,22.7);
  relation["historic"="castle"](47.5,12.0,51.5,22.7);
  node["historic"="ruins"]["ruin:type"="castle"](47.5,12.0,51.5,22.7);
  way["historic"="ruins"]["ruin:type"="castle"](47.5,12.0,51.5,22.7);
);
out center tags;`;

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

function resolveCoords(el: OverpassElement): { lat: number; lon: number } | null {
  if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
    return { lat: el.lat, lon: el.lon };
  }
  if (el.center) return { lat: el.center.lat, lon: el.center.lon };
  return null;
}

function toGeoJson(elements: OverpassElement[]): object {
  const features = elements
    .filter((el) => el.tags?.name)
    .map((el) => {
      const coords = resolveCoords(el);
      if (!coords) return null;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [coords.lon, coords.lat] },
        properties: {
          "@id": `${el.type}/${el.id}`,
          name: el.tags?.name ?? "",
          historic: el.tags?.historic,
          website: el.tags?.website,
          wikidata: el.tags?.wikidata,
          opening_hours: el.tags?.opening_hours,
        },
      };
    })
    .filter(Boolean);

  return { type: "FeatureCollection", features };
}

async function main() {
  console.log("Fetching castles from Overpass API...");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OVERPASS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "hory-trek-planner/1.0",
      },
      body: `data=${encodeURIComponent(QUERY)}`,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
  }

  const json: unknown = await response.json();
  const data = json as OverpassResponse;
  const geojson = toGeoJson(data.elements);

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(geojson, null, 2));
  const count = (geojson as { features: unknown[] }).features.length;
  console.log(`Hotovo: ${count} zámků → ${OUT_FILE}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
