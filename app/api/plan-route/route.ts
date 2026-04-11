import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MapPoint = {
  lat: number;
  lon: number;
  name?: string;
  peakName?: string;
  altitude?: number | string;
  mountainLink?: string;
};

type RequestPayload = {
  points?: MapPoint[];
  maxDistance?: number;
  startsWithLetters?: string[];
  letterMode?: "strict" | "prefer";
  routeMode?: "linear" | "roundtrip";
};

type ClusterPoint = MapPoint & {
  title: string;
};

type PlannedRoute = {
  id: string;
  title: string;
  distanceKm: number;
  durationMinutes: number;
  ascentMeters: number;
  peaks: Array<{
    name: string;
    lat: number;
    lon: number;
    altitude?: number | string;
  }>;
  mapyCzUrl: string;
  mapyApiUrl: string;
  geometry: {
    type: "LineString";
    coordinates: Array<[number, number]>;
  };
};

type CachePayload = {
  cachedAt: string;
  count: number;
  apiCalls?: number;
  estimatedCredits?: number;
  routes: PlannedRoute[];
};

type RoutingAttemptResult = {
  distanceKm: number;
  durationMinutes: number;
  ascentMeters: number;
  geometry: {
    type: "LineString";
    coordinates: Array<[number, number]>;
  };
};

const ROUTING_ENDPOINT = "https://api.mapy.cz/v1/routing/route";
const CACHE_DIR = path.join(process.cwd(), "data", "route-cache");
const CACHE_VERSION = "v2";
const MAX_POINTS_PER_ROUTE = 5;
const MAX_ROUTES = 3;
const MAX_ATTEMPTS_PER_CLUSTER = 3;
const API_CALL_BUDGET = 12;
const ROUTING_CREDITS_PER_CALL = 4;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizePoints(points: unknown): ClusterPoint[] {
  if (!Array.isArray(points)) {
    return [];
  }

  const unique = new Map<string, ClusterPoint>();

  for (const raw of points) {
    if (!raw || typeof raw !== "object") {
      continue;
    }

    const point = raw as MapPoint;
    if (!isFiniteNumber(point.lat) || !isFiniteNumber(point.lon)) {
      continue;
    }

    if (point.lat < -90 || point.lat > 90 || point.lon < -180 || point.lon > 180) {
      continue;
    }

    const lat = Number(point.lat.toFixed(7));
    const lon = Number(point.lon.toFixed(7));
    const key = `${lat}:${lon}`;
    const title = (point.peakName ?? point.name ?? "Bez názvu").trim() || "Bez názvu";

    const normalized: ClusterPoint = {
      ...point,
      lat,
      lon,
      title,
      peakName: point.peakName?.trim() || undefined,
      name: point.name?.trim() || undefined
    };

    if (!unique.has(key)) {
      unique.set(key, normalized);
      continue;
    }

    const current = unique.get(key)!;
    const currentNamed = Boolean(current.peakName || current.name);
    const nextNamed = Boolean(normalized.peakName || normalized.name);
    if (nextNamed && !currentNamed) {
      unique.set(key, normalized);
    }
  }

  return Array.from(unique.values());
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const earthRadiusKm = 6371;
  const latDiff = toRadians(b.lat - a.lat);
  const lonDiff = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinLat = Math.sin(latDiff / 2);
  const sinLon = Math.sin(lonDiff / 2);
  const aa = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

function clusterDiameter(points: ClusterPoint[]): number {
  let max = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = distanceKm(points[i], points[j]);
      if (d > max) {
        max = d;
      }
    }
  }
  return max;
}

