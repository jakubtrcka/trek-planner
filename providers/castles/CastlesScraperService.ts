import { z } from "zod";
import type { CastleLocation } from "./CastlesParserService";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];
const TIMEOUT_MS = 60_000;

const OVERPASS_QUERY = `
[out:json][timeout:55];
(
  node["historic"="castle"](46.5,12.0,51.5,22.5);
  way["historic"="castle"](46.5,12.0,51.5,22.5);
  relation["historic"="castle"](46.5,12.0,51.5,22.5);
  node["historic"="chateau"](46.5,12.0,51.5,22.5);
  way["historic"="chateau"](46.5,12.0,51.5,22.5);
  relation["historic"="chateau"](46.5,12.0,51.5,22.5);
);
out center;
`.trim();

const OverpassNodeSchema = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string()).optional(),
});

const OverpassResponseSchema = z.object({
  elements: z.array(z.unknown()),
});

type OverpassElement = z.infer<typeof OverpassNodeSchema>;

function resolveCoords(el: OverpassElement): { lat: number; lon: number } | null {
  if (el.lat !== undefined && el.lon !== undefined) return { lat: el.lat, lon: el.lon };
  if (el.center) return { lat: el.center.lat, lon: el.center.lon };
  return null;
}

function buildExternalUrl(el: OverpassElement): string {
  const tags = el.tags ?? {};
  if (tags.website) return tags.website;
  return `https://www.openstreetmap.org/${el.type}/${el.id}`;
}

function toExternalId(el: OverpassElement): string {
  return `${el.type}/${el.id}`;
}

async function fetchOverpass(query: string): Promise<string> {
  let lastError: Error | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 8_000));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) return res.text();
        lastError = new Error(`Overpass ${endpoint} error: ${res.status}`);
        console.warn(`[castles-scraper] ${lastError.message}`);
        if (res.status !== 429 && res.status !== 406 && res.status !== 504) break;
      } catch (err) {
        clearTimeout(timer);
        lastError = err as Error;
        console.warn(`[castles-scraper] ${endpoint} failed: ${lastError.message}`);
      }
    }
  }
  throw lastError ?? new Error("Overpass API: všechny endpointy selhaly");
}

export class CastlesScraperService {
  async scrape(): Promise<CastleLocation[]> {
    const responseText = await fetchOverpass(OVERPASS_QUERY);

    const parsed: unknown = JSON.parse(responseText);
    const { elements } = OverpassResponseSchema.parse(parsed);

    const results: CastleLocation[] = [];

    for (const raw of elements) {
      const result = OverpassNodeSchema.safeParse(raw);
      if (!result.success) continue;

      const el = result.data;
      const tags = el.tags ?? {};
      if (!tags.name) continue;

      const coords = resolveCoords(el);
      if (!coords) continue;

      const metadata: Record<string, string> = {};
      if (tags.wikidata) metadata.wikidata = tags.wikidata;
      if (tags.opening_hours) metadata.opening_hours = tags.opening_hours;
      if (tags.historic) metadata.historic = tags.historic;

      results.push({
        name: tags.name,
        lat: coords.lat,
        lon: coords.lon,
        external_id: toExternalId(el),
        external_url: buildExternalUrl(el),
        metadata,
      });
    }

    return results;
  }
}
