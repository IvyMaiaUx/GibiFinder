import type { CatalogItem } from "@/components/results/CatalogCard";

const MEMORY_CACHE = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getStorageKey(key: string): string {
  return `gibi:catalog-cache:${key}`;
}

export function getCachedData<T>(key: string): T | null {
  // 1. Check in-memory fast cache
  const mem = MEMORY_CACHE.get(key);
  if (mem && Date.now() - mem.ts < CACHE_TTL_MS) {
    return mem.data as T;
  }

  // 2. Check sessionStorage
  try {
    if (typeof sessionStorage !== "undefined") {
      const raw = sessionStorage.getItem(getStorageKey(key));
      if (raw) {
        const parsed = JSON.parse(raw) as { data: T; ts: number };
        if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
          MEMORY_CACHE.set(key, { data: parsed.data, ts: parsed.ts || Date.now() });
          return parsed.data;
        }
      }
    }
  } catch {
    /* ignore storage errors */
  }

  return null;
}

export function setCachedData<T>(key: string, data: T): void {
  if (!data || (Array.isArray(data) && data.length === 0)) return;
  const entry = { data, ts: Date.now() };
  MEMORY_CACHE.set(key, entry);

  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(getStorageKey(key), JSON.stringify(entry));
    }
  } catch {
    // If quota exceeded, clear old entries
    try {
      if (typeof sessionStorage !== "undefined") {
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const k = sessionStorage.key(i);
          if (k?.startsWith("gibi:catalog-cache:")) {
            sessionStorage.removeItem(k);
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
}

export function getCatalogCacheKey(listType: string, nsfw: boolean): string {
  return `catalog:${listType}:${nsfw ? "nsfw" : "sfw"}`;
}

export function getRecentUpdatesCacheKey(nsfw: boolean): string {
  return `recent-updates:${nsfw ? "nsfw" : "sfw"}`;
}

export function getCuratedRowsCacheKey(typeFilter: string, nsfw: boolean): string {
  return `curated-rows:${typeFilter}:${nsfw ? "nsfw" : "sfw"}`;
}
