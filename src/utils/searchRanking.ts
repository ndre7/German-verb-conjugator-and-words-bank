// searchRanking.ts
// Pure utility for rank-based search ordering
// Exact match > Starts with > Contains (infinitive/word) > Meaning match > Conjugation match

export interface RankedItem<T> {
  item: T;
  score: number;
}

export function rankItem(
  primaryText: string,
  secondaryText: string | undefined,
  extraTexts: string[] | undefined,
  query: string
): number {
  const q = (query || "").toLowerCase().trim();
  if (!q) return 0;

  const prim = (primaryText || "").toLowerCase().trim();
  const sec = (secondaryText || "").toLowerCase().trim();

  // Tier 1: Exact match on primary
  if (prim === q) return 1000;

  // Tier 2: Starts-with on primary
  if (prim.startsWith(q)) return 800 - prim.length; // shorter primary ranks higher

  // Tier 3: Contains on primary
  if (prim.includes(q)) return 600 - prim.indexOf(q);

  // Tier 4: Exact match on secondary (meaning)
  if (sec === q) return 500;

  // Tier 5: Starts-with on secondary
  if (sec.startsWith(q)) return 400;

  // Tier 6: Contains on secondary
  if (sec.includes(q)) return 300;

  // Tier 7: Extra texts (e.g. conjugations, category names, tags, examples)
  if (extraTexts && extraTexts.length > 0) {
    for (const extra of extraTexts) {
      const e = (extra || "").toLowerCase();
      if (e.includes(q)) {
        return 100;
      }
    }
  }

  return -1; // No match
}

export function sortBySearchRank<T>(
  items: T[],
  query: string,
  getFields: (item: T) => { primary: string; secondary?: string; extras?: string[] }
): T[] {
  const q = (query || "").toLowerCase().trim();
  if (!q) return items;

  const scored: Array<{ item: T; score: number; originalIndex: number }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { primary, secondary, extras } = getFields(item);
    const score = rankItem(primary, secondary, extras, q);
    if (score >= 0) {
      scored.push({ item, score, originalIndex: i });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.originalIndex - b.originalIndex;
  });

  return scored.map((s) => s.item);
}
