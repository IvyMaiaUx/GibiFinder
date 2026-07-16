import type { LocalHistoryItem } from "@/hooks/use-local-history";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const SEARCH_HISTORY_KEY = "gibi_local_history";
const READING_HISTORY_KEY = "gibi-finder:reading-history";
const PROGRESS_KEY = "gibi-finder:progress";
const MAX_SEARCH_ITEMS = 50;
const MAX_READING_ITEMS = 100;

export interface ReadingHistoryItem {
  id: string;
  title: string;
  coverUrl?: string;
  chapterId: string;
  chapterNum: string;
  chapterTitle?: string;
  providerId: string;
  mangaId: string;
  language?: string;
  pageNumber: number;
  timestamp: number;
}

export interface ReadingProgressItem {
  chapterId: string;
  chapterNum: string;
  pageNumber: number;
  title: string;
  coverUrl?: string;
  providerId?: string;
  mangaId?: string;
  language?: string;
  updatedAt: string;
}

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const getLocalSearchHistory = () => readJson<LocalHistoryItem[]>(SEARCH_HISTORY_KEY, []);

export const saveLocalSearchHistory = (items: LocalHistoryItem[]) => {
  writeJson(SEARCH_HISTORY_KEY, items.slice(0, MAX_SEARCH_ITEMS));
};

export const addSearchHistoryItem = async (item: LocalHistoryItem, userId?: string) => {
  const updated = [item, ...getLocalSearchHistory().filter(historyItem => historyItem.id !== item.id)].slice(0, MAX_SEARCH_ITEMS);
  saveLocalSearchHistory(updated);

  if (!userId) return;
  await fetch(`${BASE}/api/auth/history/search/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, item })
  }).catch(err => console.error("Failed to sync search history:", err));
};

export const getSyncedSearchHistory = async (userId?: string) => {
  if (!userId) return getLocalSearchHistory();
  try {
    const res = await fetch(`${BASE}/api/auth/history/search?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return getLocalSearchHistory();
    const items = await res.json() as LocalHistoryItem[];
    saveLocalSearchHistory(items);
    return items;
  } catch (err) {
    console.error("Failed to load synced search history:", err);
    return getLocalSearchHistory();
  }
};

export const syncSearchHistory = async (userId: string) => {
  const localItems = getLocalSearchHistory();
  await fetch(`${BASE}/api/auth/history/search/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, items: localItems })
  }).catch(err => console.error("Failed to upload search history:", err));
  return getSyncedSearchHistory(userId);
};

export const removeSearchHistoryItem = async (id: string, userId?: string) => {
  const updated = getLocalSearchHistory().filter(item => item.id !== id);
  saveLocalSearchHistory(updated);
  if (userId) {
    await fetch(`${BASE}/api/auth/history/search/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE"
    }).catch(err => console.error("Failed to delete search history:", err));
  }
  return updated;
};

export const clearSearchHistory = async (userId?: string) => {
  localStorage.removeItem(SEARCH_HISTORY_KEY);
  if (userId) {
    await fetch(`${BASE}/api/auth/history/search?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE"
    }).catch(err => console.error("Failed to clear search history:", err));
  }
};

export const getLocalReadingHistory = () => readJson<ReadingHistoryItem[]>(READING_HISTORY_KEY, []);

export const saveLocalReadingHistory = (items: ReadingHistoryItem[]) => {
  writeJson(READING_HISTORY_KEY, items.slice(0, MAX_READING_ITEMS));
};

export const getLocalProgress = () => readJson<Record<string, ReadingProgressItem>>(PROGRESS_KEY, {});

export const saveLocalProgress = (items: Record<string, ReadingProgressItem>) => {
  writeJson(PROGRESS_KEY, items);
};

export const getSyncedReadingHistory = async (userId?: string) => {
  if (!userId) return getLocalReadingHistory();
  try {
    const res = await fetch(`${BASE}/api/auth/history/reading?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return getLocalReadingHistory();
    const items = await res.json() as ReadingHistoryItem[];
    saveLocalReadingHistory(items);
    const progressItems = getLocalProgress();
    for (const item of items) {
      if (!item.mangaId || !item.providerId) continue;
      const key = `${item.providerId}-${item.mangaId}`;
      progressItems[key] = {
        chapterId: item.chapterId,
        chapterNum: item.chapterNum,
        pageNumber: item.pageNumber,
        title: item.title,
        coverUrl: item.coverUrl,
        providerId: item.providerId,
        mangaId: item.mangaId,
        language: item.language,
        updatedAt: new Date(item.timestamp || Date.now()).toISOString()
      };
    }
    saveLocalProgress(progressItems);
    return items;
  } catch (err) {
    console.error("Failed to load synced reading history:", err);
    return getLocalReadingHistory();
  }
};

export const syncReadingHistory = async (userId: string) => {
  const history = getLocalReadingHistory();
  const progress = getLocalProgress();
  await fetch(`${BASE}/api/auth/history/reading/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, history, progress })
  }).catch(err => console.error("Failed to upload reading history:", err));
  return getSyncedReadingHistory(userId);
};

export const saveReadingState = async (
  progressKey: string,
  progress: ReadingProgressItem,
  historyEntry: ReadingHistoryItem,
  userId?: string
) => {
  const progressItems = getLocalProgress();
  progressItems[progressKey] = progress;
  saveLocalProgress(progressItems);

  const updatedHistory = [
    historyEntry,
    ...getLocalReadingHistory().filter(item => !(item.mangaId === historyEntry.mangaId && item.chapterId === historyEntry.chapterId))
  ].slice(0, MAX_READING_ITEMS);
  saveLocalReadingHistory(updatedHistory);

  if (!userId) return;
  await fetch(`${BASE}/api/auth/history/reading/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, progressKey, progress, historyItem: historyEntry })
  }).catch(err => console.error("Failed to sync reading history:", err));
};

export const removeReadingHistoryItem = async (id: string, userId?: string) => {
  const updated = getLocalReadingHistory().filter(item => item.id !== id);
  saveLocalReadingHistory(updated);
  if (userId) {
    await fetch(`${BASE}/api/auth/history/reading/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE"
    }).catch(err => console.error("Failed to delete reading history:", err));
  }
  return updated;
};

export const clearReadingHistory = async (userId?: string) => {
  localStorage.removeItem(READING_HISTORY_KEY);
  if (userId) {
    await fetch(`${BASE}/api/auth/history/reading?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE"
    }).catch(err => console.error("Failed to clear reading history:", err));
  }
};
