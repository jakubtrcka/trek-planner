import { z } from "zod";

export const HoryRangeSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
});

export const HoryMapPointSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  name: z.string().optional(),
  peakName: z.string().optional(),
  altitude: z.union([z.number(), z.string()]).optional(),
  mountainLink: z.string().optional(),
  source: z.string().optional(),
});

export const ScrapeRangesResultSchema = z.object({
  sourceUrl: z.string().url(),
  pageTitle: z.string(),
  scrapedAt: z.string().datetime(),
  ranges: z.array(HoryRangeSchema),
  count: z.number().int().nonnegative(),
});

// ── Výzvy (file cache) ────────────────────────────────────────────────────────

export const ChallengeItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  category: z.string().optional(),
  activeFrom: z.string().optional(),
  activeTo: z.string().optional(),
  rulesText: z.string(),
  rulesHtml: z.string().optional(),
  gpxUrl: z.string().optional(),
  isSpecificList: z.boolean(),
  isCrossword: z.boolean().optional(),
  challengeType: z.enum(["specific-list", "property-based", "crossword", "unknown"]).optional(),
  peakIds: z.array(z.number()).optional(),
  levels: z.array(z.object({
    level: z.number(),
    total: z.number(),
    peakIds: z.array(z.number()),
  })).optional(),
  rawGpxData: z.string().optional(),
  isEnded: z.boolean().optional(),
});

export const ChallengesCacheSchema = z.object({
  cachedAt: z.string(),
  sourceUrl: z.string(),
  pageTitle: z.string(),
  challenges: z.array(ChallengeItemSchema),
});

export type ChallengeItem = z.infer<typeof ChallengeItemSchema>;
export type ChallengesCache = z.infer<typeof ChallengesCacheSchema>;
