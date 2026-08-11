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
// `\w` is ASCII-only, so a Japanese/Chinese/Korean/Cyrillic/... title with no
// Latin characters at all used to strip down to "" entirely — harmless on
// its own, but findBestMatch() below treats an exact normalized-string match
// as a confident match, so two unrelated titles that both happen to
// normalize to "" would incorrectly "match" each other. \p{L}/\p{N} (with
// the `u` flag) keep letters/digits from any script instead of only ASCII.
const NON_WORD_CHARACTERS = /[^\p{L}\p{N}\s]/gu;

export function normalizeTitleForMatch(title: string): string {
  return title
    .toLowerCase()
    .replace(MULTIPLICATION_SIGNS, "x")
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "") // remove accents
    .replace(NON_WORD_CHARACTERS, "") // remove special characters, keeping letters/digits from any script
    .replace(/\s+/g, "") // remove spaces
    .trim();
}
