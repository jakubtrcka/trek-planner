"use client";

import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { useChat } from "ai/react";
import { Castle, ChevronDown, Loader2, MapPinned, Mountain, Route, Settings2, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, useEffect } from "react";
import { ScrollArea } from "../components/ui/scroll-area";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";
import { useUserAscents } from "../hooks/useUserAscents";
import { useUserVisits } from "../hooks/useUserVisits";
import { useUserChallenges } from "../hooks/useUserChallenges";
import { useIsAdmin } from "../hooks/useIsAdmin";
import { useMapEffects } from "../hooks/useMapEffects";
import { useTripLayer } from "../hooks/useTripLayer";
import { useCastles } from "../hooks/useCastles";
import { authClient } from "../lib/auth-client";
import { AppHeader } from "../components/AppHeader";
import { TripPanel } from "../components/TripPanel";
import { ChatPanel } from "../components/ChatPanel";
import { CastleDetail } from "../components/CastleDetail";
import { MapContainer } from "../components/MapContainer";
import { PeaksSidebar } from "../components/PeaksSidebar";
import { CastlesSidebar } from "../components/CastlesSidebar";
import { PeakDetail } from "../components/PeakDetail";
import { RoutesSidebar } from "../components/RoutesSidebar";
import { ChallengesContent } from "../components/ChallengesContent";
import { SELECTED_LETTER_COLORS, ensureArray, normalizeLetter } from "../lib/page-utils";
import { useChallenges } from "../hooks/useChallenges";
import { useDataFetching } from "../hooks/useDataFetching";
import { useAreas } from "../hooks/useAreas";
import type { CountryCode, MapPoint, PlannedRoute, SectionKey } from "../lib/page-types";
import type { CastlePoint } from "../lib/castles/types";
import type { BaseMapType } from "../lib/page-config";

