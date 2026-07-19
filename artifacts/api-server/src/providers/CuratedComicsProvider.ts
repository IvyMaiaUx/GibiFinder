import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";
import { logger } from "../lib/logger";
import { hasDriveKey, nextDriveKey } from "../lib/driveKeys";
import { supabase } from "../lib/supabase";

// Shared Supabase cache row so the expensive Drive crawl runs once and every
// (stateless) serverless instance reads the result fast. Requires a table:
//   create table curated_cache (id text primary key, data jsonb, updated_at timestamptz default now());
// Bump the suffix to invalidate the shared cache after a crawl/format change
// (e.g. new HQ/Gibi category tags) so items get re-crawled with the new shape.
const CACHE_ROW_ID = "catalog-v3";
const MEM_TTL_MS = 1000 * 60 * 30;      // trust in-memory cache for 30 min
const REMOTE_TTL_MS = 1000 * 60 * 60 * 6; // refresh the shared cache every 6 h

type ReaderKind = "embed" | "external" | "pdf";

interface CuratedChapter {
  id: string;
  chapterNum: string;
  title: string;
  readerUrl: string;
  readerKind: ReaderKind;
}

interface CuratedItem {
  id: string;
  title: string;
  coverUrl?: string;
  description?: string;
  genres?: string[];
  sourceLabel: string;
  chapters: CuratedChapter[];
}

const EMBED_PREFIX = "embed:";

const STATIC_ITEMS: CuratedItem[] = [
  {
    id: "turma-monica-jovem-ii-01",
    title: "Turma da Mônica Jovem II - Edição 01",
    description: "Edição da Turma da Mônica Jovem II disponível no PubHTML5.",
    genres: ["Infantil", "Nacional"],
    sourceLabel: "PubHTML5",
    coverUrl: "https://pubhtml5.com/files/html5/turma_da_monica_jovem_ii_-_edicao_01/001.jpg",
    chapters: [{
      id: "ch1",
      chapterNum: "1",
      title: "Edição 01",
      readerUrl: "https://pubhtml5.com/wydw/aero/Turma_da_M%C3%B4nica_Jovem_II_-_Edi%C3%A7%C3%A3o_01/",
      readerKind: "embed"
    }]
  },
  {
    id: "cebolinha-107",
    title: "Cebolinha #107",
    description: "Gibi do Cebolinha em PDF (Verboaria).",
    genres: ["Infantil", "Nacional"],
    sourceLabel: "Verboaria",
    chapters: [{
      id: "ch1",
      chapterNum: "107",
      title: "Edição 107",
      readerUrl: "https://verboaria.com.br/wp-content/uploads/2020/04/Cebolinha-107.pdf",
      readerKind: "pdf"
    }]
  }
];

const GOOGLE_SITES_URL =
  "https://sites.google.com/educacao.quintana.sp.gov.br/biblioteca-virtual/hist%C3%B3rias-em-quadrinhos";

// Root Google Drive folders to crawl (each is walked recursively into subfolders).
const DRIVE_FOLDER_IDS = [
  "1Etdsik4rGHDhNv5g4_8J_DDTuuvvlunN",
  "1JPCtkMZrAoN1XujYbPrO1PjEhR43VgwM",
  "1-0-G5WCbZH5WG7Iz2ZVLlw2mlaSUp0cP",
  "1zjVQ0K6mWgXcZSTV8gNi-jxY0x2KWjGN",
  "1e0nUE7b-V3rVUpUsla4UYJJjSXfk5R7O",
  "15cfooGkb83MqXkV34aQmaxd5O0bBG6wb",
  "173Hgmk82n1_TaabrzIbPtiIqlwI39B1m",
  "1p3wvutz3QU0BRUXPk1-aQNVqrRhpbEj5",
  "17ir4fii96BEWp8SY20FmUDIZhc1CooRK",
  "17kZd7LFzzNsjJ1zEU2sB0YuRhpyhBV1A",
  "183xnIWeL_kecTZLtBlNhUgAcPVy-nZwp",
  "19BZpP9yvT8ZEtfVURLW9RLQc1u2FCOFH",
  "1wXs64lZ0nOBAAWwGutDHfjO-TnfYO6Ee",
  "1HpftuZaWFK7rr83e5m1N1QdgXxUZ_XzB",
  "1-7xvifxdj0tER_-q_f5F4oMk6mJ-64QD",
  "1-dhsSLfvPnVGwlMFjHQC2d5BF8EDeXl-",
  "17EfGewQ9GWazH_LjtrsPVV5IgIFvz2ik",
  "1O04VepyPqNEC3MNpbF8EgzEN-zi04_qo",
];

