"use client";

import { Search, X } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { FilterSection } from "./FilterSection";
import { cn } from "../lib/utils";
import { CZECH_ALPHABET, normalizeLetter } from "../lib/page-utils";
import { COUNTRY_CONFIG } from "../lib/page-config";
import type { CountryCode, MapPoint, RangeItem } from "../lib/page-types";
import type { AreaRow } from "../lib/db/areas-repository";

interface PeaksSidebarProps {
  showFilter: boolean;
  selectedCountries: CountryCode[];
  selectedLetters: string[];
  letterMode: "strict" | "prefer";
  showOtherLetters: boolean;
  selectedRangeUrls: string[];
  rangeOptions: RangeItem[];
  peakSort: "alpha" | "challenges";
  peakSearchQuery: string;
  visiblePoints: MapPoint[];
  sortedPoints: MapPoint[];
  selectedPeak: MapPoint | null;
  openFilters: Set<string>;
  selectedLetterColorMap: Map<string, string>;
  areaAscentStats: Map<string, { visited: number; total: number }>;
  userAscents: Map<number, { count: number; dates: string[] }>;
  peakChallengesMap: Map<number, { name: string }[]>;
  dbAreas: AreaRow[];
  selectedAreaSlugs: string[];
  filteredCount: number;
  onToggleCountry: (code: CountryCode) => void;
  onToggleLetter: (letter: string) => void;
  onToggleAreaSlug: (slug: string) => void;
  onClearAreaFilter: () => void;
  onLetterModeChange: (mode: "strict" | "prefer") => void;
  onShowOtherLettersChange: (val: boolean) => void;
  onToggleRange: (url: string) => void;
  onSelectAllRanges: () => void;
  onClearRanges: () => void;
  onPeakSortChange: (sort: "alpha" | "challenges") => void;
  onSearchChange: (query: string) => void;
  onPeakSelect: (peak: MapPoint | null) => void;
  onFilterToggle: (id: string) => void;
  getPeakId: (mountainLink?: string) => number | null;
  pointColorByName: (name: string) => string;
}

