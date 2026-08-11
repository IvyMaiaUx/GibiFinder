// Genre-overlap recommendation heuristic — extracted from Explore.tsx's
// "Sugestões pra você" row so the same logic can drive personalization on
// Home and "se você gostou disso, veja também" on a title's detail page,
// instead of only existing in one place. No new data source: it works off
// whatever catalog `pool` the caller already has in memory, plus the same
// local favorites/reading-progress/completed data Explore already reads.
import { getFavorites } from "./favorites";
import { getLocalProgress, getLocalCompleted } from "./user-history";

interface RecommendableSource {
  providerId: string;
  id: string;
}

interface RecommendableItem {
  genres?: string[];
  rating?: number;
  sources?: RecommendableSource[];
}

// Matches Explore.tsx's own `norm` exactly (accent-insensitive genre matching
// — "Ação" and "acao" need to collide) so refactoring Explore to use this
// shared util doesn't change its existing behavior.
const norm = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const keyOf = (providerId: string, mangaId: string) => `${providerId}:${mangaId}`;

/** Source keys (`providerId:mangaId`) the user is reading, has finished, or has favorited. */
export function getInteractedSourceKeys(): Set<string> {
  const completed = getLocalCompleted();
  const completedChapterKeys = new Set(
    completed.map(c => `${c.providerId}|${c.mangaId}|${c.chapterId}`)
  );
  const readingKeys = Object.values(getLocalProgress())
    .filter((p): p is NonNullable<typeof p> => !!p?.providerId && !!p?.mangaId)
    // A title whose in-progress chapter is already marked completed is "read", not "reading" — matches Colecao.tsx/Explore.tsx.
    .filter(p => !completedChapterKeys.has(`${p.providerId}|${p.mangaId}|${p.chapterId}`))
    .map(p => keyOf(p.providerId!, p.mangaId!));
  const readKeys = completed.map(c => keyOf(c.providerId, c.mangaId));
  const favKeys = getFavorites().map(f => keyOf(f.providerId, f.mangaId));
  return new Set([...readingKeys, ...readKeys, ...favKeys]);
}

export function isInteracted(item: RecommendableItem, interactedKeys: Set<string>): boolean {
  return !!item.sources?.some(s => interactedKeys.has(keyOf(s.providerId, s.id)));
}

/**
 * Ranks `pool` by overlap with the genres of what the user has read/favorited
 * (top 5 genres by frequency), excluding anything already interacted with.
 * Same heuristic as Explore's "Sugestões pra você" row — pass it any catalog
 * pool (Explore's popular+latest union, a genre fetch, etc).
 */
export function getGenreBasedSuggestions<T extends RecommendableItem>(pool: T[], limit = 12): T[] {
  const interactedKeys = getInteractedSourceKeys();
  const genreScore = new Map<string, number>();
  for (const it of pool) {
    if (!isInteracted(it, interactedKeys)) continue;
    for (const g of it.genres || []) genreScore.set(norm(g), (genreScore.get(norm(g)) || 0) + 1);
  }
  const topGenres = [...genreScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
  if (topGenres.length === 0) return [];

  return pool
    .filter(it => !isInteracted(it, interactedKeys) && (it.genres || []).some(g => topGenres.includes(norm(g))))
    .map(it => ({ it, score: (it.genres || []).filter(g => topGenres.includes(norm(g))).length + (it.rating || 0) / 20 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.it);
}

/**
 * "Se você gostou disso, veja também" — ranks `pool` by genre overlap with a
 * single `current` item, for a title's own detail page (not the user's whole
 * history like getGenreBasedSuggestions above).
 *
 * Excludes by `current.sources` (providerId+id), not by `id`: `pool` items
 * are catalog groups with a generated normalized-title group id, while the
 * currently-viewed title is identified by a provider-specific source id —
 * those never collide, so comparing `.id` directly let the current title
 * show up in its own "similar" row.
 */
export function getSimilarByGenre<T extends RecommendableItem>(
  pool: T[],
  current: RecommendableItem,
  limit = 8
): T[] {
  const currentGenres = new Set((current.genres || []).map(norm));
  if (currentGenres.size === 0) return [];
  const currentKeys = new Set((current.sources || []).map(s => keyOf(s.providerId, s.id)));

  return pool
    .filter(it => !it.sources?.some(s => currentKeys.has(keyOf(s.providerId, s.id))) && (it.genres || []).some(g => currentGenres.has(norm(g))))
    .map(it => ({ it, score: (it.genres || []).filter(g => currentGenres.has(norm(g))).length + (it.rating || 0) / 20 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.it);
}
