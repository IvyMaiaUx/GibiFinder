import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

type ReaderKind = "embed" | "external";

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
      readerKind: "embed"
    }]
  }
];

const GOOGLE_SITES_URL =
  "https://sites.google.com/educacao.quintana.sp.gov.br/biblioteca-virtual/hist%C3%B3rias-em-quadrinhos";

const DRIVE_FOLDER_ID = "1Etdsik4rGHDhNv5g4_8J_DDTuuvvlunN";

const SHAREPOINT_URL =
  "https://liveuel-my.sharepoint.com/:f:/g/personal/desireebt_1310_live_uel_br/Eg-xTek0aHVGmknAwok3WNsBn5MY46O7QX862ZwlntLPJg?e=NTwbC6";

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

function cleanTitle(fileName: string): string {
  return decodeHtml(fileName)
    .replace(/\.(?:pdf|cbr|cbz)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
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
            readerKind: "embed" as const
          }]
        };
      });
    } catch (err) {
      console.warn(`Curated provider [${this.id}] Google Sites fetch failed:`, err);
      return [];
    }
  }

  private async fetchDriveFolderItems(): Promise<CuratedItem[]> {
    const driveApiKey = process.env["GOOGLE_DRIVE_API_KEY"];
    if (!driveApiKey) return [];

    const items: CuratedItem[] = [];
    const seenFiles = new Set<string>();
    const seenFolders = new Set<string>([DRIVE_FOLDER_ID]);
    const CONCURRENCY = 8;
    // We only read file metadata (id/name), never download PDFs, so a large
    // library is cheap to crawl — the caps just bound worst-case fan-out.
    const MAX_ITEMS = 2500;
    const MAX_FOLDERS = 400;
    let foldersVisited = 0;

    // List one folder: append its PDFs to `items`, return its child folder ids.
    const listFolder = async (folderId: string): Promise<string[]> => {
      const childFolders: string[] = [];
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          q: `'${folderId}' in parents and trashed=false and (mimeType='application/pdf' or mimeType='application/vnd.google-apps.folder')`,
          key: driveApiKey,
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
            genres: ["Biblioteca", "Drive"],
            sourceLabel: "Google Drive",
            coverUrl: `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`,
            chapters: [{
              id: `ch-${file.id}`,
              chapterNum: "1",
              title,
              readerUrl: `https://drive.google.com/file/d/${file.id}/preview`,
              readerKind: "embed"
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
      let frontier: string[] = [DRIVE_FOLDER_ID];
      while (frontier.length > 0 && foldersVisited < MAX_FOLDERS && items.length < MAX_ITEMS) {
        const batch = frontier.slice(0, CONCURRENCY);
        frontier = frontier.slice(CONCURRENCY);
        foldersVisited += batch.length;
        const childLists = await Promise.all(batch.map(id => listFolder(id).catch(() => [] as string[])));
        for (const children of childLists) frontier.push(...children);
      }
      return items;
    } catch (err) {
      console.warn(`Curated provider [${this.id}] Drive folder fetch failed:`, err);
      return items;
    }
  }

  private async getDynamicCatalog(force = false): Promise<CuratedItem[]> {
    const now = Date.now();
    if (!force && this.catalogCache && now - this.catalogCache.fetchedAt < 1000 * 60 * 30) {
      return this.catalogCache.items;
    }

    const [sitesItems, driveItems] = await Promise.all([
      this.fetchGoogleSitesItems(),
      this.fetchDriveFolderItems()
    ]);

    // Note: the "open folder" catalog-link cards (Quintana / Drive / SharePoint)
    // were removed from the catalog — they are not readable comics and only
    // confused users. Those links still live in the reader's "Links externos" tab.
    const items = [...sitesItems, ...driveItems];
    this.catalogCache = { fetchedAt: now, items };
    return items;
  }

  async search(query: string): Promise<SearchResult[]> {
    const dynamicItems = await this.getDynamicCatalog();
    const allItems = [...STATIC_ITEMS, ...dynamicItems];
    return allItems
      .filter(item => matchesQuery(query, item))
      .map(item => this.toSearchResult(item));
  }

  async getDetails(id: string): Promise<MangaDetails> {
    const dynamicItems = await this.getDynamicCatalog();
    const item = this.findItem(id, dynamicItems);
    if (!item) {
      return { id, title: id, providerId: this.id };
    }
    return this.toDetails(item);
  }

  async getChapters(id: string): Promise<Chapter[]> {
    const dynamicItems = await this.getDynamicCatalog();
    const item = this.findItem(id, dynamicItems);
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
    const dynamicItems = await this.getDynamicCatalog();
    const allItems = [...STATIC_ITEMS, ...dynamicItems];
    for (const item of allItems) {
      const chapter = item.chapters.find(ch => ch.id === chapterId);
      if (!chapter) continue;
      if (chapter.readerKind === "external") {
        return [{ url: chapter.readerUrl, pageNumber: 1 }];
      }
      return [{ url: `${EMBED_PREFIX}${chapter.readerUrl}`, pageNumber: 1 }];
    }
    return [];
  }

  async getCatalog(listType: "popular" | "latest"): Promise<SearchResult[]> {
    const dynamicItems = await this.getDynamicCatalog();
    const allItems = [...STATIC_ITEMS, ...dynamicItems];
    const sorted = listType === "latest"
      ? [...allItems].reverse()
      : allItems;
    return sorted.slice(0, 40).map(item => this.toSearchResult(item));
  }
}
