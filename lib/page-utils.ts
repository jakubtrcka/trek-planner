// Re-exports for backward compatibility — import from domain modules directly
export { CZECH_REPUBLIC_BOUNDS, SELECTED_LETTER_COLORS } from "./map/constants";
export { CZECH_ALPHABET, BIRD_KEYWORDS, normalizeLetter, firstLetterFromName } from "./czech/alphabet";
export { CESKA_OSMISMERKA_GRID, wordSearchCheck } from "./czech/osmismerka";

export function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function getPeakId(mountainLink?: string): number | null {
  if (!mountainLink) return null;
  const match = /\/mountain\/(\d+)-/.exec(mountainLink);
  return match ? Number(match[1]) : null;
}

export function isPalindromeAltitude(altitude: number): boolean {
  const s = String(Math.round(altitude));
  return s === s.split("").reverse().join("");
}