export function PeaksSidebar({
  showFilter,
  selectedCountries, selectedLetters, letterMode, showOtherLetters,
  selectedRangeUrls, rangeOptions, peakSort, peakSearchQuery,
  visiblePoints, sortedPoints, selectedPeak, openFilters,
  selectedLetterColorMap, areaAscentStats, userAscents, peakChallengesMap,
  dbAreas, selectedAreaSlugs, filteredCount,
  onToggleCountry, onToggleLetter, onLetterModeChange, onShowOtherLettersChange,
  onToggleRange, onSelectAllRanges, onClearRanges, onToggleAreaSlug, onClearAreaFilter, onPeakSortChange,
  onSearchChange, onPeakSelect, onFilterToggle, getPeakId, pointColorByName,
}: PeaksSidebarProps) {
  return (
    <div className="space-y-4">
      {showFilter && (
        <>
          <FilterSection id="countries" label={`Země (${selectedCountries.length})`} hint="Vyberte země, jejichž vrcholy chcete zobrazit." isOpen={openFilters.has("countries")} onToggle={onFilterToggle}>
            <div className="flex flex-wrap gap-2">
              {COUNTRY_CONFIG.map((country) => {
                const active = selectedCountries.includes(country.code);
                return (
                  <button key={country.code} type="button" title={country.label} onClick={() => onToggleCountry(country.code)}
                    className={cn("rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors", active ? "border-zinc-800 bg-zinc-800 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100")}>
                    {country.name}
                  </button>
                );
              })}
            </div>
          </FilterSection>

          <FilterSection id="letters" label={selectedLetters.length > 0 ? `Písmena (${selectedLetters.length})` : "Písmena"} hint="Striktní režim skryje ostatní vrcholy, preferovaný je jen obarví." isOpen={openFilters.has("letters")} onToggle={onFilterToggle}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={letterMode === "strict" ? "default" : "outline"} className="w-full rounded-2xl" onClick={() => onLetterModeChange("strict")}>Striktní</Button>
                <Button type="button" variant={letterMode === "prefer" ? "default" : "outline"} className="w-full rounded-2xl" onClick={() => onLetterModeChange("prefer")}>Preferovat</Button>
              </div>
              <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700">
                <input type="checkbox" checked={showOtherLetters} onChange={(e) => onShowOtherLettersChange(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
                <span>Zobrazit ostatní písmena šedě</span>
              </label>
              <div className="grid grid-cols-6 gap-2">
                {CZECH_ALPHABET.map((letter) => (
                  <label key={letter}
                    className={selectedLetters.includes(letter) ? "letter-pill is-active" : "letter-pill"}
                    style={selectedLetters.includes(letter) ? ({ "--letter-color": selectedLetterColorMap.get(normalizeLetter(letter)) } as CSSProperties) : undefined}>
                    <input type="checkbox" checked={selectedLetters.includes(letter)} onChange={() => onToggleLetter(letter)} />
                    <span>{letter}</span>
                  </label>
                ))}
              </div>
            </div>
          </FilterSection>

          {dbAreas.length > 0 && (
            <FilterSection id="db-areas" label={selectedAreaSlugs.length > 0 ? `Oblasti DB (${selectedAreaSlugs.length})` : "Oblasti DB"} hint="Filtruje vrcholy propojené s oblastí v databázi." isOpen={openFilters.has("db-areas")} onToggle={onFilterToggle}>
              <div className="space-y-2">
                {selectedAreaSlugs.length > 0 && (
                  <button type="button" onClick={onClearAreaFilter}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900">
                    <X className="h-3 w-3" />
                    Zobrazit vše
                  </button>
                )}
                <ScrollArea className="max-h-64 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="space-y-2">
                    {dbAreas.map((area) => (
                      <label key={area.slug} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm text-zinc-700 hover:bg-white">
                        <input type="checkbox" checked={selectedAreaSlugs.includes(area.slug)} onChange={() => onToggleAreaSlug(area.slug)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300" />
                        <span className="flex-1">{area.name}</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </FilterSection>
          )}

          <FilterSection id="areas" label={selectedRangeUrls.length > 0 ? `Oblasti (${selectedRangeUrls.length})` : "Oblasti"} hint="Klikání v mapě a ruční výběr drží stejný stav." isOpen={openFilters.has("areas")} onToggle={onFilterToggle}>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1 rounded-2xl" onClick={onSelectAllRanges}>Vybrat vše</Button>
                <Button type="button" variant="outline" className="flex-1 rounded-2xl" onClick={onClearRanges}>Zrušit</Button>
              </div>
              <ScrollArea className="max-h-64 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="space-y-2">
                  {rangeOptions.map((range) => {
                    const stats = areaAscentStats.get(range.url);
                    const pct = stats && stats.total > 0 ? Math.round((stats.visited / stats.total) * 100) : null;
                    return (
                      <label key={range.url} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm text-zinc-700 hover:bg-white">
                        <input type="checkbox" checked={selectedRangeUrls.includes(range.url)} onChange={() => onToggleRange(range.url)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300" />
                        <span className="flex-1">{range.name}</span>
                        {pct !== null && (
                          <span className={cn("shrink-0 text-xs font-medium tabular-nums", pct === 100 ? "text-amber-500" : "text-zinc-400")}>{pct} %</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </FilterSection>
        </>
      )}

      <div className="flex min-h-0 flex-col" style={{ minHeight: 0 }}>
        <div className="mb-2 px-1 space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs font-medium text-zinc-500">Vrcholy</span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-600">{filteredCount}</span>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input type="search" value={peakSearchQuery} onChange={(e) => onSearchChange(e.target.value)} placeholder="Hledat vrchol..." className="pl-9" />
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => onPeakSortChange("alpha")}
              className={cn("flex-1 rounded-xl border px-3 py-1.5 text-xs font-medium transition", peakSort === "alpha" ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100")}>
              A–Z
            </button>
            <button type="button" onClick={() => onPeakSortChange("challenges")}
              className={cn("flex-1 rounded-xl border px-3 py-1.5 text-xs font-medium transition", peakSort === "challenges" ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100")}>
              Podle výzev
            </button>
          </div>
        </div>
        <div className="overflow-y-auto pr-1">
          <div className="space-y-1">
            {visiblePoints.length === 0 ? (
              <p className="text-sm text-zinc-500">{sortedPoints.length > 0 ? "Žádný vrchol v aktuálním výřezu mapy." : "Žádný vrchol neodpovídá filtru."}</p>
            ) : (
              visiblePoints.map((point) => {
                const title = point.peakName || point.name || "Bez názvu";
                const isSelected = selectedPeak?.lat === point.lat && selectedPeak?.lon === point.lon;
                const pid = getPeakId(point.mountainLink);
                const ascended = pid !== null && userAscents.has(pid);
                const challenges = pid ? (peakChallengesMap.get(pid) ?? []) : [];
                return (
                  <button key={`peak-${point.lat}-${point.lon}-${title}`} type="button" onClick={() => onPeakSelect(isSelected ? null : point)}
                    className={cn("flex w-full items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition-colors", isSelected ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100")}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ascended ? "#fbbf24" : pointColorByName(title) }} title={ascended && pid ? `Navštíveno ${userAscents.get(pid)!.count}×` : undefined} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
                    {challenges.length > 0 && (
                      <span className="flex shrink-0 items-center gap-0.5">
                        {challenges.map((c) => <span key={c.name} className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-emerald-300" : "bg-emerald-500")} title={c.name} />)}
                      </span>
                    )}
                    <span className={cn("shrink-0 text-xs", isSelected ? "text-zinc-300" : "text-zinc-400")}>
                      {point.altitude ? `${point.altitude} m` : "—"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
