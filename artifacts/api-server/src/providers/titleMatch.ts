// Shared by ProviderManager's cross-provider grouping (normalizeTitle) and
// MangaDexProvider's enrichment lookup (findBestMatch) — both need the exact
// same normalization so a title matched one way matches the other way too.
//
// The multiplication-sign fix matters more than it looks: "SPY×FAMILY"
// (MangaDex's own title, using the Unicode multiplication sign U+00D7) and
// "Spy x Family" (a literal lowercase x, as most other providers write it)
// differ only in that one character. `\w` doesn't match "×", so stripping
// non-word characters silently drops it from one side but keeps the literal
// "x" on the other, and the two never compare equal.
const MULTIPLICATION_SIGNS = /[×✕✗]/g;
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export function normalizeTitleForMatch(title: string): string {
  return title
    .toLowerCase()
    .replace(MULTIPLICATION_SIGNS, "x")
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "") // remove accents
    .replace(/[^\w\s]/g, "") // remove special characters
    .replace(/\s+/g, "") // remove spaces
    .trim();
}