// Curator index pages: Google Sites pages that link out to many Drive folders.
// We scrape them each refresh and crawl whatever folders they point to, so new
// libraries appear automatically without editing this file.
const DRIVE_INDEX_PAGES = [
  "https://sites.google.com/view/hqsmdc/marvel",
  "https://sites.google.com/view/hqsmdc/dc",
  "https://sites.google.com/view/hqsmdc/outros",
];


function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Brazilian "gibi" series \u2014 used to split the mixed Drive library into the Gibi
// tab (these) vs the HQ tab (everything else: Marvel/DC/Star Wars/...).
const GIBI_TITLE_KEYWORDS = [
  "monica", "cebolinha", "magali", "cascao", "chico bento", "almanaque", "penadinho",
  "piteco", "horacio", "pelezinho", "ronaldinho", "tmj", "turma da", "disney",
  "pato donald", "mickey", "tio patinhas", "ze carioca", "ze carioca", "luluzinha",
  "recruta zero", "senninha", "menino maluquinho", "sitio do picapau", "bidu"
];

// Category tag added to a curated item's genres so the frontend can separate the
// Gibi tab from the HQ tab even though both come from the same provider.
function categoryGenre(title: string, isNational: boolean): string {
  if (isNational) return "Gibi Nacional";
  const t = normalizeText(title);
  return GIBI_TITLE_KEYWORDS.some(k => t.includes(k)) ? "Gibi Nacional" : "HQ";
}

