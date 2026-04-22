export type PlannedRoute = {
  id: string;
  title: string;
  distanceKm: number;
  durationMinutes: number;
  ascentMeters: number;
  peaks: Array<{ name: string; lat: number; lon: number; altitude?: number | string }>;
  mapyCzUrl: string;
  mapyApiUrl?: string;
  geometry: { type: "LineString"; coordinates: Array<[number, number]> };
};

export type PlanRouteResponse = {
  count: number;
  cached?: boolean;
  cacheKey?: string;
  apiCalls?: number;
  estimatedCredits?: number;
  creditsPerCall?: number;
  routes: PlannedRoute[];
};

export type AiRouteIntent = {
  distanceKmTarget: number;
  distanceTolerancePercent: number;
  routeMode: "linear" | "roundtrip";
  preferredLetters: string[];
  letterMode: "strict" | "prefer";
  maxAscentMeters: number | null;
  mustInclude: string[];
  avoid: string[];
  notes: string;
  clarificationQuestion: string | null;
  confidence: number;
};

export type AiPlanRouteResponse = PlanRouteResponse & {
  parser?: "llm" | "heuristic";
  intent?: AiRouteIntent;
};
