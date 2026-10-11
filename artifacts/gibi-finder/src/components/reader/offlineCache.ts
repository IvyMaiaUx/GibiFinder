import { get, set, del, keys, getMany } from "idb-keyval";

const CACHE_NAME = "gibi-finder:offline-pages-v1";
const IDB_OFFLINE_PREFIX = "gibi-offline:ch:";

export interface OfflineChapterMeta {
  mangaId: string;
  chapterId: string;
  chapterNum?: string;
  title?: string;
  providerId: string;
  pageCount: number;
  downloadedAt: number;
}

export async function isChapterCachedOffline(providerId: string, mangaId: string, chapterId: string): Promise<boolean> {
  const key = `${IDB_OFFLINE_PREFIX}${providerId}:${mangaId}:${chapterId}`;
  try {
    const meta = await get<OfflineChapterMeta>(key);
    return !!meta;
  } catch {
    return false;
  }
}

export async function getOfflineChapterMeta(providerId: string, mangaId: string, chapterId: string): Promise<OfflineChapterMeta | null> {
  const key = `${IDB_OFFLINE_PREFIX}${providerId}:${mangaId}:${chapterId}`;
  try {
    const meta = await get<OfflineChapterMeta>(key);
    return meta || null;
  } catch {
    return null;
  }
}

export async function listOfflineChapters(): Promise<OfflineChapterMeta[]> {
  try {
    const allKeys = await keys();
    const offlineKeys = allKeys.filter((k) => typeof k === "string" && k.startsWith(IDB_OFFLINE_PREFIX));
    if (offlineKeys.length === 0) return [];
    const items = await getMany(offlineKeys);
    return items.filter((item): item is OfflineChapterMeta => !!item);
  } catch {
    return [];
  }
}

export async function cacheChapterPages(
  providerId: string,
  mangaId: string,
  chapterId: string,
  chapterNum: string,
  title: string,
  pages: { url: string }[],
  onProgress?: (done: number, total: number) => void
): Promise<boolean> {
  if (typeof window === "undefined" || !pages.length) return false;

  let cache: Cache | null = null;
  if ("caches" in window) {
    try {
      cache = await caches.open(CACHE_NAME);
    } catch (e) {
      console.warn("CacheStorage unavailable:", e);
    }
  }

  let done = 0;
  for (const page of pages) {
    try {
      if (cache) {
        const req = new Request(page.url, { mode: "cors" });
        const match = await cache.match(req);
        if (!match) {
          const res = await fetch(page.url);
          if (res.ok) {
            await cache.put(req, res);
          }
        }
      }
    } catch (err) {
      console.warn("Failed to cache page:", page.url, err);
    }
    done++;
    if (onProgress) onProgress(done, pages.length);
  }

  const key = `${IDB_OFFLINE_PREFIX}${providerId}:${mangaId}:${chapterId}`;
  const meta: OfflineChapterMeta = {
    mangaId,
    chapterId,
    chapterNum,
    title,
    providerId,
    pageCount: pages.length,
    downloadedAt: Date.now(),
  };
  await set(key, meta);
  return true;
}

export async function deleteOfflineChapter(providerId: string, mangaId: string, chapterId: string): Promise<void> {
  const key = `${IDB_OFFLINE_PREFIX}${providerId}:${mangaId}:${chapterId}`;
  await del(key);
}
