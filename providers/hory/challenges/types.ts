import { z } from "zod";
import { type ChallengeItem } from "../schemas";

// ── Service option types ───────────────────────────────────────────────────────

export type ScrapeChallengesOptions = {
  username?: string;
  password?: string;
  useCache?: boolean;
  refreshCache?: boolean;
  cacheOnly?: boolean;
  maxChallenges?: number;
  batchSize?: number;
  throttleMs?: number;
};

export type ScrapeResult = {
  sourceUrl: string;
  pageTitle: string;
  scrapedAt: string;
  challenges: ChallengeItem[];
  count: number;
  cached: boolean;
  cacheRefreshed?: boolean;
};

// ── Logger ─────────────────────────────────────────────────────────────────────

export function createRunLogger(prefix: string) {
  const startedAt = Date.now();
  return {
    log: (message: string) => {
      const elapsed = Date.now() - startedAt;
      console.log(`${prefix} +${elapsed}ms ${message}`);
    },
  };
}

// ── Domain types ───────────────────────────────────────────────────────────────

export type ChallengeType = "specific-list" | "property-based" | "crossword" | "unknown";

export type ChallengeLevel = {
  level: number;
  total: number;
  peakIds: number[];
};

export type PeakCandidate = {
  id: number;
  normalizedName: string;
  name: string;
  lat: number;
  lon: number;
};

export type Waypoint = {
  name: string;
  lat: number | null;
  lon: number | null;
};

export type BasicChallengeCard = {
  id: string;
  name: string;
  url: string;
  category?: string;
  activeFrom?: string;
  activeTo?: string;
};

// ── Internal schemas ───────────────────────────────────────────────────────────

export const PeaksCacheFileSchema = z.object({
  points: z.array(
    z.object({
      lat: z.union([z.number(), z.string()]),
      lon: z.union([z.number(), z.string()]),
      name: z.string().optional(),
      peakName: z.string().optional(),
      mountainLink: z.string().optional(),
    })
  ),
});
