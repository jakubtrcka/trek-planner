import fs from "node:fs/promises";
import path from "node:path";
import { type PeakCandidate, type Waypoint, PeaksCacheFileSchema } from "./types";

const ALL_PEAKS_CACHE_PATH = path.join(process.cwd(), "data", "points-cache", "all-peaks.json");
const MATCH_DISTANCE_LIMIT_METERS = 250;

// ── Geo ────────────────────────────────────────────────────────────────────────

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Peak index ─────────────────────────────────────────────────────────────────

export function buildPeakIndex(peaks: PeakCandidate[]) {
  const byName = new Map<string, PeakCandidate[]>();
  for (const peak of peaks) {
    const current = byName.get(peak.normalizedName) ?? [];
    current.push(peak);
    byName.set(peak.normalizedName, current);
  }
  return { peaks, byName };
}

export type PeakIndex = ReturnType<typeof buildPeakIndex>;

function pickNearestPeak(candidates: PeakCandidate[], waypoint: Waypoint): PeakCandidate | null {
  if (candidates.length === 0) return null;
  if (waypoint.lat === null || waypoint.lon === null || !Number.isFinite(waypoint.lat) || !Number.isFinite(waypoint.lon)) {
    return candidates[0] ?? null;
  }
  let best: PeakCandidate | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const d = haversineMeters(waypoint.lat, waypoint.lon, c.lat, c.lon);
    if (d < bestDist) { best = c; bestDist = d; }
  }
  return best;
}

export function findPeakIdForWaypoint(waypoint: Waypoint, index: PeakIndex, normalize: (s: string) => string): number | null {
  const normalized = normalize(waypoint.name);
  if (normalized) {
    const exact = index.byName.get(normalized);
    if (exact?.length) return pickNearestPeak(exact, waypoint)?.id ?? null;
    for (const variant of [
      normalized.replace(/\bvrch\b/g, "").trim(),
      normalized.replace(/\bhora\b/g, "").trim(),
      normalized.replace(/\bkopec\b/g, "").trim(),
    ].filter(Boolean)) {
      const candidates = index.byName.get(variant);
      if (candidates?.length) return pickNearestPeak(candidates, waypoint)?.id ?? null;
    }
  }
  if (waypoint.lat !== null && waypoint.lon !== null && Number.isFinite(waypoint.lat) && Number.isFinite(waypoint.lon)) {
    let best: PeakCandidate | null = null;
    let bestDist = MATCH_DISTANCE_LIMIT_METERS;
    for (const peak of index.peaks) {
      const d = haversineMeters(waypoint.lat, waypoint.lon, peak.lat, peak.lon);
      if (d <= bestDist) { best = peak; bestDist = d; }
    }
    return best?.id ?? null;
  }
  return null;
}

function parsePeakIdFromMountainLink(url: string | undefined): number | null {
  if (!url) return null;
  const match = url.match(/\/mountain\/(\d+)/i);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

// ── Cache reader ───────────────────────────────────────────────────────────────

export async function readAllPeaksCache(normalizeText: (s: string) => string): Promise<PeakCandidate[]> {
  try {
    const raw = await fs.readFile(ALL_PEAKS_CACHE_PATH, "utf8");
    const result = PeaksCacheFileSchema.safeParse(JSON.parse(raw));
    if (!result.success) return [];

    const peaks: PeakCandidate[] = [];
    for (const point of result.data.points) {
      const id = parsePeakIdFromMountainLink(point.mountainLink);
      const lat = Number(point.lat);
      const lon = Number(point.lon);
      const name = (point.peakName ?? point.name ?? "").trim();
      if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      peaks.push({ id, name, normalizedName: normalizeText(name), lat, lon });
    }
    return peaks;
  } catch {
    return [];
  }
}
