export type AscentsMapEntry = { count: number; dates: string[] };

export type ChallengeLevel = {
  level: number;
  total: number;
  peakIds: number[];
};

export type ChallengeItem = {
  id?: string;
  name: string;
  url?: string;
  category?: string;
  activeFrom?: string;
  activeTo?: string;
  rulesText?: string;
  rulesHtml?: string;
  gpxUrl?: string;
  isSpecificList?: boolean;
  isCrossword?: boolean;
  challengeType?: "specific-list" | "property-based" | "crossword" | "unknown";
  peakIds?: number[];
  levels?: ChallengeLevel[];
  rawGpxData?: string;
  isEnded?: boolean;
};

export type ChallengesResponse = {
  sourceUrl: string;
  pageTitle: string;
  scrapedAt: string;
  challenges: ChallengeItem[];
  count: number;
  cached?: boolean;
  cacheRefreshed?: boolean;
};
