import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

export class NHentaiProvider implements Provider {
  id = "nhentai";
  name = "nHentai";
  language = "multi";

  private baseUrl = "https://nhentai.to/";

  private decodeHtml(value: string): string {
    return value
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#8211;/g, "-")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  private ext(type: string): string {
    if (type === "p") return "png";
    if (type === "g") return "gif";
    if (type === "w") return "webp";
    return "jpg";
  }

  private normalizePages(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      return Object.entries(value)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, page]) => page);
    }
    return [];
  }

  private parseGalleryData(html: string): any | null {
    const match = html.match(/var gallery = new N\.gallery\(([\s\S]*?"num_pages"\s*:\s*\d+\s*,?\s*})\s*\);/i);
    if (!match) return null;

    const json = match[1].replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(json);
  }

  private resolveUrl(value: string): string {
    return new URL(this.decodeHtml(value), this.baseUrl).toString();
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) throw new Error(`nHentai request failed: ${res.status}`);
    return res.text();
  }

  private parseGalleryCards(html: string): SearchResult[] {
    const results: SearchResult[] = [];
    const seen = new Set<string>();
    const blocks = html.match(/<div[^>]+class=["'][^"']*gallery[^"']*["'][\s\S]*?<\/a>\s*<\/div>/gi) || [];

    for (const block of blocks) {
      const idMatch = block.match(/href=["']\/g\/(\d+)\/?["']/i);
      if (!idMatch || seen.has(idMatch[1])) continue;

      const titleMatch = block.match(/<div[^>]+class=["'][^"']*caption[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
        block.match(/<img[^>]+alt=["']([^"']+)["']/i);
      const coverMatch = block.match(/<img[^>]+(?:data-src|data-original|data-lazy-src)=["']([^"']+)["']/i) ||
        block.match(/<img[^>]+src=["']([^"']+)["']/i);
      const title = this.decodeHtml((titleMatch?.[1] || `nHentai #${idMatch[1]}`).replace(/<[^>]*>/g, ""));

      seen.add(idMatch[1]);
      results.push({
        id: idMatch[1],
        title,
        description: `Disponivel no ${this.name}.`,
        coverUrl: coverMatch && !coverMatch[1].startsWith("data:") ? this.resolveUrl(coverMatch[1]) : undefined,
        providerId: this.id,
        genres: ["Hentai", "Doujinshi"]
      });
    }

    return results;
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const url = new URL("search/", this.baseUrl);
      url.searchParams.set("q", query);
      const html = await this.fetchHtml(url.toString());
      return this.parseGalleryCards(html);
    } catch (err) {
      console.error("nHentai search failed:", err);
      return [];
    }
  }

  async getDetails(id: string): Promise<MangaDetails> {
    try {
      const html = await this.fetchHtml(new URL(`g/${id}/`, this.baseUrl).toString());
      const data = this.parseGalleryData(html);
      const title = data?.title?.english || data?.title?.pretty || data?.title?.japanese || `nHentai #${id}`;
      const mediaId = data?.media_id;
      const pages = this.normalizePages(data?.images?.pages);
      const coverType = data?.images?.cover?.t || pages[0]?.t || "j";
      const coverUrl = mediaId ? `https://zrocdn.xyz/galleries/${mediaId}/cover.${this.ext(coverType)}` : undefined;
      const tags = Array.isArray(data?.tags)
        ? data.tags.map((tag: any) => tag?.name).filter(Boolean)
        : ["Hentai", "Doujinshi"];

      return {
        id,
        title,
        description: `Disponivel no ${this.name}.`,
        coverUrl,
        providerId: this.id,
        genres: tags
      };
    } catch (err) {
      console.error("nHentai details failed:", err);
      return {
        id,
        title: `nHentai #${id}`,
        description: `Disponivel no ${this.name}.`,
        providerId: this.id,
        genres: ["Hentai", "Doujinshi"]
      };
    }
  }

  async getChapters(id: string): Promise<Chapter[]> {
    return [{
      id,
      chapterNum: "1",
      title: "Capitulo unico",
      language: "multi",
      providerId: this.id
    }];
  }

  async getPages(chapterId: string): Promise<Page[]> {
    try {
      const html = await this.fetchHtml(new URL(`g/${chapterId}/`, this.baseUrl).toString());
      const data = this.parseGalleryData(html);
      if (!data) throw new Error("Could not find nHentai gallery data.");
      const mediaId = data?.media_id;
      const pages = this.normalizePages(data?.images?.pages);
      if (!mediaId || pages.length === 0) return [];

      return pages.map((page: any, index: number) => ({
        url: `https://zrocdn.xyz/galleries/${mediaId}/${index + 1}.${this.ext(page?.t || "j")}`,
        pageNumber: index + 1
      }));
    } catch (err) {
      console.error("nHentai pages failed:", err);
      return [];
    }
  }

  async getCatalog(listType: "popular" | "latest"): Promise<SearchResult[]> {
    try {
      const path = listType === "popular" ? "popular" : "language/english/";
      const html = await this.fetchHtml(new URL(path, this.baseUrl).toString());
      return this.parseGalleryCards(html);
    } catch (err) {
      console.error("nHentai catalog failed:", err);
      return [];
    }
  }
}