function matchesQuery(query: string, item: CuratedItem): boolean {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalizeText([item.title, item.description || "", ...(item.genres || [])].join(" "));
  return terms.every(term => haystack.includes(term));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Lowercased connector words kept lowercase inside a title (unless first word).
const TITLE_STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "o", "a", "os", "as", "em", "no", "na", "ao", "à"
]);
// Scan-group / quality tags to drop when they appear as standalone tokens.
const JUNK_TOKENS = new Set([
  "sq", "hq", "hqs", "cbr", "cbz", "pdf", "digital", "scan", "scaneado", "scanned",
  "oficial", "completo", "completa", "gibi", "revista", "ptbr", "pt", "br", "por"
]);

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .map((word, i) => {
      if (!word) return word;
      if (word.startsWith("#")) return word;
      const lower = word.toLowerCase();
      if (i > 0 && TITLE_STOPWORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

// Drive file names are messy: no spaces, hyphen/underscore separators, "01de05"
// issue markers and trailing scan tags. Best-effort tidy into a readable title.
function cleanTitle(fileName: string): string {
  let s = decodeHtml(fileName).replace(/\.(?:pdf|cbr|cbz)$/i, "");

  // Drop bracketed/parenthesized annotations: [Grupo], (2024), (Digital)...
  s = s.replace(/[\[(][^\])]*[\])]/g, " ");
  // Separators -> spaces.
  s = s.replace(/[._\-]+/g, " ");
  // Split gluedCamelCase and letter<->number boundaries so "Skrulls05" -> "Skrulls 05".
  s = s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2");
  // "01 de 05" / "01de05" issue-of-total -> "#1".
  s = s.replace(/\b0*(\d{1,4})\s*de\s*0*\d{1,4}\b/gi, "#$1");
  // Drop standalone junk/scan tags.
  s = s
    .split(/\s+/)
    .filter(tok => tok && !JUNK_TOKENS.has(tok.toLowerCase()))
    .join(" ");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return decodeHtml(fileName).replace(/\.(?:pdf|cbr|cbz)$/i, "").trim();

  // Only re-case when the source is basically single-case (ALLCAPS/lowercase or
  // separator-mangled); leave already mixed-case names alone.
  const hasLower = /[a-z]/.test(s);
  const hasUpper = /[A-Z]/.test(s);
  if (!hasLower || !hasUpper) s = toTitleCase(s);
  return s;
}

export class CuratedComicsProvider implements Provider {
  id: string;
  name: string;
  language: string;
  private catalogCache: { fetchedAt: number; items: CuratedItem[] } | null = null;

  constructor(id: string, name: string, language = "pt") {
    this.id = id;
    this.name = name;
    this.language = language;
    // Warm the Drive/Sites cache as soon as the instance boots, so the very
    // first catalog request already has the full gibi library (not just statics).
    void this.refreshCatalog().catch(() => { this.refreshing = null; });
  }

  private toSearchResult(item: CuratedItem): SearchResult {
    return {
      id: item.id,
      title: item.title,
      coverUrl: item.coverUrl,
      description: item.description,
      providerId: this.id,
      genres: item.genres
    };
  }

  private toDetails(item: CuratedItem): MangaDetails {
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      coverUrl: item.coverUrl,
      providerId: this.id,
      genres: item.genres
    };
  }

  private findItem(id: string, dynamicItems: CuratedItem[] = []): CuratedItem | undefined {
    return [...STATIC_ITEMS, ...dynamicItems].find(item => item.id === id);
  }

  private async fetchGoogleSitesItems(): Promise<CuratedItem[]> {
    try {
      const res = await fetch(GOOGLE_SITES_URL, {
        headers: { "user-agent": "Mozilla/5.0 GibiFinder/1.0" }
      });
      if (!res.ok) return [];
      const html = await res.text();
      const entries = new Map<string, { id: string; fileName: string }>();
      const embedRegex = /aria-label="Drive,\s*([^"]+\.(?:pdf|cbr|cbz))"[^>]+data-src="https:\/\/drive\.google\.com\/file\/d\/([^/"]+)\/preview"/gi;

      for (const match of html.matchAll(embedRegex)) {
        const fileName = decodeHtml(match[1]).trim();
        const driveId = match[2].trim();
        if (fileName && driveId && !entries.has(driveId)) {
          entries.set(driveId, { id: driveId, fileName });
        }
      }

      if (entries.size === 0) {
        const idRegex = /https:\/\/drive\.google\.com\/file\/d\/([^/"]+)\/preview/gi;
        for (const match of html.matchAll(idRegex)) {
          const driveId = match[1].trim();
          if (driveId && !entries.has(driveId)) {
            entries.set(driveId, { id: driveId, fileName: `${driveId}.pdf` });
          }
        }
      }

      return Array.from(entries.values()).slice(0, 120).map(entry => {
        const title = cleanTitle(entry.fileName);
        const slug = `quintana-${entry.id}`;
        return {
          id: slug,
          title,
          description: `HQ da Biblioteca Virtual de Quintana (Google Sites).`,
          genres: ["Nacional", "Biblioteca"],
          sourceLabel: "Biblioteca Quintana",
          coverUrl: `https://drive.google.com/thumbnail?id=${entry.id}&sz=w400`,
          chapters: [{
            id: `ch-${entry.id}`,
            chapterNum: "1",
            title,
            readerUrl: `https://drive.google.com/file/d/${entry.id}/preview`,
            readerKind: "pdf" as const
          }]
        };
      });
    } catch (err) {
      logger.warn({ err: err }, `Curated provider [${this.id}] Google Sites fetch failed:`);
      return [];
    }
  }

  // Scrape the curator index pages for Drive folder ids (multiple link formats:
  // /folders/<id>, embeddedfolderview?id=<id>, open?id=<id>, /file/d/<id>).
  private async discoverIndexFolderIds(): Promise<string[]> {
    const htmls = await Promise.all(
      DRIVE_INDEX_PAGES.map(url =>
        fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })
          .then(r => (r.ok ? r.text() : ""))
          .catch(() => "")
      )
    );
    const ids = new Set<string>();
    const re = /(?:drive\.google\.com\/(?:drive\/)?folders\/|embeddedfolderview\?id=|open\?id=|\/file\/d\/)([A-Za-z0-9_-]{25,})/gi;
    for (const html of htmls) {
      if (!html) continue;
      for (const m of html.matchAll(re)) ids.add(m[1]);
    }
    return Array.from(ids);
  }

  private async fetchDriveFolderItems(): Promise<CuratedItem[]> {
    if (!hasDriveKey()) return [];

    const discovered = await this.discoverIndexFolderIds().catch(() => [] as string[]);
    const roots = Array.from(new Set([...DRIVE_FOLDER_IDS, ...discovered]));

    const items: CuratedItem[] = [];
    const seenFiles = new Set<string>();
    const seenFolders = new Set<string>(roots);
    const CONCURRENCY = 8;
    // We only read file metadata (id/name), never download PDFs, so a large
    // library is cheap to crawl — the caps just bound worst-case fan-out. Raised
    // for the growing set of shared root folders.
    const MAX_ITEMS = 5000;
    const MAX_FOLDERS = 900;
    let foldersVisited = 0;

    // List one folder: append its PDFs to `items`, return its child folder ids.
    const listFolder = async (folderId: string): Promise<string[]> => {
      const childFolders: string[] = [];
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          q: `'${folderId}' in parents and trashed=false and (mimeType='application/pdf' or mimeType='application/vnd.google-apps.folder')`,
          key: nextDriveKey() || "",
          pageSize: "100",
          fields: "nextPageToken,files(id,name,mimeType)"
        });
        if (pageToken) params.set("pageToken", pageToken);

        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
        if (!res.ok) break;
        const data = await res.json() as { nextPageToken?: string; files?: { id: string; name: string; mimeType: string }[] };

        for (const file of data.files || []) {
          if (file.mimeType === "application/vnd.google-apps.folder") {
            if (!seenFolders.has(file.id)) {
              seenFolders.add(file.id);
              childFolders.push(file.id);
            }
            continue;
          }
          if (seenFiles.has(file.id) || items.length >= MAX_ITEMS) continue;
          seenFiles.add(file.id);
          const title = cleanTitle(file.name);
          items.push({
            id: `drive-${file.id}`,
            title,
            description: "Gibi importado da biblioteca Google Drive compartilhada.",
            genres: ["Biblioteca", "Drive", categoryGenre(title, false)],
            sourceLabel: "Google Drive",
            coverUrl: `https://drive.google.com/thumbnail?id=${file.id}&sz=w600`,
            chapters: [{
              id: `ch-${file.id}`,
              chapterNum: "1",
              title,
              readerUrl: `https://drive.google.com/file/d/${file.id}/preview`,
              readerKind: "pdf"
            }]
          });
        }

        pageToken = data.nextPageToken;
      } while (pageToken && items.length < MAX_ITEMS);
      return childFolders;
    };

    try {
      // Breadth-first walk with bounded concurrency so the ~dozens of subfolders
      // are crawled in parallel and the whole thing finishes within the request
      // timeout instead of one slow sequential chain.
      let frontier: string[] = [...roots];
      while (frontier.length > 0 && foldersVisited < MAX_FOLDERS && items.length < MAX_ITEMS) {
        const batch = frontier.slice(0, CONCURRENCY);
        frontier = frontier.slice(CONCURRENCY);
        foldersVisited += batch.length;
        const childLists = await Promise.all(batch.map(id => listFolder(id).catch(() => [] as string[])));
        for (const children of childLists) frontier.push(...children);
      }
      return items;
    } catch (err) {
      logger.warn({ err: err }, `Curated provider [${this.id}] Drive folder fetch failed:`);
      return items;
    }
  }

  private refreshing: Promise<CuratedItem[]> | null = null;

  // Read the shared catalog from Supabase (fast, single row). Returns null when
  // unavailable so callers fall back to crawling.
  private async loadRemoteCache(): Promise<{ items: CuratedItem[]; updatedAt: number } | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from("curated_cache")
        .select("data, updated_at")
        .eq("id", CACHE_ROW_ID)
        .maybeSingle();
      if (error || !data?.data) return null;
      const items = data.data as CuratedItem[];
      if (!Array.isArray(items) || items.length === 0) return null;
      return { items, updatedAt: new Date(data.updated_at as string).getTime() };
    } catch {
      return null;
    }
  }

  private async saveRemoteCache(items: CuratedItem[]): Promise<void> {
    if (!supabase || items.length === 0) return;
    try {
      await supabase
        .from("curated_cache")
        .upsert({ id: CACHE_ROW_ID, data: items, updated_at: new Date().toISOString() });
    } catch (err) {
      logger.warn({ err }, `Curated provider [${this.id}] failed to persist cache`);
    }
  }

  private async refreshCatalog(): Promise<CuratedItem[]> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const [sitesItems, driveItems] = await Promise.all([
        this.fetchGoogleSitesItems(),
        this.fetchDriveFolderItems()
      ]);
      const items = [...sitesItems, ...driveItems];
      this.catalogCache = { fetchedAt: Date.now(), items };
      this.refreshing = null;
      // Persist for other instances (don't block the caller on the write).
      void this.saveRemoteCache(items);
      return items;
    })();
    return this.refreshing;
  }

  // Resolve the catalog, preferring cheap caches over the expensive crawl:
  //   in-memory (30 min) -> Supabase shared row -> live crawl.
  // When allowCrawl is false (search path) we never pay the crawl in-request; we
  // serve the shared cache and let a catalog request refresh it.
  private async getDynamicCatalog(allowCrawl = true): Promise<CuratedItem[]> {
    const now = Date.now();
    if (this.catalogCache && now - this.catalogCache.fetchedAt < MEM_TTL_MS) {
      return this.catalogCache.items;
    }
    const remote = await this.loadRemoteCache();
    if (remote) {
      this.catalogCache = { fetchedAt: remote.updatedAt, items: remote.items };
      const stale = now - remote.updatedAt > REMOTE_TTL_MS;
      if (stale && allowCrawl) return this.refreshCatalog();
      return remote.items;
    }
    // Nothing cached anywhere.
    if (allowCrawl) return this.refreshCatalog();
    // Search with an empty cache: trigger a warm without blocking on it.
    void this.refreshCatalog().catch(() => { this.refreshing = null; });
    return this.catalogCache?.items || [];
  }

  // Non-blocking: return whatever is cached now (serving stale is fine) and warm
  // in the background. Avoids the whole catalog timing out on the Drive crawl.
  private cachedOrWarm(): CuratedItem[] {
    if (!this.catalogCache) {
      void this.refreshCatalog().catch(() => { this.refreshing = null; });
      return [];
    }
    if (Date.now() - this.catalogCache.fetchedAt >= 1000 * 60 * 30) {
      void this.refreshCatalog().catch(() => { this.refreshing = null; });
    }
    return this.catalogCache.items;
  }

  async search(query: string): Promise<SearchResult[]> {
    // Never pay the crawl in the search path (it overruns the search timeout);
    // read the shared cache instead.
    const dynamicItems = await this.getDynamicCatalog(false);
    const allItems = [...STATIC_ITEMS, ...dynamicItems];
    return allItems
      .filter(item => matchesQuery(query, item))
      .map(item => this.toSearchResult(item));
  }

  async getDetails(id: string): Promise<MangaDetails> {
    const item = this.findItem(id, this.cachedOrWarm());
    if (item) return this.toDetails(item);
    // Cold-instance fallback for a Drive item: return an empty title so the UI
    // keeps the title it already has from the search result.
    if (/^drive-[A-Za-z0-9_-]{20,}$/.test(id)) {
      return { id, title: "", providerId: this.id };
    }
    return { id, title: id, providerId: this.id };
  }

  async getChapters(id: string): Promise<Chapter[]> {
    // A Drive item is always a single PDF; synthesize its chapter straight from
    // the id so it opens even when the catalog cache is cold.
    const driveMatch = id.match(/^drive-([A-Za-z0-9_-]{20,})$/);
    if (driveMatch) {
      return [{ id: `ch-${driveMatch[1]}`, chapterNum: "1", title: "Capítulo único", language: "pt", providerId: this.id }];
    }
    const item = this.findItem(id, this.cachedOrWarm());
    if (!item) return [];
    return item.chapters.map(ch => ({
      id: ch.id,
      chapterNum: ch.chapterNum,
      title: ch.title,
      language: "pt",
      providerId: this.id
    }));
  }

  async getPages(chapterId: string): Promise<Page[]> {
    // Drive PDF chapters resolve straight from the id — no catalog needed.
    const driveMatch = chapterId.match(/^ch-([A-Za-z0-9_-]{20,})$/);
    if (driveMatch) {
      return [{ url: `pdf:https://drive.google.com/file/d/${driveMatch[1]}/preview`, pageNumber: 1 }];
    }
    const dynamicItems = this.cachedOrWarm();
    const allItems = [...STATIC_ITEMS, ...dynamicItems];
    for (const item of allItems) {
      const chapter = item.chapters.find(ch => ch.id === chapterId);
      if (!chapter) continue;
      if (chapter.readerKind === "external") {
        return [{ url: `external:${chapter.readerUrl}`, pageNumber: 1 }];
      }
      if (chapter.readerKind === "pdf") {
        // Rendered client-side with pdf.js (page-by-page, resumable).
        return [{ url: `pdf:${chapter.readerUrl}`, pageNumber: 1 }];
      }
      return [{ url: `${EMBED_PREFIX}${chapter.readerUrl}`, pageNumber: 1 }];
    }
    return [];
  }

  async getCatalog(listType: "popular" | "latest"): Promise<SearchResult[]> {
    // Block on the crawl so the library reliably shows. Serverless instances do
    // not share the in-memory cache and background warming does not run after the
    // response, so a non-blocking read returns near-empty on cold instances.
    const dynamicItems = await this.getDynamicCatalog();
    const allItems = [...STATIC_ITEMS, ...dynamicItems];
    const sorted = listType === "latest"
      ? [...allItems].reverse()
      : allItems;
    // Surface a large slice of the library so the Explore catalog can build rich
    // rows from it (the full set is still browsable via search).
    return sorted.slice(0, 400).map(item => this.toSearchResult(item));
  }

  // Full catalog with no slice — used by the admin catalog browser so the whole
  // curated library (static + Drive/Sites) can be listed and managed.
  async getAllItems(): Promise<SearchResult[]> {
    const dynamicItems = await this.getDynamicCatalog();
    return [...STATIC_ITEMS, ...dynamicItems].map(item => this.toSearchResult(item));
  }
}
