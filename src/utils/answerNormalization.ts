export function normalizeGermanAnswer(input: string): string {
  return input
    .replace(/[,;:_\-–—!?.«»"'"()]/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isAnswerCorrect(
  userAnswer: string,
  validCandidates: string[]
): boolean {
  const norm = normalizeGermanAnswer(userAnswer).toLowerCase();
  if (!norm) return false;
  const userTokens = norm.split(" ").filter(Boolean);
  for (const candidate of validCandidates) {
    const cNorm = normalizeGermanAnswer(candidate).toLowerCase();
    if (!cNorm) continue;
    const cTokens = cNorm.split(" ").filter(Boolean);
    if (
      userTokens.length === cTokens.length &&
      new Set(userTokens).size === new Set(cTokens).size &&
      cTokens.every((t) => userTokens.includes(t))
    ) {
      return true;
    }
    if (cNorm === norm) return true;
  }
  return false;
}

export function extractCandidatesFromCell(cellValue: any): string[] {
  if (!cellValue) return [];
  if (Array.isArray(cellValue)) {
    if (cellValue.length === 0) return [];
    const joined = cellValue.join(" ").trim();
    if (!joined) return [];
    const parts = joined.split(/\s*[\/;]\s*|\s+oder\s+/i).map((s) => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [joined];
  }
  if (typeof cellValue === "string") {
    const trimmed = cellValue.trim();
    if (!trimmed) return [];
    const parts = trimmed.split(/\s*[\/;]\s*|\s+oder\s+/i).map((s) => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [trimmed];
  }
  return [];
}
