"use client";

// Exception: exceeds 25-line hook limit.
// Justification: encapsulates all derived memos for peak/challenge computation
// (computePeakIds, peakChallengesMap, challengeCompletionMap, visiblePoints,
// areaAscentStats, peakById). All depend on allPoints and allChallenges, so
// they cannot be split without re-computing allPoints in multiple hooks.
// Documented in RELEASE_NOTES v21.

import { useMemo } from "react";
import { BIRD_KEYWORDS, CESKA_OSMISMERKA_GRID, ensureArray, getPeakId, isPalindromeAltitude, normalizeLetter, wordSearchCheck } from "../lib/page-utils";
import type { ChallengeItem, MapBounds, MapPoint } from "../lib/page-types";

interface ChallengesParams {
  allPoints: MapPoint[];
  allChallenges: ChallengeItem[];
  userAscents: Map<number, { count: number; dates: string[] }>;
  selectedLetters: string[];
  letterMode: "strict" | "prefer";
  showOtherLetters: boolean;
  selectedRangeUrls: string[];
  peakSort: "alpha" | "challenges";
  peakSearchQuery: string;
  filterByMapBounds: boolean;
  mapBounds: MapBounds | null;
}

export function useChallenges({
  allPoints, allChallenges, userAscents,
  selectedLetters, letterMode, showOtherLetters, selectedRangeUrls,
  peakSort, peakSearchQuery, filterByMapBounds, mapBounds,
}: ChallengesParams) {
  function computePeakIds(challenge: ChallengeItem): number[] {
    if (challenge.id?.includes("horske-palindromy")) return allPoints.filter((p) => typeof p.altitude === "number" && isPalindromeAltitude(p.altitude)).map((p) => getPeakId(p.mountainLink)).filter((id): id is number => id !== null);
    if (challenge.id?.includes("nizinar")) return allPoints.filter((p) => typeof p.altitude === "number" && p.altitude <= 400).map((p) => getPeakId(p.mountainLink)).filter((id): id is number => id !== null);
    if (Array.isArray(challenge.peakIds) && challenge.peakIds.length > 0) return challenge.peakIds;
    if (challenge.id?.includes("vysinar")) return allPoints.filter((p) => typeof p.altitude === "number" && p.altitude >= 1000).map((p) => getPeakId(p.mountainLink)).filter((id): id is number => id !== null);
    if (challenge.id?.includes("ptaci-vyzva")) return allPoints.filter((p) => BIRD_KEYWORDS.test(p.name ?? "")).map((p) => getPeakId(p.mountainLink)).filter((id): id is number => id !== null);
    if (challenge.id?.includes("ceska-osmismerka")) return allPoints.filter((p) => { const n = (p.peakName ?? p.name ?? "").toUpperCase().replace(/\s+/g, ""); return n.length >= 3 && wordSearchCheck(CESKA_OSMISMERKA_GRID, n); }).map((p) => getPeakId(p.mountainLink)).filter((id): id is number => id !== null);
    return [];
  }

  function getChallengeYear(challenge: ChallengeItem): string | null {
    if (challenge.activeFrom) { const from = new Date(challenge.activeFrom); const to = challenge.activeTo ? new Date(challenge.activeTo) : null; const days = to ? (to.getTime() - from.getTime()) / 86_400_000 : Infinity; if (days <= 400) return String(from.getFullYear()); return null; }
    return challenge.name?.match(/\b(20\d{2})\b/)?.[1] ?? null;
  }

  const peakChallengeCountMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const c of allChallenges) for (const id of computePeakIds(c)) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChallenges, allPoints]);

  const points = useMemo(() => {
    const normalizedSelected = new Set(ensureArray<string>(selectedLetters).map((l) => normalizeLetter(l)));
    const query = peakSearchQuery.trim().toLocaleLowerCase("cs");
    return allPoints.filter((point) => {
      const title = (point.peakName ?? point.name ?? "").trim();
      if (!title) return false;
      if (selectedRangeUrls.length > 0 && !selectedRangeUrls.some((url) => (point.source ?? "").startsWith(url))) return false;
      if (normalizedSelected.size > 0 && letterMode === "strict" && !showOtherLetters && !normalizedSelected.has(normalizeLetter(title))) return false;
      if (query) return title.toLocaleLowerCase("cs").includes(query);
      return true;
    });
  }, [allPoints, selectedRangeUrls, selectedLetters, letterMode, showOtherLetters, peakSearchQuery]);

  const sortedPoints = useMemo(() => {
    const extractId = (link?: string) => { const m = /\/mountain\/(\d+)-/.exec(link ?? ""); return m ? Number(m[1]) : null; };
    return [...points].sort((a, b) => {
      if (peakSort === "challenges") { const aC = peakChallengeCountMap.get(extractId(a.mountainLink) ?? -1) ?? 0; const bC = peakChallengeCountMap.get(extractId(b.mountainLink) ?? -1) ?? 0; if (bC !== aC) return bC - aC; }
      return (a.peakName ?? a.name ?? "").toLocaleLowerCase("cs").localeCompare((b.peakName ?? b.name ?? "").toLocaleLowerCase("cs"), "cs");
    });
  }, [points, peakSort, peakChallengeCountMap]);

  const visiblePoints = useMemo(() => {
    if (!filterByMapBounds || !mapBounds) return sortedPoints;
    return sortedPoints.filter((p) => { const lat = Number(p.lat); const lon = Number(p.lon); return lat >= mapBounds.south && lat <= mapBounds.north && lon >= mapBounds.west && lon <= mapBounds.east; });
  }, [sortedPoints, filterByMapBounds, mapBounds]);

  const areaAscentStats = useMemo(() => {
    const map = new Map<string, { visited: number; total: number }>();
    for (const point of allPoints) {
      const areaUrl = (point.source ?? "").split("#")[0]; if (!areaUrl) continue;
      const peakId = getPeakId(point.mountainLink); const visited = peakId !== null && userAscents.has(peakId);
      const existing = map.get(areaUrl);
      if (existing) { existing.total++; if (visited) existing.visited++; } else map.set(areaUrl, { total: 1, visited: visited ? 1 : 0 });
    }
    return map;
  }, [allPoints, userAscents]);

  const peakById = useMemo(() => {
    const map = new Map<number, MapPoint>();
    for (const p of allPoints) { const id = getPeakId(p.mountainLink); if (id !== null) map.set(id, p); }
    return map;
  }, [allPoints]);

  const peakChallengesMap = useMemo(() => {
    const map = new Map<number, ChallengeItem[]>();
    for (const challenge of allChallenges) { for (const peakId of computePeakIds(challenge)) { const existing = map.get(peakId); if (existing) existing.push(challenge); else map.set(peakId, [challenge]); } }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChallenges, allPoints]);

  const challengeCompletionMap = useMemo(() => {
    const map = new Map<string, { visited: number; total: number; levels?: { level: number; visited: number; total: number }[] }>();
    function countVisited(ids: number[], year: string | null): number {
      let n = 0;
      for (const id of ids) { const a = userAscents.get(id); if (!a) continue; if (year) { if (a.dates.some((d) => d.startsWith(year))) n++; } else n++; }
      return n;
    }
    for (const challenge of allChallenges) {
      const ids = computePeakIds(challenge);
      if (ids.length === 0 && !challenge.levels?.length) continue;
      const year = getChallengeYear(challenge); const visited = countVisited(ids, year);
      const levelStats = challenge.levels?.map((lv) => { const pool = lv.peakIds.length > 0 ? lv.peakIds : ids; return { level: lv.level, visited: lv.peakIds.length > 0 ? countVisited(pool, year) : visited, total: lv.total }; });
      if (challenge.id) { const total = challenge.levels?.length ? Math.max(...challenge.levels.map((l) => l.total)) : ids.length; map.set(challenge.id, { visited, total, levels: levelStats }); }
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChallenges, allPoints, userAscents]);

  return { visiblePoints, sortedPoints, areaAscentStats, peakById, peakChallengesMap, challengeCompletionMap, computePeakIds, getChallengeYear };
}
