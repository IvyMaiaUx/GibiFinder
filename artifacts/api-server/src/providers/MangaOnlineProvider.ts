import { Chapter, MangaDetails, Page, Provider, SearchResult } from "./types";
import { logger } from "../lib/logger";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
};

export class MangaOnlineProvider implements Provider {
  constructor(
    public id = "mangaonline",
    public name = "Manga Online",
    public language = "pt",
    public baseUrl = "https://mangaonline.love"
  ) {
    this.baseUrl = this.baseUrl.replace(/\/+$/, "");
  }

  private decodeHtml(value = ""): string {
    return value
      .replace(/&amp;/g, "&")
      .replace(/&#038;/g, "&")
      .replace(/&quot;/g, "\"")
      .replace(/&#34;/g, "\"")
      .replace(/&#039;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&#8211;/g, "-")
      .replace(/&#8212;/g, "-")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  private cleanSlug(slugOrUrl: string): string {
    return slugOrUrl
      .replace(/^https?:\/\/[^/]+\/manga\//i, "")
      .replace(/^https?:\/\/[^/]+\/capitulo\//i, "")
      .replace(/^\/?manga\//i, "")
      .replace(/^\/?capitulo\//i, "")
      .replace(/\/+$/g, "");
  }

  async search(query: string, _nsfw?: boolean): Promise<SearchResult[]> {
    try {
      const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) throw new Error(`Search failed with ${res.status}`);
      const html = await res.text();

      const results: SearchResult[] = [];
      const cardRegex = /<div class="manga-card">([\s\S]*?)<\/div>\s*<\/div>/gi;
      let match;

      while ((match = cardRegex.exec(html)) !== null) {
        const cardHtml = match[1];
        const linkMatch = cardHtml.match(/href="https:\/\/mangaonline\.love\/manga\/([^"/]+)\/?"/i);
        if (!linkMatch) continue;
        const slug = linkMatch[1];

        const titleMatch = cardHtml.match(/<h3 class="manga-card-title">([\s\S]*?)<\/h3>/i);
        const title = titleMatch ? this.decodeHtml(titleMatch[1].trim()) : slug.replace(/-/g, " ");

        const coverMatch = cardHtml.match(/src="([^"]+)"/i);
        const coverUrl = coverMatch ? coverMatch[1] : undefined;

        results.push({
          id: slug,
          title,
          coverUrl,
          providerId: this.id,
          description: `Disponível no portal ${this.name}.`
        });
      }

      return results;
    } catch (err) {
      logger.error({ err }, `MangaOnlineProvider [${this.id}] search failed:`);
      return [];
    }
  }

  async getDetails(id: string): Promise<MangaDetails> {
    try {
      const slug = this.cleanSlug(id);
      const url = `${this.baseUrl}/manga/${slug}/`;
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) throw new Error(`Details failed with ${res.status}`);
      const html = await res.text();

      const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const cleanTitle = titleMatch ? this.decodeHtml(titleMatch[1].replace(/<[^>]+>/g, "").trim()) : slug.replace(/-/g, " ");

      const coverMatch = html.match(/<img[^>]+class="[^"]*(?:poster|cover|thumb|wp-post-image)[^"]*"[^>]+(?:src|data-src)="([^"]+)"/i)
        || html.match(/<div[^>]+class="[^"]*(?:poster|cover|thumb)[^"]*"[^>]*>[\s\S]*?<img[^>]+(?:src|data-src)="([^"]+)"/i);
      const coverUrl = coverMatch ? coverMatch[1] : undefined;

      const synopsisMatch = html.match(/<div[^>]+class="[^"]*(?:synopsis|sinopse|description|resumo)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const description = synopsisMatch ? this.decodeHtml(synopsisMatch[1].replace(/<[^>]+>/g, "").trim()) : `Disponível no portal ${this.name}.`;

      return {
        id: slug,
        title: cleanTitle,
        description,
        coverUrl,
        providerId: this.id
      };
    } catch (err) {
      logger.error({ err }, `MangaOnlineProvider [${this.id}] getDetails failed:`);
      const slug = this.cleanSlug(id);
      return { id: slug, title: slug.replace(/-/g, " "), providerId: this.id };
    }
  }

  async getChapters(id: string): Promise<Chapter[]> {
    try {
      const slug = this.cleanSlug(id);
      const url = `${this.baseUrl}/manga/${slug}/`;
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) throw new Error(`Chapters failed with ${res.status}`);
      const html = await res.text();

      const chapters: Chapter[] = [];
      const seen = new Set<string>();
      const chRegex = /href="https:\/\/mangaonline\.love\/capitulo\/([^"/]+)\/?"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;

      while ((match = chRegex.exec(html)) !== null) {
        const chSlug = match[1];
        if (seen.has(chSlug)) continue;

        const rawTitle = match[2].replace(/<[^>]+>/g, "").trim();
        const numMatch = chSlug.match(/capitulo-([0-9]+(?:[\.-][0-9]+)?)/i) || rawTitle.match(/(?:cap[íi]tulo|cap\.?)\s*([0-9]+(?:[\.-][0-9]+)?)/i);
        const chapterNum = numMatch ? numMatch[1].replace("-", ".") : "1";

        seen.add(chSlug);
        chapters.push({
          id: chSlug,
          chapterNum,
          title: rawTitle && !rawTitle.toLowerCase().includes("iniciar leitura") && rawTitle.toLowerCase() !== "ler" 
            ? this.decodeHtml(rawTitle) 
            : `Capítulo ${chapterNum}`,
          language: this.language,
          providerId: this.id
        });
      }

      return chapters.sort((a, b) => {
        const na = parseFloat(a.chapterNum);
        const nb = parseFloat(b.chapterNum);
        if (isNaN(na) || isNaN(nb)) return a.id.localeCompare(b.id);
        return na - nb;
      });
    } catch (err) {
      logger.error({ err }, `MangaOnlineProvider [${this.id}] getChapters failed:`);
      return [];
    }
  }

  async getPages(chapterId: string): Promise<Page[]> {
    try {
      const slug = this.cleanSlug(chapterId);
      const url = `${this.baseUrl}/capitulo/${slug}/`;
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) throw new Error(`Pages failed with ${res.status}`);
      const html = await res.text();

      const pages: Page[] = [];
      const imgMatches = Array.from(html.matchAll(/<img[^>]+(?:src|data-src)="([^"]+)"[^>]*>/gi));
      const seen = new Set<string>();

      for (const m of imgMatches) {
        const src = m[1];
        if (!src.includes("slimeread-turbo") && !src.includes("/uploads/")) continue;
        if (src.includes("logo") || src.includes("banner") || src.includes("flagcdn")) continue;
        if (seen.has(src)) continue;
        seen.add(src);
        pages.push({
          url: src,
          pageNumber: pages.length + 1
        });
      }

      return pages;
    } catch (err) {
      logger.error({ err }, `MangaOnlineProvider [${this.id}] getPages failed:`);
      return [];
    }
  }

  async getCatalog(listType: "popular" | "latest" = "popular", _nsfw?: boolean): Promise<SearchResult[]> {
    try {
      const ordem = listType === "latest" ? "recentes" : "popular";
      const url = `${this.baseUrl}/manga/?ordem=${ordem}`;
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) throw new Error(`Catalog failed with ${res.status}`);
      const html = await res.text();

      const results: SearchResult[] = [];
      const cardRegex = /<div class="manga-card">([\s\S]*?)<\/div>\s*<\/div>/gi;
      let match;

      while ((match = cardRegex.exec(html)) !== null) {
        const cardHtml = match[1];
        const linkMatch = cardHtml.match(/href="https:\/\/mangaonline\.love\/manga\/([^"/]+)\/?"/i);
        if (!linkMatch) continue;
        const slug = linkMatch[1];

        const titleMatch = cardHtml.match(/<h3 class="manga-card-title">([\s\S]*?)<\/h3>/i);
        const title = titleMatch ? this.decodeHtml(titleMatch[1].trim()) : slug.replace(/-/g, " ");

        const coverMatch = cardHtml.match(/src="([^"]+)"/i);
        const coverUrl = coverMatch ? coverMatch[1] : undefined;

        results.push({
          id: slug,
          title,
          coverUrl,
          providerId: this.id,
          description: `Disponível no portal ${this.name}.`
        });
      }

      return results;
    } catch (err) {
      logger.error({ err }, `MangaOnlineProvider [${this.id}] getCatalog failed:`);
      return [];
    }
  }
}
