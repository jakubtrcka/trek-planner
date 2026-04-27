"use client";

import { X } from "lucide-react";
import { useState } from "react";
import type { CastlePoint } from "../lib/castles/types";

type VisitEntry = { locationId: string; count: number; visitedAt: string };

interface CastleDetailProps {
  castle: CastlePoint;
  userVisits: Map<string, VisitEntry>;
  isLoggedIn: boolean;
  onVisitChange: (externalId: string, action: "add" | "remove") => Promise<void>;
  onBack: () => void;
}

export function CastleDetail({ castle, userVisits, isLoggedIn, onVisitChange, onBack }: CastleDetailProps) {
  const [isPending, setIsPending] = useState(false);

  const externalId = castle.externalId ?? null;
  const visitEntry = externalId !== null ? userVisits.get(externalId) : null;
  const isVisited = visitEntry !== undefined && visitEntry !== null;

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
        <h3 className="text-lg font-semibold tracking-tight text-zinc-950">{castle.name ?? "Bez názvu"}</h3>
      </div>

      <div className="shrink-0 border-t border-zinc-100 px-4 py-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">Souřadnice</span>
          <span className="font-mono text-xs text-zinc-700">{Number(castle.lat).toFixed(5)}, {Number(castle.lon).toFixed(5)}</span>
        </div>
        {castle.openingHours && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Otevírací doba</span>
            <span className="text-zinc-700 text-xs truncate max-w-[60%]">{castle.openingHours}</span>
          </div>
        )}
      </div>

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

      {castle.externalUrl && (
        <div className="px-4 pb-4 pt-2">
          <a href={castle.externalUrl} target="_blank" rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100">
            Otevřít zdroj
          </a>
        </div>
      )}
    </div>
  );
}
