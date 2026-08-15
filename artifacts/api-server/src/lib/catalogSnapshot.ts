import { supabase } from "./supabase";
import { logger } from "./logger";
import type { UnifiedSearchResult } from "../providers/types";

/**
 * Shared snapshot of the *assembled* catalog.
 *
 * `ProviderManager.getCatalog()` fans out to 13 providers over HTTP and takes
 * 8-12s cold. It memoises the result, but only in a static `Map` — which on
 * Vercel lives and dies with a single lambda, so in practice most visitors were
 * paying the full fan-out. The edge cache hides that from repeat traffic, yet
 * whoever arrives on a cold region still waits it out.
 *
 * So the assembled result is persisted the same way `CuratedComicsProvider`
 * already persists its Drive crawl: one row in `curated_cache`, which is a
 * plain id/JSONB store. Reading it back is a single indexed row fetch.
 *
 * The table is already in supabase-schema.sql, so this needs no migration.
 * Every failure path returns null / no-ops: without Supabase configured, or
 * before the first snapshot is written, callers simply crawl as they did.
 */

// Bump when the stored shape changes, so old snapshots are ignored rather than
// served in a form the caller no longer expects. v2 folds the MangaDex ratings
// into the stored items; a v1 row has none, and the read path no longer injects
// them, so serving one would drop every star rating until the next crawl.
const VERSION = "v2";

/** Older than this and the snapshot is refused, forcing a live crawl. */
const MAX_AGE_MS = 1000 * 60 * 60 * 24;

export function snapshotKey(listType: string, nsfw: boolean): string {
  return `catalog-agg-${VERSION}:${listType}:${nsfw ? "nsfw" : "sfw"}`;
}

/**
 * Memo in front of the row read, so a warm lambda answers from process memory
 * instead of paying a Supabase round trip (~0.9s for this 200KB row) on every
 * single request. Short TTL: this is only about absorbing bursts on one warm
 * instance, the shared row is still the source of truth.
 */
const memo = new Map<string, { items: UnifiedSearchResult[]; storedAt: number; readAt: number }>();
const MEMO_TTL_MS = 1000 * 60 * 5;

export function clearSnapshotMemo(): void {
  memo.clear();
}

export async function readSnapshot(
  key: string,
): Promise<{ items: UnifiedSearchResult[]; ageMs: number } | null> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.readAt < MEMO_TTL_MS) {
    return { items: hit.items, ageMs: Date.now() - hit.storedAt };
  }
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("curated_cache")
      .select("data, updated_at")
      .eq("id", key)
      .maybeSingle();
    if (error || !data?.data) return null;

    const items = data.data as UnifiedSearchResult[];
    if (!Array.isArray(items) || items.length === 0) return null;

    const storedAt = new Date(data.updated_at as string).getTime();
    const ageMs = Date.now() - storedAt;
    if (!Number.isFinite(ageMs) || ageMs > MAX_AGE_MS) return null;

    memo.set(key, { items, storedAt, readAt: Date.now() });
    return { items, ageMs };
  } catch (err) {
    logger.warn({ err, key }, "catalog snapshot: read failed");
    return null;
  }
}

/**
 * Drop every stored snapshot. Called when an admin rebuilds the catalog or
 * clears the caches — otherwise the snapshot would keep serving the pre-rebuild
 * catalog for up to MAX_AGE_MS, which is exactly what the admin just asked to
 * get rid of.
 */
export async function clearSnapshots(): Promise<void> {
  memo.clear();
  if (!supabase) return;
  try {
    await supabase
      .from("curated_cache")
      .delete()
      .like("id", `catalog-agg-${VERSION}:%`);
  } catch (err) {
    logger.warn({ err }, "catalog snapshot: clear failed");
  }
}

export async function writeSnapshot(key: string, items: UnifiedSearchResult[]): Promise<void> {
  if (items.length === 0) return;
  memo.set(key, { items, storedAt: Date.now(), readAt: Date.now() });
  if (!supabase) return;
  try {
    await supabase
      .from("curated_cache")
      .upsert({ id: key, data: items, updated_at: new Date().toISOString() });
  } catch (err) {
    logger.warn({ err, key }, "catalog snapshot: write failed");
  }
}
