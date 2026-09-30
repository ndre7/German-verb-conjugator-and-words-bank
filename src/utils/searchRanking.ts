// searchRanking.ts
// Pure utility for rank-based search ordering with exact-match-first ranking.
// Exact match > Starts with > Word boundary > Contains (word) > Meaning/Secondary match > Extras

export function rankByExactFirst<T>(
  items: T[],
  getTextField: (item: T) => string,
  query: string
): T[] {
  const q = (query || "").toLowerCase().trim();
  if (!q) return items;

  const scored: Array<{ item: T; score: number; index: number }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const text = (getTextField(item) || "").toLowerCase().trim();
    let score = 4;

    if (text === q) {
      score = 0;
    } else if (text.startsWith(q)) {
      score = 1;
    } else if (new RegExp(`(?:^|[\\s.,;!?()/\\[\\]-])${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text)) {
      score = 2;
    } else if (text.includes(q)) {
      score = 3;
    } else {
      score = 4;
    }

    if (score <= 3) {
      scored.push({ item, score, index: i });
    }
  }

  return scored
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.index - b.index;
    })
    .map((s) => s.item);
}

export interface SearchRankFields {
  primary: string;
  secondary?: string;
  extras?: string[];
}

export function sortBySearchRank<T>(
  items: T[],
  query: string,
  getFields: (item: T) => SearchRankFields
): T[] {
  const q = (query || "").toLowerCase().trim();
  if (!q) return items;

  const scored: Array<{ item: T; score: number; originalIndex: number }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { primary, secondary, extras } = getFields(item);
    const prim = (primary || "").toLowerCase().trim();
    const sec = (secondary || "").toLowerCase().trim();

    let score = -1;

    // Primary (word/infinitive/title) matching
    if (prim === q) {
      score = 0; // Exact primary match
    } else if (prim.startsWith(q)) {
      score = 10; // Prefix primary match
    } else if (new RegExp(`(?:^|[\\s.,;!?()/\\[\\]-])${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(prim)) {
      score = 20; // Word-boundary primary match
    } else if (prim.includes(q)) {
      score = 30; // Substring primary match
    } else if (sec === q) {
      score = 40; // Exact secondary (meaning) match
    } else if (sec.startsWith(q)) {
      score = 50; // Prefix secondary match
    } else if (new RegExp(`(?:^|[\\s.,;!?()/\\[\\]-])${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(sec)) {
      score = 60; // Word-boundary secondary match
    } else if (sec.includes(q)) {
      score = 70; // Substring secondary match
    } else if (extras && extras.length > 0) {
      for (const extra of extras) {
        const e = (extra || "").toLowerCase();
        if (e === q) {
          score = 80;
          break;
        } else if (e.startsWith(q)) {
          score = 85;
          break;
        } else if (e.includes(q)) {
          score = 90;
          break;
        }
      }
    }

    if (score >= 0) {
      scored.push({ item, score, originalIndex: i });
    }
  }

  // Stable sort: primary score ascending (lower is better rank), then original order
  scored.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    return a.originalIndex - b.originalIndex;
  });

  return scored.map((s) => s.item);
}
