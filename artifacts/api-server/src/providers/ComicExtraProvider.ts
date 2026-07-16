import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

export class ComicExtraProvider implements Provider {
  id = "comicextra";
  name = "ComicExtra";
  language = "en";
  private baseUrl = "https://www.comicextra.me";

  private headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
  };

  private decodeHtml(value: string): string {
    return value
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, "\"")
      .replace(/&#039;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  private absolutize(url: string): string {
    if (url.startsWith("//")) return `https:${url}`;
    if (url.startsWith("/")) return `${this.baseUrl}${url}`;
    return url;
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`ComicExtra returned ${res.status}`);
    let html = await res.text();

    const redirectMatch = html.match(/window\.location\.replace\(['"]([^'"]+)['"]\)/i);
    if (redirectMatch?.[1]) {
      const redirectUrl = this.absolutize(this.decodeHtml(redirectMatch[1]));
      const redirectRes = await fetch(redirectUrl, { headers: this.headers });
      if (!redirectRes.ok) throw new Error(`ComicExtra redirect returned ${redirectRes.status}`);
      html = await redirectRes.text();
    }

    return html;
  }

  private extractSlug(url: string): string {
    const clean = this.decodeHtml(url).split("?")[0].replace(/\/+$/g, "");
    const comicMatch = clean.match(/\/comic\/([^/]+)/i);
    if (comicMatch?.[1]) return comicMatch[1];
    return clean.split("/").filter(Boolean).pop() || "";
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const url = `${this.baseUrl}/search?keyword=${encodeURIComponent(query)}`;
      const html = await this.fetchHtml(url);

      const results: SearchResult[] = [];
      const regex = /<a[^>]+href=["']([^"']*\/comic\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]{0,800}?<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi;
      let match;
      const seen = new Set<string>();

      while ((match = regex.exec(html)) !== null && results.length < 10) {
        const comicUrl = match[1];
        const comicId = this.extractSlug(comicUrl);
        if (!comicId || seen.has(comicId)) continue;
        seen.add(comicId);

        const rawTitle = match[2].replace(/<[^>]*>/g, "").trim();
        const title = this.decodeHtml(rawTitle || comicId.replace(/-/g, " "));

        results.push({
          id: comicId,
          title,
          description: "HQ importada de ComicExtra.",
          coverUrl: this.absolutize(this.decodeHtml(match[3])),
          providerId: this.id
        });
      }

      return results;
    } catch (err) {
      console.warn("ComicExtra scraper failed:", err);
      return [];
    }
  }

  async getDetails(id: string): Promise<MangaDetails> {
    try {
      const url = `${this.baseUrl}/comic/${id}`;
      const html = await this.fetchHtml(url);

      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const coverMatch = html.match(/<img[^>]+class="[^"]*chapter_img[^"]*"[^>]+src="([^"]+)"/i) ||
        html.match(/<div[^>]+class="[^"]*comic_detail[^"]*"[\s\S]*?<img[^>]+(?:src|data-src)=["']([^"']+)["']/i) ||
        html.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]+(?:alt|title)=["'][^"']*comic/i);
      const descMatch = html.match(/<p[^>]*class="[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/p>/i);

      return {
        id,
        title: titleMatch ? this.decodeHtml(titleMatch[1].trim()) : id.replace(/-/g, " ").toUpperCase(),
        description: descMatch ? descMatch[1].replace(/<[^>]*>/g, "").trim() : "HQ importada de ComicExtra.",
        coverUrl: coverMatch?.[1] ? this.absolutize(this.decodeHtml(coverMatch[1])) : undefined,
        providerId: this.id
      };
    } catch (err) {
      console.warn("ComicExtra details failed:", err);
      return {
        id,
        title: id.replace(/-/g, " ").toUpperCase(),
        description: "ComicExtra did not return details for this title.",
        providerId: this.id
      };
    }
  }

  async getChapters(id: string): Promise<Chapter[]> {
    try {
      const url = `${this.baseUrl}/comic/${id}`;
      const html = await this.fetchHtml(url);

      const chapters: Chapter[] = [];
      const episodeBlock = html.match(/<div[^>]+class=["'][^"']*episode-list[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || html;
      const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      const seen = new Set<string>();

      while ((match = regex.exec(episodeBlock)) !== null) {
        const chapterUrl = this.decodeHtml(match[1]);
        if (!chapterUrl.includes(id) || !/\/issue-|\/chapter-/i.test(chapterUrl)) continue;
        let relativeId = this.absolutize(chapterUrl).split("comicextra.me/").pop() || "";
        relativeId = relativeId.replace(/^comic\//, "").replace(/\/full\/?$/i, "").replace(/^\/+|\/+$/g, "");
        if (!relativeId || seen.has(relativeId)) continue;
        seen.add(relativeId);

        const label = this.decodeHtml(match[2].replace(/<[^>]*>/g, "").trim());
        const numMatch = relativeId.match(/(?:issue|chapter)-([^/]+)/i);
        chapters.push({
          id: relativeId,
          chapterNum: numMatch?.[1] || String(chapters.length + 1),
          title: label || `Issue ${numMatch?.[1] || chapters.length + 1}`,
          language: "en",
          providerId: this.id
        });
      }

      return chapters.reverse();
    } catch (err) {
      console.warn("ComicExtra chapters scraper failed:", err);
      return [];
    }
  }

  async getPages(chapterId: string): Promise<Page[]> {
    try {
      const url = `${this.baseUrl}/${chapterId.replace(/^\/+/, "")}/full`;
      const html = await this.fetchHtml(url);

      const pages: Page[] = [];
      const regex = /https?:\/\/[^"' <>()]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"' <>()]*)?/gi;
      let match;
      const seen = new Set<string>();

      while ((match = regex.exec(html)) !== null) {
        const imageUrl = this.decodeHtml(match[0]);
        if (seen.has(imageUrl)) continue;
        if (/logo|avatar|cover|banner|favicon|ads?|button|icon/i.test(imageUrl)) continue;
        seen.add(imageUrl);

        pages.push({
          url: imageUrl,
          pageNumber: pages.length + 1
        });
      }

      return pages;
    } catch (err) {
      console.warn("ComicExtra pages scraper failed:", err);
      return [];
    }
  }

  async getCatalog(_listType: "popular" | "latest"): Promise<SearchResult[]> {
    return [];
  }
}
