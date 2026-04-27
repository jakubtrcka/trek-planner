"use client";

import { X } from "lucide-react";
import { useState } from "react";
import type { MapPoint, AscentsMapEntry } from "../lib/page-types";

type VisitEntry = { locationId: string; count: number; visitedAt: string };

interface PeakDetailProps {
  peak: MapPoint;
  userAscents: Map<number, AscentsMapEntry>;
  userVisits: Map<string, VisitEntry>;
  peakChallengesMap: Map<number, { name: string }[]>;
  getPeakId: (mountainLink?: string) => number | null;
  isLoggedIn: boolean;
  onVisitChange: (externalId: string, action: "add" | "remove") => Promise<void>;
  onBack: () => void;
}

export function PeakDetail({ peak, userAscents, userVisits, peakChallengesMap, getPeakId, isLoggedIn, onVisitChange, onBack }: PeakDetailProps) {
  const peakId = getPeakId(peak.mountainLink);
  const ascent = peakId !== null ? userAscents.get(peakId) : null;
  const challenges = peakId ? (peakChallengesMap.get(peakId) ?? []) : [];
  const [isPending, setIsPending] = useState(false);

  const externalId = peakId !== null ? String(peakId) : null;
  const visitEntry = externalId !== null ? userVisits.get(externalId) : null;
  const isVisited = ascent !== undefined && ascent !== null;

  async function handleVisitToggle() {
    if (!externalId || isPending) return;
    setIsPending(true);
    try {
      await onVisitChange(externalId, isVisited ? "remove" : "add");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="rounded-[1.5rem] border border-zinc-200 bg-white shadow-sm">
      <div className="flex shrink-0 items-center justify-end border-b border-zinc-100 px-4 py-3">
        <button type="button" onClick={onBack} title="Zavřít"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-950">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-zinc-950">{peak.peakName || peak.name || "Bez názvu"}</h3>
          {peak.altitude && <p className="mt-0.5 text-sm text-zinc-500">{peak.altitude} m n. m.</p>}
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-100 px-4 py-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">Souřadnice</span>
          <span className="font-mono text-xs text-zinc-700">{Number(peak.lat).toFixed(5)}, {Number(peak.lon).toFixed(5)}</span>
        </div>
        {peak.source && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Zdroj</span>
            <span className="text-zinc-700 text-xs truncate max-w-[60%]">{peak.source}</span>
          </div>
        )}
      </div>

      {ascent && (
        <div className="shrink-0 border-t border-zinc-100 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Moje výstupy</p>
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              {ascent.count}× navštíveno
            </span>
            {ascent.dates[0] && (
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                Naposledy {ascent.dates[0]}
              </span>
            )}
          </div>
        </div>
      )}

      {challenges.length > 0 && (
        <div className="shrink-0 border-t border-zinc-100 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Výzvy</p>
          <div className="flex flex-wrap gap-1.5">
            {challenges.map((c) => (
              <span key={c.name} className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {isLoggedIn && externalId && (
        <div className="shrink-0 border-t border-zinc-100 px-4 py-3 space-y-2">
          {visitEntry && (
            <p className="text-xs text-zinc-500">
              Manuálních check-inů: <span className="font-medium text-zinc-800">{visitEntry.count}</span>
            </p>
          )}
          <button type="button" onClick={() => void handleVisitToggle()} disabled={isPending}
            className={`w-full rounded-2xl border px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${isVisited ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-zinc-200 bg-zinc-50 text-zinc-900 hover:bg-zinc-100"}`}>
            {isPending ? "Ukládám…" : isVisited ? "Odznačit návštěvu" : "Označit jako navštívené"}
          </button>
        </div>
      )}

      {peak.mountainLink && (
        <div className="px-4 pb-4 pt-2">
          <a href={peak.mountainLink} target="_blank" rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100">
            Otevřít na hory.app
          </a>
        </div>
      )}
    </div>
  );
}