function buildClusters(
  points: ClusterPoint[],
  maxDistance: number,
  preferredLetters: Set<string>,
  letterMode: "strict" | "prefer"
): ClusterPoint[][] {
  const diameterLimit = Math.max(0.5, maxDistance * 0.6);
  if (points.length === 0) {
    return [];
  }

  const clusters: ClusterPoint[][] = [];

  for (const seed of points) {
    const sorted = [...points].sort((a, b) => distanceKm(seed, a) - distanceKm(seed, b));
    const cluster: ClusterPoint[] = [];

    for (const candidate of sorted) {
      if (cluster.length >= MAX_POINTS_PER_ROUTE) {
        break;
      }

      let valid = true;
      for (const existing of cluster) {
        if (distanceKm(existing, candidate) > diameterLimit) {
          valid = false;
          break;
        }
      }

      if (valid) {
        cluster.push(candidate);
      }
    }

    if (cluster.length >= 2) {
      clusters.push(cluster);
    }
  }

  const deduped = new Map<string, ClusterPoint[]>();
  for (const cluster of clusters) {
    const key = cluster
      .map((point) => `${point.lat}:${point.lon}`)
      .sort()
      .join("|");

    if (!deduped.has(key)) {
      deduped.set(key, cluster);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => {
      if (letterMode === "prefer" && preferredLetters.size > 0) {
        const hitsA = preferredHitCount(a, preferredLetters);
        const hitsB = preferredHitCount(b, preferredLetters);
        if (hitsB !== hitsA) {
          return hitsB - hitsA;
        }
      }

      if (b.length !== a.length) {
        return b.length - a.length;
      }
      return clusterDiameter(a) - clusterDiameter(b);
    })
    .slice(0, MAX_ROUTES);
}

function orderClusterForRoute(cluster: ClusterPoint[]): ClusterPoint[] {
  if (cluster.length <= 2) {
    return [...cluster];
  }

  const remaining = [...cluster].sort((a, b) => a.lon - b.lon || a.lat - b.lat);
  const ordered: ClusterPoint[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let nextIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < remaining.length; i += 1) {
      const d = distanceKm(last, remaining[i]);
      if (d < bestDistance) {
        bestDistance = d;
        nextIndex = i;
      }
    }

    ordered.push(remaining.splice(nextIndex, 1)[0]);
  }

  return ordered;
}

function farthestPointIndex(points: ClusterPoint[]): number {
  if (points.length <= 2) {
    return points.length - 1;
  }

  let farthestIndex = 1;
  let farthestAvg = -1;

  for (let i = 1; i < points.length - 1; i += 1) {
    let sum = 0;
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) {
        continue;
      }
      sum += distanceKm(points[i], points[j]);
    }

    const avg = sum / (points.length - 1);
    if (avg > farthestAvg) {
      farthestAvg = avg;
      farthestIndex = i;
    }
  }

  return farthestIndex;
}

function createCacheKey(points: ClusterPoint[], maxDistance: number): string {
  const pointsHash = points
    .map((point) => `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`)
    .sort()
    .join("|");
  const input = `${CACHE_VERSION}|${maxDistance.toFixed(2)}|${pointsHash}`;

  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }

  return `routes-${Math.abs(hash)}`;
}

async function readCache(cachePath: string): Promise<{ routes: PlannedRoute[]; apiCalls: number; estimatedCredits: number } | null> {
  try {
    const raw = await fs.readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw) as CachePayload;
    if (!Array.isArray(parsed.routes)) {
      return null;
    }
    const apiCalls = typeof parsed.apiCalls === "number" ? parsed.apiCalls : parsed.routes.length;
    return {
      routes: parsed.routes,
      apiCalls,
      estimatedCredits: apiCalls * ROUTING_CREDITS_PER_CALL
    };
  } catch {
    return null;
  }
}

async function writeCache(cachePath: string, routes: PlannedRoute[], apiCalls: number): Promise<void> {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  const payload: CachePayload = {
    cachedAt: new Date().toISOString(),
    count: routes.length,
    apiCalls,
    estimatedCredits: apiCalls * ROUTING_CREDITS_PER_CALL,
    routes
  };
  await fs.writeFile(cachePath, JSON.stringify(payload, null, 2), "utf8");
}

function formatCoord(point: { lat: number; lon: number }): string {
  return `${point.lon.toFixed(6)},${point.lat.toFixed(6)}`;
}

function parseNumberFromAny(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
}

function parseAltitudeMeters(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }

  // Handles values like "1 243 m", "1243", "1,243", "1243 m n. m."
  const normalized = value
    .replace(/[^\d,.\-]/g, "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLetter(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .slice(0, 1);
}

function firstLetterFromName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  for (const ch of trimmed) {
    if (/[A-Za-zÁ-Žá-ž]/.test(ch)) {
      return ch.toUpperCase();
    }
  }

  return null;
}

