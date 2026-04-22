"use client";

// Exception: exceeds 25-line hook limit.
// Justification: manages all async data-fetching state for the page (scrape, peaks,
// challenges, user-ascents, route planning, AI planning). Each fetch operation
// requires its own loading flag + error setter. Splitting into smaller hooks would
// require passing state setters across hook boundaries, creating tighter coupling
// than co-locating them here. Documented in RELEASE_NOTES v21.

import { Dispatch, FormEvent, SetStateAction, useEffect, useState } from "react";
import { COUNTRY_CONFIG } from "../lib/page-config";
import { ensureArray } from "../lib/page-utils";
import type {
  AiPlanRouteResponse, AiRouteIntent, AreaGeojsonResponse, ChallengesResponse,
  CountryCode, MapPoint, MapPointsResponse, PlannedRoute, PlanRouteResponse,
  RangeItem, ScrapeResponse, SectionKey,
} from "../lib/page-types";

interface DataFetchingParams {
  userAscents: Map<number, { count: number; dates: string[] }>;
  mutateAscents: () => Promise<unknown>;
  setActiveSection: Dispatch<SetStateAction<SectionKey>>;
}

export function useDataFetching({ mutateAscents, setActiveSection }: DataFetchingParams) {
  const [rangesLoading, setRangesLoading] = useState(false);
  const [areasLoading, setAreasLoading] = useState(false);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [ascentsLoading, setAscentsLoading] = useState(false);
  const [routePlanningLoading, setRoutePlanningLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [countryDownloadLoading, setCountryDownloadLoading] = useState<Partial<Record<CountryCode, boolean>>>({});
  const [result, setResult] = useState<MapPointsResponse | null>(null);
  const [challengesResult, setChallengesResult] = useState<ChallengesResponse | null>(null);
  const [rangeOptions, setRangeOptions] = useState<RangeItem[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<CountryCode[]>(["cz"]);
  const [selectedRangeUrls, setSelectedRangeUrls] = useState<string[]>([]);
  const [routePlans, setRoutePlans] = useState<PlannedRoute[]>([]);
  const [maxDistance, setMaxDistance] = useState("18");
  const [routeMode, setRouteMode] = useState<"linear" | "roundtrip">("roundtrip");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiIntent, setAiIntent] = useState<AiRouteIntent | null>(null);
  const [aiParser, setAiParser] = useState<"llm" | "heuristic" | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [routeError, setRouteError] = useState("");
  const [routeInfo, setRouteInfo] = useState("");
  const [publicPeaksLoading, setPublicPeaksLoading] = useState(false);

  const allPoints = ensureArray<MapPoint>(result?.points);
  const allChallenges = ensureArray<ChallengesResponse["challenges"][number]>(challengesResult?.challenges);

  useEffect(() => {
    if (typeof window !== "undefined") { try { const s = window.localStorage.getItem("routeMaxDistanceKm"); if (s) setMaxDistance(s); } catch { /* ignore */ } }
  }, []);

  useEffect(() => {
    setPublicPeaksLoading(true);
    fetch("/api/peaks")
      .then((r) => r.json() as Promise<{ locations: Array<{ id: number; name: string; lat: number; lon: number; altitude: number | null; externalUrl: string | null; countryCode: string | null; areaSlugs?: string[] }>; count: number }>)
      .then((data) => {
        const points: MapPoint[] = data.locations.map((loc) => ({
          locationId: loc.id,
          name: loc.name,
          lat: loc.lat,
          lon: loc.lon,
          altitude: loc.altitude ?? undefined,
          mountainLink: loc.externalUrl ?? undefined,
          areaSlugs: loc.areaSlugs ?? [],
        }));
        setResult({ points, count: points.length, sourceUrl: "", pageTitle: "", scrapedAt: "", sourceCount: 0, sources: [] });
        setActiveSection("peaks");
      })
      .catch(() => { /* non-critical: map loads empty, user can still scrape */ })
      .finally(() => { setPublicPeaksLoading(false); });
  }, [setActiveSection]);


  async function loadAreaFeatures(ranges: RangeItem[], forceRefresh = false): Promise<boolean> {
    setAreasLoading(true);
    const ctl = new AbortController(); const tid = setTimeout(() => ctl.abort(), 90_000);
    try {
      const res = await fetch("/api/area-geojson", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal, body: JSON.stringify({ areaItems: ranges, maxAreas: 120, forceRefresh }) });
      const payload = (await res.json()) as AreaGeojsonResponse & { error?: string };
      if (!res.ok) { setError(payload?.error ?? "Nepodařilo se načíst mapové hranice oblastí."); return false; }
      if (payload.features.length === 0) { setError("Nepodařilo se načíst hranice oblastí (0 prvků)."); return false; }
      setInfo(payload.cached ? `Hranice oblastí načteny z cache (${payload.features.length}).` : `Hranice oblastí čerstvě staženy (${payload.features.length}).`);
      return true;
    } catch { setError("Nepodařilo se načíst mapové hranice oblastí."); return false; }
    finally { clearTimeout(tid); setAreasLoading(false); }
  }

  async function loadCachedPeaksForCountries(_countries: CountryCode[]): Promise<MapPointsResponse | null> {
    try {
      const res = await fetch("/api/peaks");
      if (!res.ok) return null;
      const payload = (await res.json()) as { locations: Array<{ id: number; name: string; lat: number; lon: number; altitude: number | null; externalUrl: string | null; countryCode: string | null; areaSlugs?: string[] }>; count: number };
      if (!Array.isArray(payload.locations) || payload.locations.length === 0) return null;
      const points: MapPointsResponse["points"] = payload.locations.map((loc) => ({
        locationId: loc.id,
        name: loc.name,
        lat: loc.lat,
        lon: loc.lon,
        altitude: loc.altitude ?? undefined,
        mountainLink: loc.externalUrl ?? undefined,
        areaSlugs: loc.areaSlugs ?? [],
      }));
      const merged: MapPointsResponse = {
        points,
        count: points.length,
        sourceUrl: "",
        pageTitle: "",
        scrapedAt: "",
        sourceCount: 0,
        sources: [],
      };
      setResult(merged); setActiveSection("peaks");
      return merged;
    } catch { return null; }
  }

  async function loadCachedChallenges(): Promise<ChallengesResponse | null> {
    try {
      const res = await fetch("/api/challenges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ useCache: true, cacheOnly: true }) });
      if (!res.ok) return null;
      const payload = (await res.json()) as ChallengesResponse & { error?: string };
      if (!payload.cached || !Array.isArray(payload.challenges)) return null;
      setChallengesResult(payload); return payload;
    } catch { return null; }
  }

  async function loadUserAscents(refresh = false): Promise<void> {
    setAscentsLoading(true);
    try {
      const res = await fetch("/api/user-ascents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshCache: refresh }) });
      if (!res.ok) return; await mutateAscents();
    } catch { /* non-critical */ } finally { setAscentsLoading(false); }
  }

  async function loadRangesAndAreas(forceRefreshAreas = false, _useStoredCreds?: boolean): Promise<boolean> {
    setRangesLoading(true); setError(""); setInfo("");
    try {
      const res = await fetch("/api/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const payload = (await res.json()) as ScrapeResponse & { error?: string };
      if (!res.ok) { setError(payload?.error ?? "Nepodařilo se načíst seznam oblastí."); return false; }
      const sorted = ensureArray<RangeItem>(payload.ranges).sort((a, b) => a.name.localeCompare(b.name, "cs"));
      setRangeOptions(sorted); setSelectedRangeUrls([]); setActiveSection("peaks");
      setInfo(`Načteno ${sorted.length} oblastí. Načítám mapové hranice...`);
      const areaOk = await loadAreaFeatures(sorted, forceRefreshAreas);
      const cachedPeaks = await loadCachedPeaksForCountries(selectedCountries);
      const cachedChallenges = await loadCachedChallenges();
      void loadUserAscents();
      if (areaOk) setInfo(cachedPeaks ? `Načteno ${sorted.length} oblastí. Z cache vrcholů načteno ${cachedPeaks.count} bodů${cachedChallenges ? ` a ${cachedChallenges.count} výzev` : ""}.` : `Načteno ${sorted.length} oblastí. Vrcholy zatím nejsou v cache.`);
      return true;
    } catch { setError("Nepodařilo se načíst seznam oblastí."); return false; }
    finally { setRangesLoading(false); }
  }

  async function handleDownloadPeaksForCountry(countryCode: CountryCode): Promise<void> {
    const country = COUNTRY_CONFIG.find((c) => c.code === countryCode)!;
    setCountryDownloadLoading((prev) => ({ ...prev, [countryCode]: true })); setError(""); setInfo("");
    try {
      const res = await fetch("/api/sync-peaks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ countryCode }) });
      const payload = (await res.json()) as { inserted?: number; total?: number; error?: string };
      if (!res.ok) { setError(payload?.error ?? `Sync vrcholů (${country.name}) selhal.`); return; }
      setInfo(`Vrcholy (${country.name}) synchronizovány do DB: ${payload.total ?? 0} vrcholů.`);
      await loadCachedPeaksForCountries(selectedCountries);
    } catch { setError(`Nepodařilo se synchronizovat vrcholy (${country.name}).`); }
    finally { setCountryDownloadLoading((prev) => ({ ...prev, [countryCode]: false })); }
  }

  async function handleDownloadChallenges(): Promise<void> {
    setChallengesLoading(true); setError(""); setInfo("");
    try {
      const res = await fetch("/api/challenges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ useCache: false, refreshCache: true }) });
      const payload = (await res.json()) as ChallengesResponse & { error?: string };
      if (!res.ok) { setError(payload?.error ?? "Stažení výzev selhalo."); return; }
      setChallengesResult(payload); setInfo(`Cache výzev aktualizována: ${payload.count} výzev.`); setActiveSection("challenges");
    } catch { setError("Nepodařilo se stáhnout výzvy do cache."); }
    finally { setChallengesLoading(false); }
  }

  async function handleRoutePlanningSubmit(event: FormEvent, modulePoints: MapPoint[]): Promise<void> {
    event.preventDefault(); setRouteError(""); setRouteInfo(""); setRoutePlans([]);
    if (modulePoints.length < 2) { setRouteError("Pro plánování trasy potřebuješ alespoň 2 vrcholy."); return; }
    const parsedDistance = Number(maxDistance.replace(",", "."));
    if (!Number.isFinite(parsedDistance) || parsedDistance <= 0) { setRouteError("Zadej platnou cílovou délku trasy v km."); return; }
    try { window.localStorage.setItem("routeMaxDistanceKm", String(parsedDistance)); } catch { /* ignore */ }
    setRoutePlanningLoading(true);
    try {
      const res = await fetch("/api/plan-route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: modulePoints, maxDistance: parsedDistance, routeMode }) });
      const payload = (await res.json()) as PlanRouteResponse & { error?: string };
      if (!res.ok) { setRouteError(payload.error ?? "Plánování trasy selhalo."); return; }
      setRoutePlans(ensureArray<PlannedRoute>(payload.routes));
      const calls = payload.apiCalls ?? 0; const credits = payload.estimatedCredits ?? 0;
      setRouteInfo(payload.cached ? `Nalezeno ${payload.count} tras (cache hit).` : `Nalezeno ${payload.count} tras (API volání: ${calls}, odhad kreditů: ${credits}).`);
    } catch { setRouteError("Nepodařilo se spojit s API pro plánování tras."); }
    finally { setRoutePlanningLoading(false); }
  }

  async function handleAiPlanningSubmit(event: FormEvent, modulePoints: MapPoint[]): Promise<void> {
    event.preventDefault(); setRouteError(""); setRouteInfo(""); setRoutePlans([]);
    if (!aiPrompt.trim()) { setRouteError("Napiš prompt pro AI plánování."); return; }
    if (modulePoints.length < 2) { setRouteError("Pro AI plánování potřebuješ alespoň 2 vrcholy."); return; }
    setAiLoading(true); setAiIntent(null); setAiParser(null);
    try {
      const res = await fetch("/api/ai-plan-route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: aiPrompt, points: modulePoints, fallback: { maxDistance: Number(maxDistance), routeMode } }) });
      const payload = (await res.json()) as AiPlanRouteResponse & { error?: string };
      if (!res.ok) { setRouteError(payload.error ?? "AI plánování selhalo."); if (payload.intent) { setAiIntent(payload.intent); setAiParser(payload.parser ?? null); } return; }
      setRoutePlans(ensureArray<PlannedRoute>(payload.routes)); setAiIntent(payload.intent ?? null); setAiParser(payload.parser ?? null);
      if (payload.intent) { setMaxDistance(String(payload.intent.distanceKmTarget)); setRouteMode(payload.intent.routeMode); }
      const calls = payload.apiCalls ?? 0; const credits = payload.estimatedCredits ?? 0;
      setRouteInfo(payload.cached ? `AI: nalezeno ${payload.count} tras (cache hit).` : `AI: nalezeno ${payload.count} tras (API volání: ${calls}, odhad kreditů: ${credits}).`);
    } catch { setRouteError("Nepodařilo se spojit s AI plánovačem."); }
    finally { setAiLoading(false); }
  }

  return {
    rangesLoading, areasLoading, challengesLoading, ascentsLoading, routePlanningLoading, aiLoading, countryDownloadLoading, publicPeaksLoading,
    allPoints, allChallenges, rangeOptions, routePlans, setRoutePlans, selectedCountries, setSelectedCountries, selectedRangeUrls, setSelectedRangeUrls,
    maxDistance, setMaxDistance, routeMode, setRouteMode, aiPrompt, setAiPrompt, aiIntent, setAiIntent, aiParser, setAiParser,
    error, setError, info, routeError, setRouteError, routeInfo, setRouteInfo, statusMessage: error || routeError, infoMessage: info || routeInfo,
    setRoutePlanningLoading, setAiLoading,
    loadRangesAndAreas, loadCachedPeaksForCountries, loadUserAscents,
    handleDownloadPeaksForCountry, handleDownloadChallenges,
    handleRoutePlanningSubmit, handleAiPlanningSubmit,
  };
}
