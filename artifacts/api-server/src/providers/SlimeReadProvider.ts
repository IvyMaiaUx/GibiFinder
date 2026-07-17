import { Chapter, MangaDetails, Page, Provider, SearchResult } from "./types";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
};

type SlimeSpotlight = {
  slug?: string;
  title?: string;
  synopsis?: string;
  cover?: string;
  banner?: string;
  genres?: string[];
  tags?: string[];
  isAdult?: boolean;
  adult?: boolean;
};

export class SlimeReadProvider implements Provider {
  constructor(
    public id: string,
    public name: string,
    public language: string,
    public baseUrl: string
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
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  private stripHtml(value = ""): string {
    return this.decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
  }

  private normalizeText(value = ""): string {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  private isAdultText(value = ""): boolean {
    const text = this.normalizeText(value);
    return [
      "adult",
      "afrodisiaco",
      "censura",
      "ecchi",
      "hentai",
      "incesto",
      "irma",
      "madrasta",
      "milf",
      "nsfw",
      "pet sexual",
      "sexo",
      "sogro"
    ].some(term => text.includes(this.normalizeText(term)));
  }

  private resolveUrl(value?: string): string | undefined {
    if (!value) return undefined;
    const cleaned = this.decodeHtml(value.trim()).replace(/\\\//g, "/");
    if (!cleaned || cleaned.startsWith("data:")) return undefined;
    try {
      return new URL(cleaned, this.baseUrl).toString();
    } catch {
      return undefined;
    }
  }

  private slugFromId(id: string): string {
    return id.replace(/^\/?manga\//, "").replace(/\/+$/g, "");
  }

  private async fetchHtml(pathOrUrl: string): Promise<string> {
    const url = this.resolveUrl(pathOrUrl) || pathOrUrl;
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) throw new Error(`SlimeRead returned ${res.status}`);
    return await res.text();
  }

  private extractSpotlight(html: string): SearchResult[] {
    const script = html.match(/<script[^>]+id=["']heroSpotlightData["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (!script) return [];
    try {
      const items = JSON.parse(this.decodeHtml(script)) as SlimeSpotlight[];
      return items
        .filter(item => item.slug && item.title)
        .map(item => {
          const genres = [...(item.genres || []), ...(item.tags || [])].filter(Boolean);
          const adult = item.isAdult || item.adult || this.isAdultText(`${item.title} ${genres.join(" ")}`);
          return {
            id: item.slug || "",
            title: item.title || "",
            description: item.synopsis || `Disponivel no portal ${this.name}.`,
            coverUrl: this.resolveUrl(item.cover || item.banner),
            providerId: this.id,
            genres: adult ? Array.from(new Set([...genres, "Hentai"])) : genres
          };
        });
    } catch {
      return [];
    }
  }

  private extractMangaLinks(html: string): SearchResult[] {
    const results = new Map<string, SearchResult>();
    const linkRegex = /<a[^>]+href=["'](\/manga\/[^"']+)["'][^>]*([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(linkRegex)) {
      const href = match[1];
      if (/\/chapter\//i.test(href)) continue;
      const block = match[0] + match[2];
      const slug = this.slugFromId(href);
      const ariaTitle = block.match(/aria-label=["']Abrir\s+([^"']+)["']/i)?.[1];
      const altTitle = block.match(/<img[^>]+alt=["']([^"']+)["']/i)?.[1];
      const headingTitle = block.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1];
      const title = this.decodeHtml((ariaTitle || altTitle || headingTitle || slug.replace(/-/g, " ")).replace(/^Abrir\s+/i, ""));
      const image = block.match(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/i)?.[1];
      if (!slug || !title || results.has(slug)) continue;
      const adult = this.isAdultText(title);
      results.set(slug, {
        id: slug,
        title,
        description: `Disponivel no portal ${this.name}.`,
        coverUrl: this.resolveUrl(image),
        providerId: this.id,
        genres: adult ? ["Hentai"] : undefined
      });
    }
    return Array.from(results.values());
  }

  private titleMatchesQuery(title: string, query: string): boolean {
    const terms = this.normalizeText(query)
      .split(/[^a-z0-9]+/i)
      .map(term => term.trim())
      .filter(term => term.length > 2);
    if (terms.length === 0) return true;
    const normalizedTitle = this.normalizeText(title);
    return terms.every(term => normalizedTitle.includes(term));
  }

  async search(query: string, nsfw?: boolean): Promise<SearchResult[]> {
    try {
      const html = await this.fetchHtml("/");
      const allResults = [...this.extractSpotlight(html), ...this.extractMangaLinks(html)];
      const unique = new Map<string, SearchResult>();
      for (const result of allResults) {
        if (!unique.has(result.id)) unique.set(result.id, result);
      }
      return Array.from(unique.values())
        .filter(result => this.titleMatchesQuery(result.title, query))
        .filter(result => nsfw || !(result.genres || []).some(genre => this.isAdultText(genre)))
        .slice(0, 24);
    } catch (err) {
      console.error(`SlimeReadProvider [${this.id}] search failed:`, err);
      return [];
    }
  }

  async getDetails(id: string): Promise<MangaDetails> {
    try {
      const slug = this.slugFromId(id);
      const html = await this.fetchHtml(`/manga/${slug}`);
      const title = this.stripHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || slug.replace(/-/g, " "));
      const description = this.decodeHtml(
        html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        `Disponivel no portal ${this.name}.`
      );
      const cover = this.resolveUrl(html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]);
      const genres = this.isAdultText(`${title} ${description}`) ? ["Hentai"] : [];
      return { id: slug, title, description, coverUrl: cover, providerId: this.id, genres };
    } catch {
      return { id, title: this.slugFromId(id).replace(/-/g, " "), providerId: this.id };
    }
  }

  async getChapters(id: string): Promise<Chapter[]> {
    try {
      const slug = this.slugFromId(id);
      const html = await this.fetchHtml(`/manga/${slug}`);
      const seen = new Set<string>();
      const chapters: Chapter[] = [];
      for (const match of html.matchAll(/href=["'](\/manga\/[^"']+\/chapter\/([^"']+))["']/gi)) {
        const href = match[1];
        const chapterNum = this.decodeHtml(match[2]);
        const chapterId = href.replace(/^\/+/, "");
        if (seen.has(chapterId)) continue;
        seen.add(chapterId);
        chapters.push({
          id: chapterId,
          chapterNum,
          title: `Capitulo ${chapterNum}`,
          language: this.language,
          providerId: this.id
        });
      }
      return chapters.sort((a, b) => Number(a.chapterNum) - Number(b.chapterNum));
    } catch (err) {
      console.error(`SlimeReadProvider [${this.id}] chapters failed:`, err);
      return [];
    }
  }

  async getPages(chapterId: string): Promise<Page[]> {
    try {
      const html = await this.fetchHtml(`/${chapterId.replace(/^\/+/, "")}`);
      const urls = new Set<string>();
      for (const match of html.matchAll(/<img[^>]+(?:data-src|src)=["']([^"']+\.(?:webp|jpe?g|png)(?:\?[^"']*)?)["']/gi)) {
        const url = this.resolveUrl(match[1]);
        if (!url) continue;
        const lower = url.toLowerCase();
        if (!lower.includes("/uploads/chapters/")) continue;
        urls.add(url);
      }
      return Array.from(urls).map((url, index) => ({ url, pageNumber: index + 1 }));
    } catch (err) {
      console.error(`SlimeReadProvider [${this.id}] pages failed:`, err);
      return [];
    }
  }

  async getCatalog(listType: "popular" | "latest", nsfw?: boolean): Promise<SearchResult[]> {
    const html = await this.fetchHtml(listType === "latest" ? "/atualizacoes" : "/populares").catch(() => this.fetchHtml("/"));
    const results = [...this.extractSpotlight(html), ...this.extractMangaLinks(html)];
    const unique = Array.from(new Map(results.map(result => [result.id, result])).values());
    return unique
      .filter(result => nsfw || !(result.genres || []).some(genre => this.isAdultText(genre)))
      .slice(0, 24);
  }
}
