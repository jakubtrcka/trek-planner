"use client";

import { Loader2, Route, Sparkles } from "lucide-react";
import type { FormEvent } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Textarea } from "./ui/textarea";
import type { AiRouteIntent } from "../lib/page-types";

interface RoutesSidebarProps {
  aiPrompt: string;
  aiLoading: boolean;
  aiIntent: AiRouteIntent | null;
  aiParser: "llm" | "heuristic" | null;
  routePlanningLoading: boolean;
  maxDistance: string;
  routeMode: "linear" | "roundtrip";
  onAiPromptChange: (value: string) => void;
  onAiSubmit: (e: FormEvent) => void;
  onRoutePlanningSubmit: (e: FormEvent) => void;
  onMaxDistanceChange: (value: string) => void;
  onRouteModeChange: (value: "linear" | "roundtrip") => void;
}

export function RoutesSidebar({
  aiPrompt, aiLoading, aiIntent, aiParser,
  routePlanningLoading, maxDistance, routeMode,
  onAiPromptChange, onAiSubmit, onRoutePlanningSubmit,
  onMaxDistanceChange, onRouteModeChange,
}: RoutesSidebarProps) {
  return (
    <div className="space-y-6">
      <Card className="rounded-3xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">AI prompt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={aiPrompt} onChange={(e) => onAiPromptChange(e.target.value)} placeholder="Např. chci okruh kolem 16 km, hlavně vrcholy na B a R..." />
          <Button type="button" className="w-full justify-center rounded-2xl" onClick={onAiSubmit}>
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI navrhni trasu
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Parametry trasy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={routeMode === "roundtrip" ? "default" : "outline"} className="w-full rounded-2xl" onClick={() => onRouteModeChange("roundtrip")}>Okružní</Button>
            <Button type="button" variant={routeMode === "linear" ? "default" : "outline"} className="w-full rounded-2xl" onClick={() => onRouteModeChange("linear")}>Lineární</Button>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Cílová délka</label>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
              <input type="range" min={3} max={45} step={1} value={maxDistance} onChange={(e) => onMaxDistanceChange(e.target.value)} className="w-full" />
              <div className="mt-2 flex items-center justify-between text-sm text-zinc-500">
                <span>3 km</span>
                <strong className="text-zinc-950">{maxDistance} km</strong>
                <span>45 km</span>
              </div>
            </div>
          </div>
          <Button type="button" className="w-full justify-center rounded-2xl" onClick={onRoutePlanningSubmit}>
            {routePlanningLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
            Naplánovat trasy
          </Button>
        </CardContent>
      </Card>

      {aiIntent && (
        <Card className="rounded-3xl border-emerald-200 bg-emerald-50/70">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">AI interpretace{aiParser ? ` (${aiParser})` : ""}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-2xl bg-white p-4 text-xs text-zinc-700">
              {JSON.stringify(aiIntent, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