function preferredHitCount(points: ClusterPoint[], preferredLetters: Set<string>): number {
  if (preferredLetters.size === 0) {
    return 0;
  }

  let hits = 0;
  for (const point of points) {
    const title = point.peakName ?? point.name ?? "";
    const first = firstLetterFromName(title);
    if (!first) {
      continue;
    }
    if (preferredLetters.has(normalizeLetter(first))) {
      hits += 1;
    }
  }
  return hits;
}

function estimateAscentFromPeaks(points: ClusterPoint[]): number {
  if (points.length < 2) {
    return 0;
  }

  let ascent = 0;
  let previous = parseAltitudeMeters(points[0].altitude);

  for (let i = 1; i < points.length; i += 1) {
    const current = parseAltitudeMeters(points[i].altitude);
    if (previous !== null && current !== null && current > previous) {
      ascent += current - previous;
    }
    if (current !== null) {
      previous = current;
    }
  }

  return Math.round(ascent);
}

function findNestedValue(obj: unknown, paths: string[][]): unknown {
  if (!obj || typeof obj !== "object") {
    return null;
  }

  for (const pathParts of paths) {
    let current: unknown = obj;
    let found = true;

    for (const part of pathParts) {
      if (!current || typeof current !== "object") {
        found = false;
        break;
      }
      current = (current as Record<string, unknown>)[part];
      if (current === undefined) {
        found = false;
        break;
      }
    }

    if (found) {
      return current;
    }
  }

  return null;
}

function normalizeGeometry(raw: unknown): Array<[number, number]> | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const node = raw as Record<string, unknown>;

  const directCoords = Array.isArray(node.coordinates) ? node.coordinates : null;
  if (node.type === "LineString" && directCoords) {
    const coords = directCoords
      .map((item) => {
        if (!Array.isArray(item) || item.length < 2) {
          return null;
        }
        const lon = parseNumberFromAny(item[0]);
        const lat = parseNumberFromAny(item[1]);
        if (lon === null || lat === null) {
          return null;
        }
        return [lon, lat] as [number, number];
      })
      .filter((item): item is [number, number] => Boolean(item));

    return coords.length >= 2 ? coords : null;
  }

  const nested = findNestedValue(raw, [
    ["geometry"],
    ["route", "geometry"],
    ["result", "geometry"],
    ["features", "0", "geometry"]
  ]);

  if (!nested || nested === raw) {
    return null;
  }

  return normalizeGeometry(nested);
}

function parseRoutingResponse(data: unknown): RoutingAttemptResult | null {
  const geometry = normalizeGeometry(data);
  if (!geometry) {
    return null;
  }

  const distanceCandidates = [
    ["length"],
    ["distance"],
    ["features", "0", "properties", "length"],
    ["features", "0", "properties", "distance"],
    ["summary", "length"],
    ["summary", "distance"],
    ["route", "length"],
    ["route", "distance"]
  ];

  const durationCandidates = [
    ["duration"],
    ["time"],
    ["features", "0", "properties", "duration"],
    ["features", "0", "properties", "time"],
    ["summary", "duration"],
    ["summary", "time"],
    ["route", "duration"],
    ["route", "time"]
  ];

  const ascentCandidates = [
    ["ascent"],
    ["elevationUp"],
    ["uphill"],
    ["upHill"],
    ["elevation_gain"],
    ["features", "0", "properties", "ascent"],
    ["features", "0", "properties", "uphill"],
    ["features", "0", "properties", "upHill"],
    ["features", "0", "properties", "elevation_gain"],
    ["summary", "ascent"],
    ["summary", "uphill"],
    ["route", "ascent"]
  ];

  const rawDistance = findNestedValue(data, distanceCandidates);
  const rawDuration = findNestedValue(data, durationCandidates);
  const rawAscent = findNestedValue(data, ascentCandidates);

  const distanceValue = parseNumberFromAny(rawDistance);
  const durationValue = parseNumberFromAny(rawDuration);
  const ascentValue = parseNumberFromAny(rawAscent) ?? 0;

  if (distanceValue === null) {
    return null;
  }

  const distanceKm = distanceValue > 1000 ? distanceValue / 1000 : distanceValue;
  const durationMinutes = durationValue === null ? Math.round((distanceKm / 4.2) * 60) : durationValue > 300 ? durationValue / 60 : durationValue;

  return {
    distanceKm,
    durationMinutes,
    ascentMeters: ascentValue,
    geometry: {
      type: "LineString",
      coordinates: geometry
    }
  };
}

