"use client";

import { Target } from "lucide-react";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { cn } from "../lib/utils";
import type { ChallengeItem, AscentsMapEntry } from "../lib/page-types";

interface CompletionEntry {
  visited: number;
  total: number;
  levels?: { level: number; visited: number; total: number }[];
}

interface ChallengesContentProps {
  allChallenges: ChallengeItem[];
  challengeSort: "default" | "alpha" | "completion";
  categoryFilter: string;
  selectedChallengeId: string | null;
  expandedChallengeId: string | null;
  challengeCompletionMap: Map<string, CompletionEntry>;
  userAscents: Map<number, AscentsMapEntry>;
  peakById: Map<number, { peakName?: string; name?: string }>;
  completedChallengeIds: Set<number>;
  onChallengeSortChange: (sort: "default" | "alpha" | "completion") => void;
  onCategoryFilterChange: (cat: string) => void;
  onChallengeSelect: (id: string | null) => void;
  onExpandedChallengeChange: (id: string | null) => void;
  getChallengeYear: (challenge: ChallengeItem) => string | null;
  computePeakIds: (challenge: ChallengeItem) => number[];
}

export function ChallengesContent({
  allChallenges, challengeSort, categoryFilter, selectedChallengeId,
  expandedChallengeId, challengeCompletionMap, userAscents, peakById,
  completedChallengeIds, onChallengeSortChange, onCategoryFilterChange, onChallengeSelect,
  onExpandedChallengeChange, getChallengeYear, computePeakIds,
}: ChallengesContentProps) {
  const availableCategories = Array.from(
    new Set(allChallenges.map((c) => c.category).filter(Boolean) as string[])
  ).sort((a, b) => a.localeCompare(b, "cs"));

  const filteredChallenges = categoryFilter
    ? allChallenges.filter((c) => c.category === categoryFilter)
    : allChallenges;

  const sortedChallenges = [...filteredChallenges].sort((a, b) => {
    if (challengeSort === "alpha") return (a.name ?? "").localeCompare(b.name ?? "", "cs");
    if (challengeSort === "completion") {
      const ca = a.id ? challengeCompletionMap.get(a.id) : null;
      const cb = b.id ? challengeCompletionMap.get(b.id) : null;
      const pa = ca && ca.total > 0 ? ca.visited / ca.total : 0;
      const pb = cb && cb.total > 0 ? cb.visited / cb.total : 0;
      return pb - pa;
    }
    return 0;
  });

  return (
    <div className="space-y-4">
      {allChallenges.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            {(["default", "alpha", "completion"] as const).map((s) => (
              <button key={s} type="button" onClick={() => onChallengeSortChange(s)}
                className={cn("rounded-xl px-3 py-1.5 text-xs font-medium transition", challengeSort === s ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200")}>
                {s === "default" ? "Výchozí" : s === "alpha" ? "A–Z" : "Plnění"}
              </button>
            ))}
            <span className="ml-auto text-xs text-zinc-400">{sortedChallenges.length} výzev</span>
          </div>
          {availableCategories.length > 0 && (
            <select value={categoryFilter} onChange={(e) => onCategoryFilterChange(e.target.value)}
              className="flex-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-400">
              <option value="">Všechny kategorie</option>
              {availableCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          )}
        </div>
      )}

      {allChallenges.length === 0 ? (
        <div className="grid place-items-center rounded-[1.5rem] border border-dashed border-zinc-300 bg-zinc-50 px-6 py-16 text-center">
          <Target className="mx-auto h-8 w-8 text-zinc-400" />
          <p className="mt-4 text-sm text-zinc-500">Výzvy nejsou načtené. Spusť synchronizaci v Nastavení.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedChallenges.map((challenge, index) => (
            <ChallengeCard
              key={challenge.name}
              challenge={challenge}
              index={index}
              isSelected={selectedChallengeId === challenge.id}
              isExpanded={expandedChallengeId === challenge.id}
              completion={challenge.id ? challengeCompletionMap.get(challenge.id) ?? null : null}
              isCompleted={challenge.id !== undefined && completedChallengeIds.has(Number(challenge.id))}
              userAscents={userAscents}
              peakById={peakById}
              getChallengeYear={getChallengeYear}
              computePeakIds={computePeakIds}
              onSelect={onChallengeSelect}
              onExpandToggle={onExpandedChallengeChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ChallengeCardProps {
  challenge: ChallengeItem;
  index: number;
  isSelected: boolean;
  isExpanded: boolean;
  isCompleted: boolean;
  completion: CompletionEntry | null;
  userAscents: Map<number, AscentsMapEntry>;
  peakById: Map<number, { peakName?: string; name?: string }>;
  getChallengeYear: (challenge: ChallengeItem) => string | null;
  computePeakIds: (challenge: ChallengeItem) => number[];
  onSelect: (id: string | null) => void;
  onExpandToggle: (id: string | null) => void;
}

function ChallengeCard({
  challenge, index, isSelected, isExpanded, isCompleted, completion,
  userAscents, peakById, getChallengeYear, computePeakIds,
  onSelect, onExpandToggle,
}: ChallengeCardProps) {
  const yearLabel = getChallengeYear(challenge);
  const label = yearLabel ? `Plnění ${yearLabel}` : "Plnění";

  return (
    <Card
      className={cn("rounded-[1.75rem] bg-gradient-to-br from-white to-zinc-50 shadow-none cursor-pointer transition-all select-none",
        isSelected ? "border-emerald-400 ring-2 ring-emerald-400/40" : "border-zinc-200 hover:border-zinc-300")}
      onClick={() => challenge.id && onSelect(isSelected ? null : challenge.id)}
    >
      <CardContent className="p-5">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full px-3 py-1">Výzva {index + 1}</Badge>
          {challenge.challengeType && (
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {challenge.challengeType === "specific-list" ? "Seznamová" : challenge.challengeType === "property-based" ? "Vlastnostní" : challenge.challengeType === "crossword" ? "Tajenka" : "Neurčeno"}
            </Badge>
          )}
          {Array.isArray(challenge.peakIds) && challenge.peakIds.length > 0 ? (
            <Badge variant="secondary" className="rounded-full px-3 py-1">{challenge.peakIds.length} vrcholů</Badge>
          ) : (
            <Badge variant="outline" className="rounded-full px-3 py-1 text-amber-600 border-amber-400 bg-amber-50">Bez vrcholů</Badge>
          )}
          {isCompleted && (
            <Badge className="rounded-full px-3 py-1 bg-amber-400 text-amber-950 border-0">Splněno</Badge>
          )}
        </div>
        <h3 className="mt-4 text-lg font-semibold tracking-tight text-zinc-950">{challenge.name}</h3>
        {challenge.rulesText ? (
          <p className="mt-2 line-clamp-4 text-sm leading-6 text-zinc-500">{challenge.rulesText}</p>
        ) : (
          <p className="mt-2 text-sm leading-6 text-zinc-500">Název byl načten ze stránky výzev a uložen do lokální cache pro další použití.</p>
        )}
        {isSelected && (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Vrcholy zobrazeny na mapě
          </p>
        )}

        {completion && completion.total > 0 && userAscents.size > 0 && (
          <CompletionBar completion={completion} label={label} />
        )}

        {completion && completion.visited > 0 && userAscents.size > 0 && (
          <VisitedPeaksList
            challenge={challenge}
            isExpanded={isExpanded}
            year={yearLabel}
            userAscents={userAscents}
            peakById={peakById}
            computePeakIds={computePeakIds}
            onExpandToggle={onExpandToggle}
          />
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {challenge.gpxUrl && <Badge variant="outline" className="rounded-full px-3 py-1">GPX</Badge>}
          {challenge.isCrossword && <Badge variant="outline" className="rounded-full px-3 py-1">Tajenka</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}

function CompletionBar({ completion, label }: { completion: CompletionEntry; label: string }) {
  if (completion.levels && completion.levels.length > 0) {
    return (
      <div className="mt-3 space-y-1.5">
        {completion.levels.map((lv) => {
          if (lv.total === 0) return null;
          const pct = Math.min(100, Math.round((lv.visited / lv.total) * 100));
          return (
            <div key={lv.level}>
              <div className="mb-0.5 flex items-center justify-between text-xs text-zinc-500">
                <span>{label} – {lv.level}. úroveň</span>
                <span className="font-medium tabular-nums text-zinc-700">{lv.visited} / {lv.total} ({pct} %)</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                <div className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-amber-400" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  const pct = Math.round((completion.visited / completion.total) * 100);
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
        <span>{label}</span>
        <span className="font-medium tabular-nums text-zinc-700">{completion.visited} / {completion.total} ({pct} %)</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
        <div className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-amber-400" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface VisitedPeaksListProps {
  challenge: ChallengeItem;
  isExpanded: boolean;
  year: string | null;
  userAscents: Map<number, AscentsMapEntry>;
  peakById: Map<number, { peakName?: string; name?: string }>;
  computePeakIds: (challenge: ChallengeItem) => number[];
  onExpandToggle: (id: string | null) => void;
}

function VisitedPeaksList({ challenge, isExpanded, year, userAscents, peakById, computePeakIds, onExpandToggle }: VisitedPeaksListProps) {
  const ids = computePeakIds(challenge);
  const visited = ids.flatMap((id) => {
    const ascent = userAscents.get(id);
    if (!ascent) return [];
    const dates = year ? ascent.dates.filter((d) => d.startsWith(year)) : ascent.dates;
    if (dates.length === 0) return [];
    const point = peakById.get(id);
    const name = point?.peakName ?? point?.name ?? String(id);
    return [{ id, name, date: dates[0] }];
  });

  return (
    <div className="mt-3">
      <button type="button"
        onClick={(e) => { e.stopPropagation(); onExpandToggle(isExpanded ? null : (challenge.id ?? null)); }}
        className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition">
        <span>Moje navštívené vrcholy ({visited.length})</span>
        <svg className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {isExpanded && (
        <ul className="mt-2 space-y-1">
          {visited.map((v) => (
            <li key={v.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-xs bg-amber-50 border border-amber-100">
              <span className="font-medium text-zinc-800">{v.name}</span>
              <span className="text-zinc-400 tabular-nums">{v.date}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
