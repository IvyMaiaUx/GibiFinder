import { get, set, update } from "idb-keyval";
import { ReaderMode, ReaderDirection, ReaderLayout, ReaderTheme, ReaderFit } from "@/components/reader/readerTypes";

export interface ReaderPreferences {
  mode: ReaderMode;
  direction: ReaderDirection;
  layout: ReaderLayout;
  fit: ReaderFit;
  theme: ReaderTheme;
}

const DEFAULT_PREFS: ReaderPreferences = {
  mode: "paginated",
  direction: "ltr",
  layout: "auto",
  fit: "fit-screen",
  theme: "black",
};

/**
 * Retrieves general reader preferences for a given comic/manga.
 */
export async function getReaderPreferences(mangaId: string): Promise<ReaderPreferences> {
  if (!mangaId) return DEFAULT_PREFS;
  try {
    const saved = await get<Partial<ReaderPreferences>>(`gibi-reader:prefs:${mangaId}`);
    return { ...DEFAULT_PREFS, ...(saved || {}) };
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * Saves reader preferences using idb-keyval update() to prevent get->set race conditions.
 */
export async function saveReaderPreferences(
  mangaId: string,
  prefs: Partial<ReaderPreferences>
): Promise<void> {
  if (!mangaId) return;
  try {
    await update(`gibi-reader:prefs:${mangaId}`, (val: Partial<ReaderPreferences> | undefined) => ({
      ...DEFAULT_PREFS,
      ...(val || {}),
      ...prefs,
    }));
  } catch (err) {
    console.error("Failed to update reader preferences in IndexedDB:", err);
  }
}

/**
 * Retrieves the last read page for a specific chapter (keyed by mangaId + chapterId).
 */
export async function getReaderProgress(mangaId: string, chapterId: string): Promise<number | null> {
  if (!mangaId || !chapterId) return null;
  try {
    const page = await get<number>(`gibi-reader:progress:${mangaId}:${chapterId}`);
    return typeof page === "number" && !isNaN(page) ? page : null;
  } catch {
    return null;
  }
}

/**
 * Saves the current reading progress for a specific chapter atomically.
 */
export async function saveReaderProgress(
  mangaId: string,
  chapterId: string,
  page: number
): Promise<void> {
  if (!mangaId || !chapterId) return;
  try {
    await set(`gibi-reader:progress:${mangaId}:${chapterId}`, page);
  } catch (err) {
    console.error("Failed to save reading progress in IndexedDB:", err);
  }
}
