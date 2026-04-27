// Re-exports for backward compatibility — import from domain modules directly
export type { MapPoint, CountryCode, RangeItem, ScrapeResponse, AreaGeojsonResponse, MapPointsResponse } from "./peaks/types";
export type { ChallengeLevel, ChallengeItem, ChallengesResponse, AscentsMapEntry } from "./challenges/types";
export type { PlannedRoute, PlanRouteResponse, AiRouteIntent, AiPlanRouteResponse } from "./trips/types";

export type SectionKey = "peaks" | "challenges";

export type MapBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

import type { MapPoint } from "./peaks/types";
import type { CastlePoint } from "./castles/types";

export type ActiveDetail =
  | { type: "peak"; data: MapPoint }
  | { type: "castle"; data: CastlePoint }
  | { type: null; data: null };
