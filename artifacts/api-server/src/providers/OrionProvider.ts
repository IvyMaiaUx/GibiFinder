import { Chapter, MangaDetails, Page, Provider, SearchResult } from "./types";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
};

type OrionSeries = {
  id: number;
  title: string;
  slug: string;
  coverPath?: string;
  type?: string;
  status?: string;
  viewsTotal?: number;
  chaptersCount?: number;
};

type OrionSearchResponse = {
  series?: OrionSeries[];
};

export class OrionProvider implements Provider {
  constructor(
    public id: string,
    public name: string,
    public language: string,
    public baseUrl: string
  ) {
    this.baseUrl = this.baseUrl.replace(/\/+$/, "");
  }

  private api(path: string) {
    return `${this.baseUrl}/api/${path.replace(/^\/+/, "")}`;
  }

  private abs(pathOrUrl?: string) {
    if (!pathOrUrl) return undefined;
    try {
      return new URL(pathOrUrl, this.baseUrl).toString();
    } catch {
      return undefined;
    }
  }

  private decodeHtml(value = "") {
    return value
      .replace(/\\u0026/g, "&")
      .replace(/&amp;/g, "&")
      .replace(/&#038;/g, "&")
      .replace(/&quot;/g, "\"")
      .replace(/&#039;/g, "'")
      .replace(/&#8211;|&#8212;/g, "-")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  private stripHtml(value = "") {
    return this.decodeHtml(
      value
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    );
  }

  private coverUrl(series: OrionSeries) {
    if (!series.coverPath) return undefined;
    return this.abs(series.coverPath.startsWith("http") ? series.coverPath : `/api/img/${series.coverPath}`);
  }

  private toSearchResult(series: OrionSeries): SearchResult {
    return {
      id: series.slug,
      title: series.title,
      description: [
        series.type,
        series.status,
        series.chaptersCount ? `${series.chaptersCount} capitulos` : undefined
      ].filter(Boolean).join(" - "),
      coverUrl: this.coverUrl(series),
      providerId: this.id
    };
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) throw new Error(`Orion API returned ${res.status}`);
    return await res.json() as T;
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) throw new Error(`Orion page returned ${res.status}`);
    return await res.text();
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const url = this.api(`obras?page=1&limit=40&q=${encodeURIComponent(query)}`);
      const data = await this.fetchJson<OrionSearchResponse>(url);
      return (data.series || []).map(series => this.toSearchResult(series));
    } catch (err) {
      console.warn(`Orion provider [${this.id}] search failed:`, err);
      return [];
    }
  }

  async getDetails(id: string): Promise<MangaDetails> {
    const slug = id.replace(/^title:/, "");
    try {
      const html = await this.fetchHtml(`${this.baseUrl}/title/${encodeURIComponent(slug)}`);
      const title = this.decodeHtml(
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ||
        slug.replace(/-/g, " ")
      ).replace(/\s*\|\s*.*$/, "");
      const description = this.decodeHtml(
        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        ""
      );
      const rawCover = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
      let normalizedCover = rawCover;
      if (rawCover) {
        try {
          const parsedCover = new URL(rawCover, this.baseUrl);
          if (parsedCover.pathname.startsWith("/covers/")) {
            normalizedCover = `/api/img${parsedCover.pathname}`;
          }
        } catch {
          normalizedCover = rawCover.startsWith("/covers/") ? `/api/img${rawCover}` : rawCover;
        }
      }
      const coverUrl = this.abs(normalizedCover || `/api/img/covers/${slug}.webp`);

      return {
        id: slug,
        title,
        description,
        coverUrl,
        status: this.stripHtml(html.match(/Status<\/[^>]+>[\s\S]{0,200}?<[^>]+>([^<]+)/i)?.[1] || ""),
        providerId: this.id
      };
    } catch {
      return {
        id: slug,
        title: slug.replace(/-/g, " "),
        providerId: this.id
      };
    }
  }

  async getChapters(id: string): Promise<Chapter[]> {
    const slug = id.replace(/^title:/, "");
    try {
      const html = await this.fetchHtml(`${this.baseUrl}/title/${encodeURIComponent(slug)}`);
      const chapters = new Map<string, Chapter>();
      const safeSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      for (const match of html.matchAll(new RegExp(`/view/${safeSlug}/(ch-\\d+(?:\\.\\d+)?)`, "gi"))) {
        const chapterSlug = match[1].toLowerCase();
        const num = chapterSlug.replace(/^ch-/, "");
        chapters.set(chapterSlug, {
          id: `${slug}/${chapterSlug}`,
          chapterNum: num,
          title: `Capitulo ${num}`,
          language: this.language,
          providerId: this.id
        });
      }

      return Array.from(chapters.values()).sort((a, b) => Number(a.chapterNum) - Number(b.chapterNum));
    } catch (err) {
      console.warn(`Orion provider [${this.id}] chapters failed:`, err);
      return [];
    }
  }

  async getPages(chapterId: string): Promise<Page[]> {
    try {
      const [slug, chapterSlug] = chapterId.split("/");
      if (!slug || !chapterSlug) return [];
      const html = await this.fetchHtml(`${this.baseUrl}/view/${encodeURIComponent(slug)}/${encodeURIComponent(chapterSlug)}`);
      const seen = new Set<string>();
      const urls: string[] = [];

      for (const match of html.matchAll(/https:\/\/cdn\.orionmanhuas\.com\/chapters\/[^"' <]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"' <]*)?/gi)) {
        const url = this.decodeHtml(match[0]).replace(/[\\;]+$/g, "");
        if (seen.has(url)) continue;
        seen.add(url);
        urls.push(url);
      }

      return urls.map((url, index) => ({ url, pageNumber: index + 1 }));
    } catch (err) {
      console.warn(`Orion provider [${this.id}] pages failed:`, err);
      return [];
    }
  }

  async getCatalog(listType: "popular" | "latest"): Promise<SearchResult[]> {
    try {
      const sort = listType === "latest" ? "recent" : "popular";
      const all: SearchResult[] = [];
      const seen = new Set<string>();
      const MAX_PAGES = 5;
      // Paginate so the Explore catalog surfaces a good chunk of the library,
      // not just the first 30.
      for (let page = 1; page <= MAX_PAGES; page++) {
        const data = await this.fetchJson<OrionSearchResponse>(this.api(`obras?page=${page}&limit=30&sort=${sort}`));
        const series = data.series || [];
        if (series.length === 0) break;
        for (const s of series) {
          const r = this.toSearchResult(s);
          if (!seen.has(r.id)) { seen.add(r.id); all.push(r); }
        }
        if (series.length < 30) break;
      }
      return all;
    } catch (err) {
      console.warn(`Orion provider [${this.id}] catalog failed:`, err);
      return [];
    }
  }
}
