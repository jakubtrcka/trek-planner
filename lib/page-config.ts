import type { CountryCode } from "./page-types";

export type BaseMapType = "osm" | "mapycz-basic" | "mapycz-outdoor" | "mapycz-warm";

export const COUNTRY_CONFIG: { code: CountryCode; name: string; label: string; url: string }[] = [
  { code: "cz", name: "ČR", label: "Česká republika", url: "https://cs.hory.app/country/czech-republic" },
  { code: "si", name: "SI", label: "Slovinsko", url: "https://cs.hory.app/country/slovenia" },
];