export default function HomePage() {
  const { data: session } = authClient.useSession();
  const isAdmin = useIsAdmin();
  const { ascentsMap: userAscents, mutate: mutateAscents } = useUserAscents();
  const { visits: userVisits, mutate: mutateVisits } = useUserVisits();
  const { completedChallengeIds } = useUserChallenges();

  // ─── Navigation & UI state ───────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<SectionKey>("peaks");
  const [activeModule, setActiveModule] = useState<"hory" | "routes" | "trips" | "zamky">("hory");
  const [castleSearchQuery, setCastleSearchQuery] = useState("");
  const [isModulePanelOpen, setIsModulePanelOpen] = useState(true);
  const [selectedPeak, setSelectedPeak] = useState<MapPoint | null>(null);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [expandedChallengeId, setExpandedChallengeId] = useState<string | null>(null);
  const [filterByMapBounds, setFilterByMapBounds] = useState(true);
  const [openFilters, setOpenFilters] = useState<Set<string>>(new Set());
  const [peakSort, setPeakSort] = useState<"alpha" | "challenges">("alpha");
  const [peakSearchQuery, setPeakSearchQuery] = useState("");
  const [selectedLetters, setSelectedLetters] = useState<string[]>([]);
  const [letterMode, setLetterMode] = useState<"strict" | "prefer">("strict");
  const [showOtherLetters, setShowOtherLetters] = useState(false);
  const [baseMap, setBaseMap] = useState<BaseMapType>("mapycz-outdoor");
  useEffect(() => {
    const stored = localStorage.getItem("hory-basemap") as BaseMapType | null;
    if (stored) setBaseMap(stored);
  }, []);
  const [selectedAreaSlugs, setSelectedAreaSlugs] = useState<string[]>([]);
  const { areas: dbAreas } = useAreas();
  useEffect(() => {
    const stored = localStorage.getItem("hory-area-filter");
    if (!stored) return;
    try {
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;
      const valid = (parsed as unknown[]).filter((s): s is string => typeof s === "string");
      setSelectedAreaSlugs(valid);
    } catch {
      // ignore malformed storage
    }
  }, []);
  useEffect(() => {
    if (dbAreas.length === 0) return;
    setSelectedAreaSlugs((prev) => {
      const sanitized = prev.filter((s) => dbAreas.some((a) => a.slug === s));
      if (sanitized.length === prev.length) return prev;
      return sanitized;
    });
  }, [dbAreas]);
  useEffect(() => {
    localStorage.setItem("hory-area-filter", JSON.stringify(selectedAreaSlugs));
  }, [selectedAreaSlugs]);
  const [showPeakFilter, setShowPeakFilter] = useState(false);
  const [challengeSort, setChallengeSort] = useState<"default" | "alpha" | "completion">("default");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeTripId, setActiveTripId] = useState<number | null>(null);
  const [waypointStatus, setWaypointStatus] = useState<string | null>(null);
  const activeTripIdRef = useRef<number | null>(null);
  activeTripIdRef.current = activeTripId;
  const waypointCountRef = useRef(0);

  // ─── Map refs ────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const areaSelectMapContainerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const areaSelectMapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const areaPeaksLayerGroupRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peakMarkersRef = useRef<Map<string, any>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const areaBaseLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiLayerGroupRef = useRef<any>(null);
  const challengePeakIdsRef = useRef<Set<number>>(new Set());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiRouteLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tripLayerRef = useRef<any>(null);
  const mapBoundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapBounds, setMapBounds] = useState<{ south: number; west: number; north: number; east: number } | null>(null);

  const [selectedCastle, setSelectedCastle] = useState<CastlePoint | null>(null);
  const [showCastlesLayer, setShowCastlesLayer] = useState(true);
  const [filterCastlesByMapBounds, setFilterCastlesByMapBounds] = useState(true);
  useEffect(() => { if (activeModule === "zamky") setShowCastlesLayer(true); }, [activeModule]);

  // ─── Domain hooks ─────────────────────────────────────────────────────────
  const fetch$ = useDataFetching({ userAscents, mutateAscents, setActiveSection });
  const { castles } = useCastles();
  const visibleCastles = useMemo(() => {
    if (!filterCastlesByMapBounds || !mapBounds) return castles;
    return castles.filter((c) =>
      c.lat >= mapBounds.south && c.lat <= mapBounds.north &&
      c.lon >= mapBounds.west && c.lon <= mapBounds.east
    );
  }, [castles, filterCastlesByMapBounds, mapBounds]);
  const { allPoints, selectedCountries, setSelectedCountries, selectedRangeUrls, setSelectedRangeUrls, rangeOptions } = fetch$;
  const allChallenges = fetch$.allChallenges;
  const areaFilteredPoints = useMemo(() => {
    if (selectedAreaSlugs.length === 0) return allPoints;
    return allPoints.filter((p) => p.areaSlugs?.some((s) => selectedAreaSlugs.includes(s)) ?? false);
  }, [allPoints, selectedAreaSlugs]);
  const ch = useChallenges({ allPoints: areaFilteredPoints, allChallenges: fetch$.allChallenges, userAscents, selectedLetters, letterMode, showOtherLetters, selectedRangeUrls, peakSort, peakSearchQuery, filterByMapBounds, mapBounds });
  const { visiblePoints, sortedPoints, areaAscentStats, peakById, peakChallengesMap, challengeCompletionMap, computePeakIds, getChallengeYear } = ch;

  // Points visible on map based on active module
  const mapPeakPoints = activeModule === "zamky" ? [] : visiblePoints;
  const effectiveShowCastles = activeModule === "hory"
    ? false
    : activeModule === "zamky"
    ? true
    : showCastlesLayer;

  function pointColorByName(name: string): string { const first = name.trim()[0]?.toUpperCase() ?? null; if (!first) return "#6f7f89"; return selectedLetterColorMap.get(normalizeLetter(first)) ?? "#6f7f89"; }

  // ─── AI chat ─────────────────────────────────────────────────────────────
  const { messages, input, handleInputChange, handleSubmit, isLoading: chatLoading } = useChat({ api: "/api/chat" });

  const aiMapPoints = useMemo(() => {
    const pts: { lat: number; lon: number; name: string; description?: string; type?: string }[] = [];
    for (const msg of messages) for (const inv of msg.toolInvocations ?? []) if (inv.toolName === "showPointsOnMap" && "result" in inv) pts.push(...((inv.result as { points: typeof pts }).points ?? []));
    return pts;
  }, [messages]);

  const aiRoute = useMemo((): { lat: number; lon: number }[] => {
    for (let i = messages.length - 1; i >= 0; i--) for (const inv of messages[i].toolInvocations ?? []) if (inv.toolName === "planRoute" && "result" in inv) { const r = inv.result as { coordinates?: { lat: number; lon: number }[] }; if (r.coordinates?.length) return r.coordinates; }
    return [];
  }, [messages]);

  const locationIdToPeak = useMemo(() => {
    const map = new Map<number, MapPoint>();
    for (const p of allPoints) if (p.locationId !== undefined) map.set(p.locationId, p);
    return map;
  }, [allPoints]);

  const selectedLetterColorMap = useMemo(() => {
    const map = new Map<string, string>();
    ensureArray<string>(selectedLetters).forEach((l, i) => map.set(normalizeLetter(l), SELECTED_LETTER_COLORS[i % SELECTED_LETTER_COLORS.length]));
    return map;
  }, [selectedLetters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedLetters.length > 0) count++;
    if (selectedAreaSlugs.length > 0) count++;
    if (selectedRangeUrls.length > 0) count++;
    if (selectedCountries.length !== 1 || !selectedCountries.includes("cz")) count++;
    return count;
  }, [selectedLetters, selectedAreaSlugs, selectedRangeUrls, selectedCountries]);

  // ─── Map effects ─────────────────────────────────────────────────────────
  useMapEffects({
    baseMap, mapReady, activeSection, activeModule,
    selectedPeak, selectedChallengeId, modulePoints: mapPeakPoints,
    castlePoints: castles, showCastles: effectiveShowCastles,
    allChallenges, allPoints, userAscents, peakById, selectedLetterColorMap,
    areaSelectMapContainerRef, areaSelectMapRef, areaPeaksLayerGroupRef, peakMarkersRef,
    areaBaseLayerRef, leafletRef, aiLayerGroupRef, aiRouteLayerRef, challengePeakIdsRef,
    mapBoundsTimerRef, activeTripIdRef, waypointCountRef, aiMapPoints, aiRoute,
    setMapReady, setMapBounds, setError: fetch$.setError,
    setSelectedPeak, setSelectedCastle, setWaypointStatus,
    computePeakIds, pointColorByName,
  });

  useTripLayer({
    activeTripId, mapReady, waypointStatus,
    leafletRef, areaSelectMapRef, tripLayerRef,
    locationIdToPeak, setSelectedPeak,
  });

  useEffect(() => {
    if (!selectedCastle || !areaSelectMapRef.current) return;
    areaSelectMapRef.current.flyTo([selectedCastle.lat, selectedCastle.lon], 14, { duration: 0.8 });
  }, [selectedCastle]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapReady || !areaSelectMapRef.current) return;
    const t = setTimeout(() => areaSelectMapRef.current.invalidateSize(), 210);
    return () => clearTimeout(t);
  }, [isModulePanelOpen, mapReady]);

  // ─── Waypoint mutations ───────────────────────────────────────────────────
  async function handleWaypointDelete(tripId: number, waypointId: number) {
    await fetch(`/api/trips/${tripId}/waypoints/${waypointId}`, { method: "DELETE" });
    setWaypointStatus((prev) => prev !== null ? String(Number(prev) + 1) : "1");
  }

  async function handleWaypointReorder(tripId: number, orderedIds: number[]) {
    await fetch(`/api/trips/${tripId}/waypoints`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderedIds }) });
    setWaypointStatus((prev) => prev !== null ? String(Number(prev) + 1) : "1");
  }

  // ─── Visit check-in ───────────────────────────────────────────────────────
  async function handleVisitChange(externalId: string, action: "add" | "remove") {
    if (action === "add") {
      await fetch("/api/user-visits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId: externalId }) });
    } else {
      await fetch(`/api/user-visits/${encodeURIComponent(externalId)}`, { method: "DELETE" });
    }
    await Promise.all([mutateAscents(), mutateVisits()]);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function toggleFilter(key: string) { setOpenFilters((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; }); }
  function handleToggleLetter(letter: string) { setSelectedLetters((prev) => prev.includes(letter) ? prev.filter((l) => l !== letter) : [...prev, letter].sort((a, b) => a.localeCompare(b))); }
  function handleToggleAreaSlug(slug: string) { setSelectedAreaSlugs((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]); }
  function handleClearAreaFilter() { setSelectedAreaSlugs([]); }
  function handleToggleCountry(code: CountryCode) {
    setSelectedCountries((prev) => {
      if (prev.includes(code)) { if (prev.length <= 1) return prev; const next = prev.filter((c) => c !== code); void fetch$.loadCachedPeaksForCountries(next); return next; }
      const next = [...prev, code]; void fetch$.loadCachedPeaksForCountries(next); return next;
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppHeader onLoginSuccess={() => void fetch$.loadUserAscents(true)} />
      <main className="flex flex-1 min-h-0 overflow-hidden bg-zinc-100 text-zinc-950">
        <aside className="flex shrink-0 bg-white shadow-[20px_0_60px_rgba(15,23,42,0.05)]">
          <div className="flex w-16 flex-col items-center border-r border-zinc-200 bg-white">
            <div className="flex h-16 w-full items-center justify-center border-b border-zinc-200">
              <button type="button" onClick={() => setIsModulePanelOpen((v) => !v)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-900" title={isModulePanelOpen ? "Skrýt panel" : "Otevřít panel"}>
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isModulePanelOpen ? "rotate-90" : "-rotate-90")} />
              </button>
            </div>
            <div className="flex flex-1 flex-col items-center gap-2 py-3">
              {([["routes", <Route key="r" className="h-5 w-5" />, "Plánování tras"], ["trips", <MapPinned key="t" className="h-5 w-5" />, "Výlety"]] as [string, React.ReactNode, string][]).map(([key, icon, title]) => (
                <button key={key} type="button" title={title} onClick={() => { setActiveModule(key as typeof activeModule); setIsModulePanelOpen(true); }} className={cn("flex h-11 w-11 items-center justify-center rounded-2xl border transition", activeModule === key ? "border-zinc-900 bg-zinc-950 text-white" : "border-transparent text-zinc-500 hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900")}>{icon}</button>
              ))}
              <div className="my-1 h-px w-6 bg-zinc-200" />
              <button type="button" title="Hory" onClick={() => { setActiveModule("hory"); setIsModulePanelOpen(true); }} className={cn("flex h-11 w-11 items-center justify-center rounded-2xl border transition", activeModule === "hory" ? "border-zinc-900 bg-zinc-950 text-white" : "border-transparent text-zinc-500 hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900")}><Mountain className="h-5 w-5" /></button>
              <button type="button" title="Zámky" onClick={() => { setActiveModule("zamky"); setIsModulePanelOpen(true); }} className={cn("flex h-11 w-11 items-center justify-center rounded-2xl border transition", activeModule === "zamky" ? "border-zinc-900 bg-zinc-950 text-white" : "border-transparent text-zinc-500 hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900")}><Castle className="h-5 w-5" /></button>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-2 border-t border-zinc-200 py-3">
              {!!session && isAdmin && <Link href="/admin" className="flex h-11 w-11 items-center justify-center rounded-2xl border border-transparent text-zinc-400 transition hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900" title="Nastavení"><Settings2 className="h-4 w-4" /></Link>}
            </div>
          </div>
          <div className={cn("flex h-full flex-col bg-white transition-[width] duration-200 ease-out", isModulePanelOpen ? "w-[300px] border-r border-zinc-200" : "w-0")}>
            <div className={cn("flex h-full flex-col", !isModulePanelOpen && "invisible")}>
              <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-4">
                <div><p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">{activeModule === "hory" || activeModule === "zamky" ? "Modul" : "Nástroj"}</p><p className="text-sm font-semibold text-zinc-900">{activeModule === "routes" ? "Plánování tras" : activeModule === "trips" ? "Výlety" : activeModule === "zamky" ? "Zámky" : "Hory"}</p></div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col border-t border-zinc-200">
                {activeModule === "trips" && <ScrollArea className="flex-1"><div className="px-4 py-4 space-y-4">{activeTripId !== null && <p className="text-xs text-zinc-500">Kliknutím na vrchol ho přidáš do výletu.</p>}{waypointStatus && <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">{waypointStatus}</p>}<TripPanel activeTripId={activeTripId} onActiveTripChange={setActiveTripId} onTripDelete={() => setActiveTripId(null)} onWaypointDelete={handleWaypointDelete} onWaypointReorder={handleWaypointReorder} /></div></ScrollArea>}
                {activeModule === "routes" && <ScrollArea className="flex-1"><div className="px-4 py-4 space-y-6">{fetch$.statusMessage && <div className="rounded-2xl border border-red-200 bg-red-50/70 p-3 text-sm text-zinc-700">{fetch$.statusMessage}</div>}<RoutesSidebar aiPrompt={fetch$.aiPrompt} aiLoading={fetch$.aiLoading} aiIntent={fetch$.aiIntent} aiParser={fetch$.aiParser} routePlanningLoading={fetch$.routePlanningLoading} maxDistance={fetch$.maxDistance} routeMode={fetch$.routeMode} onAiPromptChange={fetch$.setAiPrompt} onAiSubmit={(e) => void fetch$.handleAiPlanningSubmit(e, visiblePoints)} onRoutePlanningSubmit={(e) => void fetch$.handleRoutePlanningSubmit(e, visiblePoints)} onMaxDistanceChange={fetch$.setMaxDistance} onRouteModeChange={fetch$.setRouteMode} />{fetch$.routePlans.length > 0 && <div className="space-y-3">{fetch$.routePlans.map((route: PlannedRoute) => <div key={route.id} className="rounded-3xl border border-zinc-200 bg-zinc-50/70 p-5 space-y-2"><p className="font-semibold text-zinc-950">{route.title}</p><p className="text-sm text-zinc-500">{route.distanceKm.toFixed(1)} km • {Math.round(route.durationMinutes / 60)} h {route.durationMinutes % 60} min • {route.ascentMeters} m</p><p className="text-sm text-zinc-600">{ensureArray<{ name: string }>(route.peaks).map((p) => p.name).join(", ")}</p><a href={route.mapyCzUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100">Otevřít na Mapy.cz</a></div>)}<Badge variant="outline" className="rounded-full">{fetch$.routePlans.length} tras {fetch$.routeInfo ? `— ${fetch$.routeInfo}` : ""}</Badge></div>}</div></ScrollArea>}
                {activeModule === "zamky" && <ScrollArea className="flex-1"><div className="px-4 py-4">{selectedCastle ? <CastleDetail castle={selectedCastle} userVisits={userVisits} isLoggedIn={!!session} onVisitChange={handleVisitChange} onBack={() => setSelectedCastle(null)} /> : <CastlesSidebar castles={visibleCastles} allCastlesCount={castles.length} userVisits={userVisits} searchQuery={castleSearchQuery} selectedCastle={selectedCastle} filterByMapBounds={filterCastlesByMapBounds} onSearchChange={setCastleSearchQuery} onCastleSelect={setSelectedCastle} onFilterByMapBoundsChange={setFilterCastlesByMapBounds} />}</div></ScrollArea>}
                {activeModule === "hory" && <>
                  <div className="flex shrink-0 items-center gap-1 border-b border-zinc-200 px-3 py-2">
                    {(["peaks", "challenges"] as SectionKey[]).map((key) => <button key={key} type="button" onClick={() => setActiveSection(key)} className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition", activeSection === key ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-700")}>{key === "peaks" ? <Mountain className="h-4 w-4" /> : null}{key === "peaks" ? "Vrcholy" : "Výzvy"}</button>)}
                    {activeSection === "peaks" && !selectedPeak && (
                      <button type="button" title="Filtry" onClick={() => setShowPeakFilter((v) => !v)} className={cn("relative ml-auto flex h-8 w-8 items-center justify-center rounded-xl border transition", showPeakFilter ? "border-zinc-800 bg-zinc-800 text-white" : "border-zinc-200 text-zinc-400 hover:border-zinc-300 hover:text-zinc-700")}>
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-white">{activeFilterCount}</span>}
                      </button>
                    )}
                  </div>
                  <ScrollArea className="flex-1"><div className="px-4 py-4">
                    {fetch$.statusMessage && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50/70 p-3 text-sm text-zinc-700">{fetch$.statusMessage}</div>}
                    {activeSection === "challenges" ? <ChallengesContent allChallenges={allChallenges} challengeSort={challengeSort} categoryFilter={categoryFilter} selectedChallengeId={selectedChallengeId} expandedChallengeId={expandedChallengeId} challengeCompletionMap={challengeCompletionMap} userAscents={userAscents} peakById={peakById} completedChallengeIds={completedChallengeIds} onChallengeSortChange={setChallengeSort} onCategoryFilterChange={setCategoryFilter} onChallengeSelect={setSelectedChallengeId} onExpandedChallengeChange={setExpandedChallengeId} getChallengeYear={getChallengeYear} computePeakIds={computePeakIds} />
                    : selectedPeak ? <PeakDetail peak={selectedPeak} userAscents={userAscents} userVisits={userVisits} peakChallengesMap={peakChallengesMap} getPeakId={(link) => { const m = /\/mountain\/(\d+)-/.exec(link ?? ""); return m ? Number(m[1]) : null; }} isLoggedIn={!!session} onVisitChange={handleVisitChange} onBack={() => setSelectedPeak(null)} />
                    : <div className="space-y-4">
                        {showPeakFilter && (
                          <div className="space-y-1 rounded-2xl border border-zinc-100 bg-zinc-50 p-3">
                            <div className="flex items-center justify-between gap-2 pb-1">
                              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-zinc-500"><input type="checkbox" checked={filterByMapBounds} onChange={(e) => setFilterByMapBounds(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />Filtrovat podle mapy</label>
                              <button type="button" onClick={() => void fetch$.loadUserAscents(false)} disabled={fetch$.ascentsLoading} className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-950 disabled:opacity-50">{fetch$.ascentsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className={cn("h-2 w-2 rounded-full", userAscents.size > 0 ? "bg-amber-400" : "bg-zinc-300")} />}{userAscents.size > 0 ? `${userAscents.size} výstupů` : "Výstupy"}</button>
                            </div>
                            <PeaksSidebar showFilter={showPeakFilter} selectedCountries={selectedCountries} selectedLetters={selectedLetters} letterMode={letterMode} showOtherLetters={showOtherLetters} selectedRangeUrls={selectedRangeUrls} rangeOptions={rangeOptions} peakSort={peakSort} peakSearchQuery={peakSearchQuery} visiblePoints={visiblePoints} sortedPoints={sortedPoints} selectedPeak={selectedPeak} openFilters={openFilters} selectedLetterColorMap={selectedLetterColorMap} areaAscentStats={areaAscentStats} userAscents={userAscents} peakChallengesMap={peakChallengesMap} dbAreas={dbAreas} selectedAreaSlugs={selectedAreaSlugs} filteredCount={areaFilteredPoints.length} onToggleCountry={handleToggleCountry} onToggleLetter={handleToggleLetter} onLetterModeChange={setLetterMode} onShowOtherLettersChange={setShowOtherLetters} onToggleRange={(url) => setSelectedRangeUrls((prev) => prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url])} onSelectAllRanges={() => setSelectedRangeUrls(rangeOptions.map((r) => r.url))} onClearRanges={() => setSelectedRangeUrls([])} onToggleAreaSlug={handleToggleAreaSlug} onClearAreaFilter={handleClearAreaFilter} onPeakSortChange={setPeakSort} onSearchChange={setPeakSearchQuery} onPeakSelect={setSelectedPeak} onFilterToggle={toggleFilter} getPeakId={(link) => { const m = /\/mountain\/(\d+)-/.exec(link ?? ""); return m ? Number(m[1]) : null; }} pointColorByName={pointColorByName} />
                          </div>
                        )}
                        {!showPeakFilter && (
                          <PeaksSidebar showFilter={false} selectedCountries={selectedCountries} selectedLetters={selectedLetters} letterMode={letterMode} showOtherLetters={showOtherLetters} selectedRangeUrls={selectedRangeUrls} rangeOptions={rangeOptions} peakSort={peakSort} peakSearchQuery={peakSearchQuery} visiblePoints={visiblePoints} sortedPoints={sortedPoints} selectedPeak={selectedPeak} openFilters={openFilters} selectedLetterColorMap={selectedLetterColorMap} areaAscentStats={areaAscentStats} userAscents={userAscents} peakChallengesMap={peakChallengesMap} dbAreas={dbAreas} selectedAreaSlugs={selectedAreaSlugs} filteredCount={areaFilteredPoints.length} onToggleCountry={handleToggleCountry} onToggleLetter={handleToggleLetter} onLetterModeChange={setLetterMode} onShowOtherLettersChange={setShowOtherLetters} onToggleRange={(url) => setSelectedRangeUrls((prev) => prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url])} onSelectAllRanges={() => setSelectedRangeUrls(rangeOptions.map((r) => r.url))} onClearRanges={() => setSelectedRangeUrls([])} onToggleAreaSlug={handleToggleAreaSlug} onClearAreaFilter={handleClearAreaFilter} onPeakSortChange={setPeakSort} onSearchChange={setPeakSearchQuery} onPeakSelect={setSelectedPeak} onFilterToggle={toggleFilter} getPeakId={(link) => { const m = /\/mountain\/(\d+)-/.exec(link ?? ""); return m ? Number(m[1]) : null; }} pointColorByName={pointColorByName} />
                        )}
                      </div>}
                  </div></ScrollArea>
                </>}
              </div>
            </div>
          </div>
        </aside>
        <div className="relative min-w-0 flex-1 overflow-hidden isolate">
          <MapContainer containerRef={areaSelectMapContainerRef} />
          {selectedCastle && activeModule !== "zamky" && (
            <div className="absolute top-4 right-4 z-[900] w-80">
              <CastleDetail castle={selectedCastle} userVisits={userVisits} isLoggedIn={!!session} onVisitChange={handleVisitChange} onBack={() => setSelectedCastle(null)} />
            </div>
          )}
          <ChatPanel messages={messages} input={input} isLoading={chatLoading} onInputChange={handleInputChange} onSubmit={handleSubmit} />
        </div>
      </main>
    </div>
  );
}
