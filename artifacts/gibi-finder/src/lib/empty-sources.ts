// Tracks provider sources that returned no readable chapters, so they can be
// hidden from search/catalog results. Self-correcting: a source that later has
// chapters is un-marked.
const KEY = "gibi-finder:empty-sources";

const load = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
};

const save = (set: Set<string>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* ignore quota errors */
  }
};

const keyOf = (providerId: string, mangaId: string) => `${providerId}:${mangaId}`;

export const getEmptySources = (): Set<string> => load();

export const isSourceEmpty = (providerId: string, mangaId: string): boolean =>
  load().has(keyOf(providerId, mangaId));

export const markSourceEmpty = (providerId: string, mangaId: string) => {
  const set = load();
  if (!set.has(keyOf(providerId, mangaId))) {
    set.add(keyOf(providerId, mangaId));
    save(set);
  }
};

export const markSourceHasChapters = (providerId: string, mangaId: string) => {
  const set = load();
  if (set.delete(keyOf(providerId, mangaId))) save(set);
};

/** An item is hidden only when ALL of its sources are known to be empty. */
export const hasReadableSource = (
  sources: { providerId: string; id: string }[] | undefined,
  empties: Set<string> = load()
): boolean => {
  if (!sources || sources.length === 0) return true;
  return sources.some(s => !empties.has(keyOf(s.providerId, s.id)));
};
