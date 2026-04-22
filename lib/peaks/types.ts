import type { MapPoint } from "../types";

export type { MapPoint };

export type CountryCode = "cz" | "si";

export type RangeItem = {
  name: string;
  url: string;
};

export type ScrapeResponse = {
  sourceUrl: string;
  pageTitle: string;
  scrapedAt: string;
  ranges: RangeItem[];
  count: number;
};

export type AreaGeojsonResponse = {
  count: number;
  cached?: boolean;
  cacheKey?: string;
  features: Array<{
    name: string;
    url: string;
    feature: {
      type: "Feature";
      properties: { name: string; url: string };
      geometry: { type: string; coordinates: unknown };
    };
  }>;
};

export type MapPointsResponse = {
  sourceUrl: string;
  pageTitle: string;
  scrapedAt: string;
  points: MapPoint[];
  count: number;
  sourceCount: number;
  selectedAreaCount?: number;
  scannedRangePages?: number;
  durationMs?: number;
  startsWithLetters?: string[];
  letterMode?: "strict" | "prefer";
  cached?: boolean;
  cacheUpdatedAt?: string;
  cacheTotalPoints?: number;
  cacheRefreshed?: boolean;
  sources: Array<{ url: string; contentType: string }>;
};
