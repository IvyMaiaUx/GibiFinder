import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";
import { logger } from "../lib/logger";

interface ArchiveFile {
  name: string;
  format: string;
  size?: string;
}

interface ArchiveMeta {
  server: string;
  dir: string;
  metadata: Record<string, unknown>;
  files: ArchiveFile[];
}

const IA = "https://archive.org";

function coverOf(id: string) {
  return `${IA}/services/img/${id}`;
}

function scalarStr(v: unknown): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? (v[0] as string) : (v as string);
}

function scalarStrArr(v: unknown): string[] | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? (v as string[]) : [v as string];
}

export class InternetArchiveProvider implements Provider {
  id = "internet-archive";
  name = "Internet Archive";
  language = "pt";

  async search(query: string): Promise<SearchResult[]> {
    try {
      const q = `(${query}) AND mediatype:texts AND (subject:(quadrinhos OR gibi OR comics) OR title:(gibi OR cebolinha OR monica OR turma))`;
      const res = await fetch(
        `${IA}/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=description&rows=30&output=json&sort=downloads+desc`
      );
      if (!res.ok) return [];
      const data = await res.json() as { response?: { docs?: Record<string, unknown>[] } };
      return (data.response?.docs ?? []).map(doc => ({
        id: doc.identifier as string,
        title: scalarStr(doc.title) ?? (doc.identifier as string),
        coverUrl: coverOf(doc.identifier as string),
        description: scalarStr(doc.description),
        providerId: this.id,
        genres: ["Internet Archive"],
      }));
    } catch (err) {
      logger.error({ err }, "IA search failed");
      return [];
    }
  }

  async getCatalog(): Promise<SearchResult[]> {
    try {
      const q = `mediatype:texts AND subject:(quadrinhos OR gibi) AND language:(pt OR por)`;
      const res = await fetch(
        `${IA}/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=description&rows=40&output=json&sort=downloads+desc`
      );
      if (!res.ok) return [];
      const data = await res.json() as { response?: { docs?: Record<string, unknown>[] } };
      return (data.response?.docs ?? []).map(doc => ({
        id: doc.identifier as string,
        title: scalarStr(doc.title) ?? (doc.identifier as string),
        coverUrl: coverOf(doc.identifier as string),
        description: scalarStr(doc.description),
        providerId: this.id,
        genres: ["Internet Archive"],
      }));
    } catch (err) {
      logger.error({ err }, "IA catalog failed");
      return [];
    }
  }

  async getDetails(id: string): Promise<MangaDetails> {
    const meta = await this.fetchMeta(id);
    const m = meta.metadata;
    return {
      id,
      title: scalarStr(m.title) ?? id,
      description: scalarStr(m.description),
      coverUrl: coverOf(id),
      authors: scalarStrArr(m.creator),
      providerId: this.id,
      genres: ["Internet Archive"],
    };
  }

  async getChapters(id: string): Promise<Chapter[]> {
    const meta = await this.fetchMeta(id);
    const title = scalarStr(meta.metadata.title) ?? id;
    return [{
      id,
      chapterNum: "1",
      title,
      language: "pt",
      providerId: this.id,
    }];
  }

  async getPages(chapterId: string): Promise<Page[]> {
    const meta = await this.fetchMeta(chapterId);

    // Strategy 1: individual JPEG/PNG files (skip thumbnails and metadata images)
    const imgFiles = meta.files
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f.name) && !/(_thumb\d*|_cover)\.(jpg|jpeg|png)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    if (imgFiles.length > 1) {
      return imgFiles.map((f, i) => ({
        url: `${IA}/download/${chapterId}/${encodeURIComponent(f.name)}`,
        pageNumber: i + 1,
      }));
    }

    // Strategy 2: JP2 files listed individually in metadata (inside _jp2.zip)
    const jp2ZipName = meta.files.find(f => f.name.endsWith("_jp2.zip"))?.name;
    const jp2Files = meta.files
      .filter(f => f.name.endsWith(".jp2"))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    if (jp2ZipName && jp2Files.length > 0) {
      return jp2Files.map((f, i) => ({
        url: `https://${meta.server}/BookReader/BookReaderImages.php?zip=${meta.dir}/${jp2ZipName}&file=${encodeURIComponent(f.name)}&id=${chapterId}&scale=2&rotate=0`,
        pageNumber: i + 1,
      }));
    }

    // Strategy 3: construct JP2 URLs from imagecount metadata field
    const imageCount = parseInt(String(meta.metadata.imagecount ?? "0"), 10);
    if (imageCount > 0 && jp2ZipName) {
      return Array.from({ length: imageCount }, (_, i) => {
        const n = String(i + 1).padStart(4, "0");
        return {
          url: `https://${meta.server}/BookReader/BookReaderImages.php?zip=${meta.dir}/${jp2ZipName}&file=${chapterId}_jp2/${chapterId}_${n}.jp2&id=${chapterId}&scale=2&rotate=0`,
          pageNumber: i + 1,
        };
      });
    }

    return [];
  }

  private async fetchMeta(id: string): Promise<ArchiveMeta> {
    const res = await fetch(`${IA}/metadata/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`IA metadata ${id}: ${res.status}`);
    return res.json() as Promise<ArchiveMeta>;
  }
}