async function callMapyRoutingApi(
  points: ClusterPoint[],
  apiKey: string,
  routeMode: "linear" | "roundtrip"
): Promise<RoutingAttemptResult | null> {
  if (points.length < 2) {
    return null;
  }

  const start = points[0];
  const end = routeMode === "roundtrip" ? points[0] : points[points.length - 1];
  const via = routeMode === "roundtrip" ? points.slice(1) : points.slice(1, -1);
  const query = new URLSearchParams();
  query.set("apikey", apiKey);
  query.set("routeType", "foot_hiking");
  query.set("format", "geojson");
  query.set("start", formatCoord(start));
  query.set("end", formatCoord(end));
  for (const point of via) {
    query.append("waypoints", formatCoord(point));
  }

  try {
    const response = await fetch(`${ROUTING_ENDPOINT}?${query.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(
        `[plan-route] routing API failed: status=${response.status}, statusText=${response.statusText}, body=${body.slice(0, 220)}`
      );
      return null;
    }
    const data = (await response.json()) as unknown;
    return parseRoutingResponse(data);
  } catch {
    return null;
  }
}

function buildMapyUrls(points: ClusterPoint[], routeMode: "linear" | "roundtrip"): { mapyCzUrl: string; mapyApiUrl: string } {
  const coords = points.map((point) => formatCoord(point));
  const start = coords[0];
  const end = routeMode === "roundtrip" ? coords[0] : coords[coords.length - 1];
  const waypoints = (routeMode === "roundtrip" ? coords.slice(1) : coords.slice(1, -1)).join(";");

  const mapyApiParams = new URLSearchParams();
  mapyApiParams.set("start", start);
  mapyApiParams.set("end", end);
  mapyApiParams.set("routeType", "foot_hiking");
  if (waypoints) {
    mapyApiParams.set("waypoints", waypoints);
  }

  return {
    mapyCzUrl: `https://mapy.com/fnc/v1/route?${mapyApiParams.toString()}`,
    mapyApiUrl: `https://mapy.com/fnc/v1/route?${mapyApiParams.toString()}`
  };
}

function routeTitle(points: ClusterPoint[], routeMode: "linear" | "roundtrip"): string {
  const first = points[0]?.title ?? "vrcholů";
  return routeMode === "roundtrip" ? `Okruh v okolí ${first}` : `Výšlap v okolí ${first}`;
}

async function planSingleCluster(
  cluster: ClusterPoint[],
  maxDistance: number,
  apiKey: string,
  routeMode: "linear" | "roundtrip",
  canCallApi: () => boolean,
  onApiCall: () => void
): Promise<PlannedRoute | null> {
  let candidate = orderClusterForRoute(cluster).slice(0, MAX_POINTS_PER_ROUTE);
  let attempts = 0;

  while (candidate.length >= 2 && attempts < MAX_ATTEMPTS_PER_CLUSTER) {
    if (!canCallApi()) {
      return null;
    }
    onApiCall();
    attempts += 1;
    const routed = await callMapyRoutingApi(candidate, apiKey, routeMode);
    if (!routed) {
      if (candidate.length <= 2) {
        return null;
      }
      const removeIndex = farthestPointIndex(candidate);
      candidate = candidate.filter((_, index) => index !== removeIndex);
      continue;
    }

    if (routed.distanceKm <= maxDistance * 1.2) {
      const { mapyCzUrl, mapyApiUrl } = buildMapyUrls(candidate, routeMode);
      const peaks = candidate.map((point) => ({
        name: point.title,
        lat: point.lat,
        lon: point.lon,
        altitude: point.altitude
      }));

      return {
        id: createCacheKey(candidate, routed.distanceKm),
        title: routeTitle(candidate, routeMode),
        distanceKm: Number(routed.distanceKm.toFixed(2)),
        durationMinutes: Math.max(1, Math.round(routed.durationMinutes)),
        ascentMeters: Math.max(0, Math.round(routed.ascentMeters || estimateAscentFromPeaks(candidate))),
        peaks,
        mapyCzUrl,
        mapyApiUrl,
        geometry: routed.geometry
      };
    }

    if (candidate.length <= 2) {
      return null;
    }

    const removeIndex = farthestPointIndex(candidate);
    candidate = candidate.filter((_, index) => index !== removeIndex);
  }

  return null;
}

export async function POST(request: Request) {
  const body = (await request.json()) as RequestPayload;
  const maxDistance = body.maxDistance;
  const startsWithLetters = Array.isArray(body.startsWithLetters)
    ? body.startsWithLetters.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const letterMode: "strict" | "prefer" = body.letterMode === "prefer" ? "prefer" : "strict";
  const routeMode: "linear" | "roundtrip" = body.routeMode === "linear" ? "linear" : "roundtrip";
  const preferredLetters = new Set(startsWithLetters.map(normalizeLetter).filter(Boolean));
  const apiKey = process.env.MAPY_API_KEY?.trim() || process.env.MAPY_COM_API_KEY?.trim();
  const points = normalizePoints(body.points);

  if (!apiKey) {
    return NextResponse.json(
      { error: "Chybí MAPY_API_KEY v prostředí serveru (.env.local)." },
      { status: 500 }
    );
  }

  if (!isFiniteNumber(maxDistance) || maxDistance <= 0) {
    return NextResponse.json({ error: "`maxDistance` musí být kladné číslo (km)." }, { status: 400 });
  }

  if (points.length < 2) {
    return NextResponse.json({ error: "Pro plánování trasy jsou potřeba alespoň 2 vrcholy." }, { status: 400 });
  }

  if (letterMode === "strict" && preferredLetters.size > 0) {
    const strictPoints = points.filter((point) => {
      const first = firstLetterFromName(point.peakName ?? point.name ?? "");
      return first ? preferredLetters.has(normalizeLetter(first)) : false;
    });
    if (strictPoints.length >= 2) {
      points.splice(0, points.length, ...strictPoints);
    }
  }

  const normalizedDistance = Number(Math.min(Math.max(maxDistance, 1), 120).toFixed(2));
  const modeSuffix = `${letterMode}|${routeMode}|${Array.from(preferredLetters).sort().join(",")}`;
  const cacheKey = `${createCacheKey(points, normalizedDistance)}-${Buffer.from(modeSuffix).toString("base64url").slice(0, 12)}`;
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);

  const cachedRoutes = await readCache(cachePath);
  if (cachedRoutes && cachedRoutes.routes.length > 0) {
    return NextResponse.json({
      cached: true,
      cacheKey,
      count: cachedRoutes.routes.length,
      apiCalls: 0,
      estimatedCredits: 0,
      creditsPerCall: ROUTING_CREDITS_PER_CALL,
      routes: cachedRoutes.routes
    });
  }

  const clusters = buildClusters(points, normalizedDistance, preferredLetters, letterMode);
  if (clusters.length === 0) {
    return NextResponse.json(
      { error: "Z dostupných vrcholů se nepodařilo složit žádný vhodný shluk pro trasu." },
      { status: 422 }
    );
  }

  const routes: PlannedRoute[] = [];
  let apiCalls = 0;

  for (const cluster of clusters) {
    const planned = await planSingleCluster(
      cluster,
      normalizedDistance,
      apiKey,
      routeMode,
      () => apiCalls < API_CALL_BUDGET,
      () => {
        apiCalls += 1;
      }
    );
    if (planned) {
      routes.push(planned);
    }
    if (apiCalls >= API_CALL_BUDGET) {
      break;
    }
  }

  if (routes.length === 0) {
    return NextResponse.json(
      {
        error:
          "Mapy.com Routing API nevrátilo použitelnou turistickou trasu pro vybrané vrcholy. Zkus menší vzdálenost nebo jiný výběr oblastí."
      },
      { status: 502 }
    );
  }

  await writeCache(cachePath, routes, apiCalls);

  return NextResponse.json({
    cached: false,
    cacheKey,
    count: routes.length,
    apiCalls,
    estimatedCredits: apiCalls * ROUTING_CREDITS_PER_CALL,
    creditsPerCall: ROUTING_CREDITS_PER_CALL,
    routes
  });
}
