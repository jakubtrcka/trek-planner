export type CastlePoint = {
  lat: number;
  lon: number;
  name?: string;
  externalId?: string;
  externalUrl?: string;
  openingHours?: string;
  wikidata?: string;
  locationId?: number;
};

export type CastlesApiLocation = {
  id: number;
  name: string;
  lat: number;
  lon: number;
  externalUrl: string | null;
  externalId: string | null;
  metadata: Record<string, string> | null;
};

export type CastlesApiResponse = {
  locations: CastlesApiLocation[];
};
