import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";
import { logger } from "../lib/logger";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
};

export class BodinhoYaoiProvider implements Provider {
  constructor(
    public id: string = "bodinho-yaoi",
    public name: string = "Bodinho Yaoi",
    public language: string = "pt",
    public baseUrl: string = "https://bodinhoyaoi.com/"
  ) {
    if (!this.baseUrl.endsWith("/")) {
      this.baseUrl += "/";
    }
  }

  private cleanText(str: string): string {
    return str.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  }

  async search(query: string, _nsfw = true): Promise<SearchResult[]> {
    try {
      const url = `${this.baseUrl}busca?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) return [];

      const html = await res.text();
      const results: SearchResult[] = [];
      const seen = new Set<string>();

      const matchRegex = /<a[^>]+href=["'](\/obras\/([a-zA-Z0-9_-]+))["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match;

      while ((match = matchRegex.exec(html)) !== null) {
        const slug = match[2];
        if (!slug || slug === "biblioteca" || seen.has(slug)) continue;
        seen.add(slug);

        const inner = match[3];
        const imgMatch = inner.match(/<img[^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']*)["']/i) ||
                         inner.match(/<img[^>]+src=["']([^"']+)["']/i);
        const coverUrl = imgMatch ? (imgMatch[1].startsWith("http") ? imgMatch[1] : `${this.baseUrl}${imgMatch[1].replace(/^\//, "")}`) : undefined;

        let title = imgMatch?.[2] || this.cleanText(inner);
        title = title.replace(/(?:Em andamento|Completo|\d+[,\.]\d+)/gi, "").trim();
        if (!title) title = slug.replace(/-/g, " ");

        results.push({
          id: slug,
          title,
          coverUrl,
          providerId: this.id,
          genres: ["Yaoi", "BL", "Manhwa"],
        });
      }

      return results;
    } catch (err) {
      logger.error({ err, query }, "BodinhoYaoi search error");
      return [];
    }
  }

  async getDetails(id: string): Promise<MangaDetails> {
    try {
      const slug = id.replace(/^\/obras\//, "").replace(/\/$/, "");
      const url = `${this.baseUrl}obras/${slug}`;
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) {
        return { id: slug, title: slug, providerId: this.id };
      }

      const html = await res.text();

      const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                         html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const title = titleMatch ? this.cleanText(titleMatch[1]).replace(/ - Bodinho Yaoi|Ler | em PT-BR/gi, "").trim() : slug;

      const coverMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
      const coverUrl = coverMatch ? coverMatch[1] : undefined;

      const descMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                        html.match(/Sinopse:?([\s\S]*?)(?:<div|<h2|<\/p)/i);
      const description = descMatch ? this.cleanText(descMatch[1]).replace(/^Sharpe & Rabbit - Sinopse:\s*/i, "").trim() : undefined;

      const genres: string[] = ["Yaoi", "BL"];
      const genreMatches = html.matchAll(/\/biblioteca\?genero=([^"'>\s]+)/gi);
      for (const gm of genreMatches) {
        const g = decodeURIComponent(gm[1]).replace(/-/g, " ");
        if (!genres.includes(g)) genres.push(g);
      }

      return {
        id: slug,
        title,
        coverUrl,
        description,
        providerId: this.id,
        genres,
      };
    } catch (err) {
      logger.error({ err, id }, "BodinhoYaoi getDetails error");
      return { id, title: id, providerId: this.id };
    }
  }

  async getChapters(id: string): Promise<Chapter[]> {
    try {
      const slug = id.replace(/^\/obras\//, "").replace(/\/$/, "");
      const url = `${this.baseUrl}obras/${slug}`;
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) return [];

      const html = await res.text();
      const chapters: Chapter[] = [];
      const seen = new Set<string>();

      const nextDataMatch = html.match(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/);
      if (nextDataMatch) {
        const rawJson = nextDataMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        const chaptersJsonMatch = rawJson.match(/"chapters":\s*(\[\s*\{[\s\S]*?\}\s*\])/);
        if (chaptersJsonMatch) {
          try {
            const list = JSON.parse(chaptersJsonMatch[1]);
            for (const ch of list) {
              const numStr = String(ch.number);
              if (!seen.has(numStr)) {
                seen.add(numStr);
                chapters.push({
                  id: `${slug}::${numStr}`,
                  chapterNum: numStr,
                  title: ch.title || `Capítulo ${numStr}`,
                  language: "pt",
                  providerId: this.id,
                });
              }
            }
            if (chapters.length > 0) return chapters;
          } catch {
            // fallback
          }
        }
      }

      const linkRegex = new RegExp(`/obras/${slug}/capitulo/(\\d+)`, 'gi');
      let linkMatch;
      while ((linkMatch = linkRegex.exec(html)) !== null) {
        const numStr = linkMatch[1];
        if (!seen.has(numStr)) {
          seen.add(numStr);
          chapters.push({
            id: `${slug}::${numStr}`,
            chapterNum: numStr,
            title: `Capítulo ${numStr}`,
            language: "pt",
            providerId: this.id,
          });
        }
      }

      chapters.sort((a, b) => Number(b.chapterNum) - Number(a.chapterNum));
      return chapters;
    } catch (err) {
      logger.error({ err, id }, "BodinhoYaoi getChapters error");
      return [];
    }
  }

  async getPages(chapterId: string): Promise<Page[]> {
    try {
      let slug = "";
      let chapterNum = "";

      if (chapterId.includes("::")) {
        const parts = chapterId.split("::");
        slug = parts[0];
        chapterNum = parts[1];
      } else if (chapterId.includes("/")) {
        const parts = chapterId.split("/");
        slug = parts[0];
        chapterNum = parts[parts.length - 1];
      } else {
        slug = chapterId;
        chapterNum = "1";
      }

      const url = `${this.baseUrl}obras/${slug}/capitulo/${chapterNum}`;
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) return [];

      const html = await res.text();
      const pages: Page[] = [];

      const nextDataMatch = html.match(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/);
      if (nextDataMatch) {
        const rawJson = nextDataMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        const pagesJsonMatch = rawJson.match(/"pages":\s*(\[\s*\{[\s\S]*?\}\s*\])/);
        if (pagesJsonMatch) {
          try {
            const list = JSON.parse(pagesJsonMatch[1]);
            for (let i = 0; i < list.length; i++) {
              const src = list[i].src || list[i].url;
              if (src) {
                pages.push({
                  url: src,
                  pageNumber: i + 1,
                });
              }
            }
            if (pages.length > 0) return pages;
          } catch {
            // fallback
          }
        }
      }

      const mediaRegex = new RegExp(`https://media\\.bodinhoyaoi\\.com/${slug}/chapters/${chapterNum}/[^"'>\\s\\]]+`, 'gi');
      const found = new Set<string>();
      let m;
      while ((m = mediaRegex.exec(html)) !== null) {
        let src = m[0].replace(/[\\"',;]+$/, "");
        if (!found.has(src)) {
          found.add(src);
          pages.push({
            url: src,
            pageNumber: pages.length + 1,
          });
        }
      }

      return pages;
    } catch (err) {
      logger.error({ err, chapterId }, "BodinhoYaoi getPages error");
      return [];
    }
  }

  async getCatalog(listType: "popular" | "latest" = "latest", _nsfw = true): Promise<SearchResult[]> {
    try {
      const url = listType === "popular"
        ? `${this.baseUrl}ranking`
        : `${this.baseUrl}biblioteca?order=recent`;
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) return [];

      const html = await res.text();
      const results: SearchResult[] = [];
      const seen = new Set<string>();

      const matchRegex = /<a[^>]+href=["'](\/obras\/([a-zA-Z0-9_-]+))["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match;

      while ((match = matchRegex.exec(html)) !== null) {
        const slug = match[2];
        if (!slug || slug === "biblioteca" || seen.has(slug)) continue;
        seen.add(slug);

        const inner = match[3];
        const imgMatch = inner.match(/<img[^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']*)["']/i) ||
                         inner.match(/<img[^>]+src=["']([^"']+)["']/i);
        const coverUrl = imgMatch ? (imgMatch[1].startsWith("http") ? imgMatch[1] : `${this.baseUrl}${imgMatch[1].replace(/^\//, "")}`) : undefined;

        let title = imgMatch?.[2] || this.cleanText(inner);
        title = title.replace(/(?:Em andamento|Completo|\d+[,\.]\d+)/gi, "").trim();
        if (!title) title = slug.replace(/-/g, " ");

        results.push({
          id: slug,
          title,
          coverUrl,
          providerId: this.id,
          genres: ["Yaoi", "BL", "Manhwa"],
        });
      }

      return results;
    } catch (err) {
      logger.error({ err, listType }, "BodinhoYaoi getCatalog error");
      return [];
    }
  }
}
