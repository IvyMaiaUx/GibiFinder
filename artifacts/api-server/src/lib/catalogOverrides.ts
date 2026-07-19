import { supabase } from "./supabase";
import { logger } from "./logger";

/**
 * Admin curation layer for catalog/provider items. Since the catalog is served
 * live from providers/Drive (not a DB), overrides let an admin hide an item or
 * replace its cover / synopsis / title without touching the source. Keyed by
 * "<providerId>:<itemId>". Requires a table:
 *   create table catalog_overrides (
 *     id text primary key, provider_id text not null, item_id text not null,
 *     hidden boolean not null default false, cover_url text, description text,
 *     title text, updated_at timestamptz not null default now());
 */
export interface CatalogOverride {
  id: string;
  providerId: string;
  itemId: string;
  hidden: boolean;
  coverUrl?: string;
  description?: string;
  title?: string;
  /** Manual reclassification: "hq" | "gibi" | "manga" (overrides auto typeOf). */
  itemType?: string;
}

export function overrideKey(providerId: string, itemId: string): string {
  return `${providerId}:${itemId}`;
}

let cache: Map<string, CatalogOverride> | null = null;
let fetchedAt = 0;
const TTL_MS = 60_000;

export async function getOverrides(force = false): Promise<Map<string, CatalogOverride>> {
  const now = Date.now();
  if (!force && cache && now - fetchedAt < TTL_MS) return cache;
  if (!supabase) return cache ?? new Map();
  try {
    const { data, error } = await supabase.from("catalog_overrides").select("*");
    if (error) return cache ?? new Map();
    const map = new Map<string, CatalogOverride>();
    for (const r of (data || []) as Record<string, unknown>[]) {
      map.set(String(r.id), {
        id: String(r.id),
        providerId: String(r.provider_id),
        itemId: String(r.item_id),
        hidden: !!r.hidden,
        coverUrl: (r.cover_url as string) || undefined,
        description: (r.description as string) || undefined,
        title: (r.title as string) || undefined,
        itemType: (r.item_type as string) || undefined,
      });
    }
    cache = map;
    fetchedAt = now;
    return map;
  } catch (err) {
    logger.warn({ err }, "failed to load catalog_overrides");
    return cache ?? new Map();
  }
}

export async function listOverrides(): Promise<CatalogOverride[]> {
  return Array.from((await getOverrides(true)).values());
}

export async function upsertOverride(o: {
  providerId: string;
  itemId: string;
  hidden?: boolean;
  coverUrl?: string | null;
  description?: string | null;
  title?: string | null;
  itemType?: string | null;
}): Promise<void> {
  if (!supabase) throw new Error("supabase_unavailable");
  const id = overrideKey(o.providerId, o.itemId);
  const { error } = await supabase.from("catalog_overrides").upsert({
    id,
    provider_id: o.providerId,
    item_id: o.itemId,
    hidden: o.hidden ?? false,
    cover_url: o.coverUrl ?? null,
    description: o.description ?? null,
    title: o.title ?? null,
    item_type: o.itemType ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  cache = null; // invalidate
}

export async function deleteOverride(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("catalog_overrides").delete().eq("id", id);
  cache = null;
}

/**
 * Apply overrides to a list of unified catalog results: drop hidden items and
 * replace cover/description/title when overridden. Matches on any of an item's
 * sources.
 */
export function applyOverrides<
  T extends {
    title?: string;
    coverUrl?: string;
    description?: string;
    sources?: { providerId: string; id: string }[];
  }
>(items: T[], overrides: Map<string, CatalogOverride>): T[] {
  if (!overrides.size) return items;
  const out: T[] = [];
  for (const item of items) {
    let ov: CatalogOverride | undefined;
    for (const s of item.sources || []) {
      const found = overrides.get(overrideKey(s.providerId, s.id));
      if (found) { ov = found; break; }
    }
    if (ov) {
      if (ov.hidden) continue;
      if (ov.coverUrl) item.coverUrl = ov.coverUrl;
      if (ov.description) item.description = ov.description;
      if (ov.title) item.title = ov.title;
      // Manual reclassification travels as a dedicated field the client's typeOf
      // reads first — no genre pollution, so it never shows up as a tag.
      if (ov.itemType) (item as unknown as Record<string, unknown>).forcedType = ov.itemType;
    }
    out.push(item);
  }
  return out;
}
