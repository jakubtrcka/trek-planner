import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

const PointGeometrySchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
});

const PolygonGeometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
});

const GeometrySchema = z.discriminatedUnion("type", [
  PointGeometrySchema,
  PolygonGeometrySchema,
]);

const FeaturePropertiesSchema = z.object({
  "@id": z.string(),
  name: z.string().optional(),
  historic: z.string().optional(),
  website: z.string().optional(),
  wikidata: z.string().optional(),
  opening_hours: z.string().optional(),
});

const FeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: GeometrySchema,
  properties: FeaturePropertiesSchema,
});

const GeoJsonSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.unknown()),
});

export type CastleLocation = {
  name: string;
  lat: number;
  lon: number;
  external_id: string;
  external_url: string;
  metadata: Record<string, string>;
};

function computePolygonCentroid(ring: [number, number][]): { lat: number; lon: number } {
  const sum = ring.reduce(
    (acc, [lon, lat]) => ({ lon: acc.lon + lon, lat: acc.lat + lat }),
    { lon: 0, lat: 0 },
  );
  return { lon: sum.lon / ring.length, lat: sum.lat / ring.length };
}

function resolveCoordinates(geometry: z.infer<typeof GeometrySchema>): { lat: number; lon: number } | null {
  if (geometry.type === "Point") {
    return { lon: geometry.coordinates[0], lat: geometry.coordinates[1] };
  }
  const ring = geometry.coordinates[0];
  if (!ring || ring.length === 0) return null;
  return computePolygonCentroid(ring);
}

export class CastlesParserService {
  private readonly geojsonPath: string;

  constructor(geojsonPath?: string) {
    this.geojsonPath = geojsonPath ?? path.resolve(process.cwd(), "export.geojson");
  }

  /** Parse pre-fetched CastleLocation array (from CastlesScraperService). */
  parseRaw(input: CastleLocation[]): CastleLocation[] {
    return input.filter((c) => !!c.name && Number.isFinite(c.lat) && Number.isFinite(c.lon));
  }

  /** Parse from local GeoJSON file (dev/legacy path). */
  parse(): CastleLocation[] {
    const raw = fs.readFileSync(this.geojsonPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    const collection = GeoJsonSchema.parse(parsed);

    const results: CastleLocation[] = [];

    for (const rawFeature of collection.features) {
      const result = FeatureSchema.safeParse(rawFeature);
      if (!result.success) continue;

      const { properties, geometry } = result.data;
      if (!properties.name) continue;

      const coords = resolveCoordinates(geometry);
      if (!coords) continue;

      const externalId = properties["@id"];
      const externalUrl = properties.website ?? `https://www.openstreetmap.org/${externalId}`;

      const metadata: Record<string, string> = {};
      if (properties.wikidata) metadata.wikidata = properties.wikidata;
      if (properties.opening_hours) metadata.opening_hours = properties.opening_hours;
      if (properties.historic) metadata.historic = properties.historic;

      results.push({
        name: properties.name,
        lat: coords.lat,
        lon: coords.lon,
        external_id: externalId,
        external_url: externalUrl,
        metadata,
      });
    }

    return results;
  }
}
