import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

export class ComicExtraProvider implements Provider {
  id = "comicextra";
  name = "ComicExtra";
  language = "en";

  private headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };

  async search(query: string): Promise<SearchResult[]> {
    try {
      const url = `https://www.comicextra.me/search?keyword=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) throw new Error(`ComicExtra search returned ${res.status}`);
      const html = await res.text();

      const results: SearchResult[] = [];
      const regex = /<h3><a href="([^"]+)">([^<]+)<\/a><\/h3>[\s\S]*?<img src="([^"]+)"/g;
      let match;

      while ((match = regex.exec(html)) !== null && results.length < 10) {
        const comicUrl = match[1];
        const title = match[2].trim();
        const comicId = comicUrl.split("/").pop() || "";
        if (!comicId) continue;

        results.push({
          id: comicId,
          title,
          description: "HQ importada de ComicExtra.",
          coverUrl: match[3],
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
      const url = `https://www.comicextra.me/comic/${id}`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) throw new Error(`ComicExtra details returned ${res.status}`);
      const html = await res.text();

      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const coverMatch = html.match(/<img[^>]+class="[^"]*chapter_img[^"]*"[^>]+src="([^"]+)"/i) ||
        html.match(/<div[^>]+class="[^"]*comic_detail[^"]*"[\s\S]*?<img[^>]+src="([^"]+)"/i);
      const descMatch = html.match(/<p[^>]*class="[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/p>/i);

      return {
        id,
        title: titleMatch ? titleMatch[1].trim() : id.replace(/-/g, " ").toUpperCase(),
        description: descMatch ? descMatch[1].replace(/<[^>]*>/g, "").trim() : "HQ importada de ComicExtra.",
        coverUrl: coverMatch?.[1],
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
      const url = `https://www.comicextra.me/comic/${id}`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) throw new Error(`ComicExtra chapters returned ${res.status}`);
      const html = await res.text();

      const chapters: Chapter[] = [];
      const regex = /<a href="([^"]+\/chapter-([^"]+))">([^<]+)<\/a>/g;
      let match;

      while ((match = regex.exec(html)) !== null) {
        const chapterUrl = match[1];
        const relativeId = chapterUrl.split("comicextra.me/").pop() || chapterUrl.split("/comic/").pop() || "";
        if (!relativeId) continue;

        chapters.push({
          id: relativeId.replace(/^comic\//, ""),
          chapterNum: match[2],
          title: match[3].trim(),
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
      const url = `https://www.comicextra.me/${chapterId}/full`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) throw new Error(`ComicExtra pages returned ${res.status}`);
      const html = await res.text();

      const pages: Page[] = [];
      const regex = /<img[^>]+class="chapter_img"[^>]+src="([^"]+)"/g;
      let match;

      while ((match = regex.exec(html)) !== null) {
        pages.push({
          url: match[1],
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
