import { isSourceEmpty, markSourceEmpty, markSourceHasChapters } from "@/lib/empty-sources";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface SourceLike {
  providerId: string;
  id: string;
}

/**
 * Picks which source to open when a title has multiple providers behind it.
 * Fast path: 0 or 1 candidate source → return immediately, no network call
 * (the overwhelming majority of titles only have one source anyway).
 * Otherwise: fetch each candidate's chapter list in parallel (small number
 * per title — never the whole catalog) via the same /providers/chapters
 * endpoint the reader already uses, and open whichever has the most
 * chapters. A source that errors or comes back empty is scored 0, so a
 * single flaky provider can't block the pick; if every fetch fails, falls
 * back to the first candidate (previous "first non-known-dead" behavior).
 *
 * Piggybacks on the fetch to update the same empty-sources cache the reader
 * maintains (lib/empty-sources.ts) — a nice side effect: sources compared
 * here get checked/marked for free, sharpening future "is this dead"
 * filtering elsewhere in the app.
 */
export async function pickBestSource<T extends SourceLike>(
  sources: T[] | undefined
): Promise<T | undefined> {
  if (!sources || sources.length === 0) return undefined;
  const usable = sources.filter(s => !isSourceEmpty(s.providerId, s.id));
  const candidates = usable.length > 0 ? usable : sources;
  if (candidates.length === 1) return candidates[0];

  const counts = await Promise.all(
    candidates.map(async s => {
      try {
        const res = await fetch(
          `${BASE}/api/providers/chapters?providerId=${encodeURIComponent(s.providerId)}&id=${encodeURIComponent(s.id)}`
        );
        if (!res.ok) return 0;
        const chapters = await res.json();
        const count = Array.isArray(chapters) ? chapters.length : 0;
        if (count > 0) markSourceHasChapters(s.providerId, s.id);
        else markSourceEmpty(s.providerId, s.id);
        return count;
      } catch {
        return 0;
      }
    })
  );

  let best = candidates[0];
  let bestCount = counts[0] ?? 0;
  for (let i = 1; i < candidates.length; i++) {
    if (counts[i] > bestCount) {
      best = candidates[i];
      bestCount = counts[i];
    }
  }
  return best;
}
