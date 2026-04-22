export const CZECH_ALPHABET = [
  "A", "Á", "B", "C", "Č", "D", "Ď", "E", "É", "Ě", "F", "G", "H",
  "I", "Í", "J", "K", "L", "M", "N", "Ň", "O", "Ó", "P", "Q", "R",
  "Ř", "S", "Š", "T", "Ť", "U", "Ú", "Ů", "V", "W", "X", "Y", "Ý",
  "Z", "Ž",
];

export const BIRD_KEYWORDS = /sov[ai]|vrán[ay]?|sokol|havran|krkavec|orl[ií]?|holub|ptač/i;

const CZECH_SUBSTITUTION_TABLE: Record<string, string> = {
  "A": "A", "Á": "A",
  "B": "B",
  "C": "C", "Č": "Č",
  "D": "D", "Ď": "Ď",
  "E": "E", "É": "E", "Ě": "E",
  "F": "F", "G": "G", "H": "H",
  "I": "I", "Í": "I",
  "J": "J", "K": "K", "L": "L",
  "M": "M",
  "N": "N", "Ň": "Ň",
  "O": "O", "Ó": "O",
  "P": "P", "Q": "Q",
  "R": "R", "Ř": "Ř",
  "S": "S", "Š": "Š",
  "T": "T", "Ť": "Ť",
  "U": "U", "Ú": "U", "Ů": "U",
  "V": "V", "W": "W", "X": "X",
  "Y": "Y", "Ý": "Y",
  "Z": "Z", "Ž": "Ž",
};

export function normalizeLetter(value: string): string {
  const upper = value.toUpperCase().slice(0, 1);
  return CZECH_SUBSTITUTION_TABLE[upper] ?? upper;
}

export function firstLetterFromName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  for (const ch of trimmed) {
    if (/[A-Za-zÁ-Žá-ž]/.test(ch)) return ch.toUpperCase();
  }
  return null;
}
