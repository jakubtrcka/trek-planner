"use client";

import { Search } from "lucide-react";
import { Input } from "./ui/input";
import { cn } from "../lib/utils";
import type { CastlePoint } from "../lib/castles/types";

type VisitEntry = { locationId: string; count: number; visitedAt: string };

interface CastlesSidebarProps {
  castles: CastlePoint[];
  allCastlesCount: number;
  userVisits: Map<string, VisitEntry>;
  searchQuery: string;
  selectedCastle: CastlePoint | null;
  filterByMapBounds: boolean;
  onSearchChange: (q: string) => void;
  onCastleSelect: (castle: CastlePoint | null) => void;
  onFilterByMapBoundsChange: (v: boolean) => void;
}

export function CastlesSidebar({
  castles, allCastlesCount, userVisits, searchQuery, selectedCastle,
  filterByMapBounds, onSearchChange, onCastleSelect, onFilterByMapBoundsChange,
}: CastlesSidebarProps) {
  const filtered = searchQuery.trim()
    ? castles.filter((c) => (c.name ?? "").toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : castles;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-zinc-500">
          <input type="checkbox" checked={filterByMapBounds} onChange={(e) => onFilterByMapBoundsChange(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
          Filtrovat podle mapy
        </label>
      </div>
      <div className="space-y-2 px-1">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-xs font-medium text-zinc-500">Zámky</span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-600">{allCastlesCount}</span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Hledat zámek..."
            className="pl-9"
          />
        </div>
      </div>
      <div className="overflow-y-auto pr-1">
        <div className="space-y-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-500">
              {castles.length > 0 ? "Žádný zámek neodpovídá hledání." : "Žádné zámky k dispozici."}
            </p>
          ) : (
            filtered.map((castle) => {
              const isSelected = selectedCastle?.locationId !== undefined
                ? selectedCastle.locationId === castle.locationId
                : selectedCastle?.lat === castle.lat && selectedCastle?.lon === castle.lon;
              const isVisited = castle.externalId ? userVisits.has(castle.externalId) : false;
              return (
                <button
                  key={`castle-${castle.locationId ?? `${castle.lat}-${castle.lon}`}`}
                  type="button"
                  onClick={() => onCastleSelect(isSelected ? null : castle)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition-colors",
                    isSelected
                      ? "border-zinc-950 bg-zinc-950 text-white"
                      : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: isVisited ? "#fbbf24" : "#7c3aed" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {castle.name ?? "Bez názvu"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
