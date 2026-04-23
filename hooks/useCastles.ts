"use client";

import useSWR from "swr";
import type { CastlePoint, CastlesApiResponse } from "../lib/castles/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useCastles() {
  const { data, isLoading } = useSWR<CastlesApiResponse>("/api/castles", fetcher, {
    revalidateOnFocus: false,
  });

  const castles: CastlePoint[] = (data?.locations ?? []).map((loc) => ({
    locationId: loc.id,
    name: loc.name,
    lat: loc.lat,
    lon: loc.lon,
    externalId: loc.externalId ?? undefined,
    externalUrl: loc.externalUrl ?? undefined,
    openingHours: loc.metadata?.opening_hours ?? undefined,
    wikidata: loc.metadata?.wikidata ?? undefined,
  }));

  return { castles, isLoading };
}
