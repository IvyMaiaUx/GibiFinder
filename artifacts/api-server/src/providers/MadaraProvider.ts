import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

export class MadaraProvider implements Provider {
  constructor(
    public id: string,
    public name: string,
    public language: string,
    public baseUrl: string
  ) {
    if (!this.baseUrl.endsWith("/")) {
      this.baseUrl += "/";
    }
  }

  private decodeHtml(value: string): string {
    return value
      .replace(/&amp;/g, "&")
      .replace(/&#038;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  private resolveUrl(value: string): string | null {
    const cleaned = this.decodeHtml(value.trim()).replace(/\\\//g, "/");
    if (!cleaned || cleaned.startsWith("data:")) return null;

    try {
      return new URL(cleaned, this.baseUrl).toString();
    } catch {
      return null;
    }
  }

  private toGenericId(url: string): string | null {
    try {
      const parsed = new URL(this.decodeHtml(url), this.baseUrl);
      const path = parsed.pathname.replace(/^\/+|\/+$/g, "");
      if (!path || path.startsWith("categoria/") || path.startsWith("category/") || path.startsWith("tag/")) {
        return null;
      }
      return `post:${path}`;
    } catch {
      return null;
    }
  }

  private isGenericId(id: string): boolean {
    return id.startsWith("post:");
  }

  private getContentUrl(id: string): string {
    if (this.isGenericId(id)) {
      const path = id.replace(/^post:/, "").replace(/^\/+|\/+$/g, "");
      return new URL(`${path}/`, this.baseUrl).toString();
    }
    return `${this.baseUrl}manga/${id}/`;
  }

  private getLanguage(): string {
    return this.language === "multi" ? "pt" : this.language;
  }

  private collectPageUrls(html: string): string[] {
    const urls = new Set<string>();
    const badFragments = [
      "logo",
      "avatar",
      "banner",
      "/ads/",
      "advert",
      "placeholder",
      "loading",
      "favicon",
      "wp-content/plugins",
      "wp-includes"
    ];

    const addCandidate = (raw?: string) => {
      if (!raw) return;
      const resolved = this.resolveUrl(raw);
      if (!resolved) return;
      const lower = resolved.toLowerCase();
      if (badFragments.some(fragment => lower.includes(fragment))) return;
      urls.add(resolved);
    };

    const isLikelyPageImage = (tag: string): boolean => {
      if (/class=["'][^"']*(?:attachment-full|size-full|responsiva|chapter|wp-manga-chapter-img)[^"']*["']/i.test(tag)) {
        return true;
      }

      const width = Number(tag.match(/\swidth=["']?(\d+)/i)?.[1] || 0);
      const height = Number(tag.match(/\sheight=["']?(\d+)/i)?.[1] || 0);
      return width >= 500 && height >= 500 && height >= width * 1.05;
    };

    const readerBlocks = [
      /<div[^>]+class="[^"]*(?:reading-content|entry-content|chapter-content|page-break|wp-manga-chapter-img|pagina-conteudo|post-content|conteudo)[^"]*"[\s\S]*?<\/div>/gi,
      /<figure[\s\S]*?<\/figure>/gi
    ];

    for (const blockRegex of readerBlocks) {
      for (const blockMatch of html.matchAll(blockRegex)) {
        const block = blockMatch[0];
        for (const imgMatch of block.matchAll(/<img[^>]+>/gi)) {
          const tag = imgMatch[0];
          if (!isLikelyPageImage(tag)) continue;
          const attrMatch = tag.match(/\s(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["']/i);
          addCandidate(attrMatch?.[1]);

          const srcsetMatch = tag.match(/\s(?:data-srcset|srcset)=["']([^"']+)["']/i);
          if (srcsetMatch?.[1]) {
            const firstSrc = srcsetMatch[1].split(",")[0]?.trim().split(/\s+/)[0];
            addCandidate(firstSrc);
          }
        }
      }
    }

    for (const imgMatch of html.matchAll(/<img[^>]+>/gi)) {
      const tag = imgMatch[0];
      if (!isLikelyPageImage(tag)) continue;
      const attrMatch = tag.match(/\s(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["']/i);
      addCandidate(attrMatch?.[1]);
    }

    return Array.from(urls)
      .map((url, index) => ({ url, index }))
      .sort((a, b) => {
        const pageA = a.url.match(/(?:^|[^\d])(\d{1,4})(?:\D*)\.(?:webp|jpe?g|png)/i)?.[1];
        const pageB = b.url.match(/(?:^|[^\d])(\d{1,4})(?:\D*)\.(?:webp|jpe?g|png)/i)?.[1];
        if (pageA && pageB) return Number(pageA) - Number(pageB);
        return a.index - b.index;
      })
      .map(item => item.url);
  }

  private parseMadaraSearch(html: string): SearchResult[] {
    const parts = html.split('<div class="row c-tabs-item__content">');
    const results: SearchResult[] = [];

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const urlMatch = part.match(/href="([^"]+?\/manga\/([^\/]+?)\/)"/i);
      if (!urlMatch) continue;
      const slug = urlMatch[2];
      if (slug === "feed") continue;

      const titleMatch = part.match(/class="post-title"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
        part.match(/title="([^"]+)"/i);
      const title = titleMatch ? this.decodeHtml(titleMatch[1].replace(/<[^>]*>/g, "")) : slug.replace(/-/g, " ").toUpperCase();

      const coverMatch = part.match(/<img[^>]+src="([^"]+)"/i) ||
        part.match(/<img[^>]+data-src="([^"]+)"/i);

      results.push({
        id: slug,
        title,
        description: `Disponivel no portal ${this.name}.`,
        coverUrl: coverMatch ? this.resolveUrl(coverMatch[1]) || undefined : undefined,
        providerId: this.id
      });
    }

    return results;
  }

  private parseGenericWordPressSearch(html: string): SearchResult[] {
    const results: SearchResult[] = [];
    const seen = new Set<string>();
    const blocks = html.match(/<li\b[\s\S]*?<\/li>/gi) || html.match(/<article\b[\s\S]*?<\/article>/gi) || [];

    for (const block of blocks) {
      const titleLink = block.match(/<a[^>]+class=["'][^"']*(?:titulo|title|entry-title)[^"']*["'][^>]+href=["']([^"']+)["'][^>]*title=["']([^"']+)["'][\s\S]*?<\/a>/i) ||
        block.match(/<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']+)["'][\s\S]*?<h[1-3][^>]*>/i) ||
        block.match(/<h[1-3][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);

      if (!titleLink) continue;

      const id = this.toGenericId(titleLink[1]);
      if (!id || seen.has(id)) continue;

      const title = this.decodeHtml(titleLink[2].replace(/<[^>]*>/g, ""));
      if (!title) continue;

      const coverMatch = block.match(/<img[^>]+(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["']/i);
      const coverUrl = coverMatch ? this.resolveUrl(coverMatch[1]) || undefined : undefined;

      seen.add(id);
      results.push({
        id,
        title,
        description: `Disponivel no portal ${this.name}.`,
        coverUrl,
        providerId: this.id
      });
    }

    return results;
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const url = `${this.baseUrl}?s=${encodeURIComponent(query)}&post_type=wp-manga`;
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) throw new Error(`Search failed status: ${res.status}`);
      const html = await res.text();

      const madaraResults = this.parseMadaraSearch(html);
      if (madaraResults.length > 0) return madaraResults;
      return this.parseGenericWordPressSearch(html);
    } catch (err) {
      console.error(`MadaraProvider [${this.id}] search failed:`, err);
      return [];
    }
  }

  async getDetails(id: string): Promise<MangaDetails> {
    try {
      const res = await fetch(this.getContentUrl(id), { headers: BROWSER_HEADERS });
      if (!res.ok) throw new Error(`Details status: ${res.status}`);
      const html = await res.text();

      const coverMatch = html.match(/class="wp-post-image"[^>]+src="([^"]+)"/i) ||
        html.match(/class="summary_image"[\s\S]*?<img[^>]+src="([^"]+)"/i) ||
        html.match(/class="tab-summary"[\s\S]*?<img[^>]+src="([^"]+)"/i) ||
        html.match(/<div[^>]+class="[^"]*summary_image[^"]*"[\s\S]*?<img[^>]+src="([^"]+)"/i);
      const genericCoverMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);

      const descMatch = html.match(/class="summary__content"[\s\S]*?<p>([\s\S]*?)<\/p>/i) ||
        html.match(/class="description-summary"[\s\S]*?<p>([\s\S]*?)<\/p>/i) ||
        html.match(/class="manga-excerpt"[\s\S]*?<p>([\s\S]*?)<\/p>/i);
      const genericDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);

      const titleMatch = html.match(/<div[^>]+class="post-title"[\s\S]*?<h1>([\s\S]*?)<\/h1>/i) ||
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
        html.match(/<title>([\s\S]*?)<\/title>/i);

      const genresMatch = html.match(/class="genres-content"[\s\S]*?<\/div>/i);
      const genres: string[] = [];
      if (genresMatch) {
        for (const gt of genresMatch[0].matchAll(/<a[^>]+>([^<]+)<\/a>/gi)) {
          const genre = this.decodeHtml(gt[1]);
          if (genre) genres.push(genre);
        }
      }

      const fallbackTitle = this.isGenericId(id)
        ? id.replace(/^post:/, "").split("/").pop() || id
        : id;

      return {
        id,
        title: this.decodeHtml((titleMatch?.[1] || fallbackTitle.replace(/-/g, " ")).replace(/<[^>]*>/g, "")),
        description: this.decodeHtml((descMatch?.[1] || genericDescMatch?.[1] || `Manga disponivel no portal ${this.name}.`).replace(/<[^>]*>/g, "")),
        coverUrl: coverMatch ? this.resolveUrl(coverMatch[1]) || undefined : (genericCoverMatch ? this.resolveUrl(genericCoverMatch[1]) || undefined : undefined),
        genres,
        providerId: this.id
      };
    } catch (err) {
      console.error(`MadaraProvider [${this.id}] getDetails failed:`, err);
      return {
        id,
        title: id.replace(/^post:/, "").replace(/-/g, " ").toUpperCase(),
        description: `Manga disponivel no portal ${this.name}.`,
        genres: [],
        providerId: this.id
      };
    }
  }

  async getChapters(id: string): Promise<Chapter[]> {
    if (this.isGenericId(id)) {
      return [{
        id,
        chapterNum: "1",
        title: "Capitulo unico",
        language: this.getLanguage(),
        providerId: this.id
      }];
    }

    try {
      const url = `${this.baseUrl}manga/${id}/ajax/chapters/`;
      const res = await fetch(url, { method: "POST", headers: BROWSER_HEADERS });
      if (!res.ok) throw new Error(`Chapters status: ${res.status}`);
      const html = await res.text();

      const chapters: Chapter[] = [];
      const matches = html.matchAll(/<li[^>]*class="[^"]*wp-manga-chapter[^"]*"[\s\S]*?<a[^>]+href="([^"]+)"[\s\S]*?>([\s\S]*?)<\/a>/gi);

      for (const m of matches) {
        const href = m[1];
        const rawTitle = this.decodeHtml(m[2].replace(/<[^>]*>/g, ""));
        const slugMatch = href.match(/\/manga\/([^\/]+)\/([^\/]+)/);
        if (!slugMatch) continue;

        const numMatch = rawTitle.match(/capitulo\s+(\d+)/i) || rawTitle.match(/cap\.?\s*(\d+)/i);
        chapters.push({
          id: `${slugMatch[1]}/${slugMatch[2]}`,
          chapterNum: numMatch ? numMatch[1] : rawTitle.replace(/[^0-9]/g, "") || "Especial",
          title: rawTitle,
          language: this.getLanguage(),
          providerId: this.id
        });
      }

      return chapters.reverse();
    } catch (err) {
      console.error(`MadaraProvider [${this.id}] getChapters failed:`, err);
      return [];
    }
  }

  async getPages(chapterId: string): Promise<Page[]> {
    try {
      const res = await fetch(this.getContentUrl(chapterId), { headers: BROWSER_HEADERS });
      if (!res.ok) throw new Error(`Pages status: ${res.status}`);
      const html = await res.text();

      const extractedPageUrls = this.collectPageUrls(html);
      if (extractedPageUrls.length > 0) {
        return extractedPageUrls.map((url, index) => ({ url, pageNumber: index + 1 }));
      }

      const match = html.match(/a=(https?%3A%2F%2F[^\s"&]+|https?:\/\/[^\s"&]+)/i) ||
        html.match(/src="([^"]+001\.(?:webp|jpg|jpeg|png))"/i) ||
        html.match(/data-src="([^"]+001\.(?:webp|jpg|jpeg|png))"/i) ||
        html.match(/data-lazy-src="([^"]+001\.(?:webp|jpg|jpeg|png))"/i);

      if (!match) throw new Error("Could not find base/001 image URL inside page.");

      const firstPageUrl = decodeURIComponent(match[1]);
      const numMatch = firstPageUrl.match(/(\d+)\.(webp|jpg|jpeg|png)$/i);
      if (!numMatch) throw new Error("Image name does not match sequential pattern.");

      const numStr = numMatch[1];
      const ext = numMatch[2];
      const basePart = firstPageUrl.slice(0, firstPageUrl.lastIndexOf(`${numStr}.${ext}`));
      const padLength = numStr.length;

      const pages: Page[] = [];
      let pageNum = 1;
      let hasMore = true;

      while (hasMore) {
        const batchSize = 10;
        const batchPromises = [];

        for (let i = 0; i < batchSize; i++) {
          const currentNum = String(pageNum + i).padStart(padLength, "0");
          const pageUrl = `${basePart}${currentNum}.${ext}`;
          batchPromises.push(
            fetch(pageUrl, {
              method: "HEAD",
              headers: { ...BROWSER_HEADERS, Referer: this.baseUrl }
            })
              .then(res => ({ url: pageUrl, ok: res.ok }))
              .catch(() => ({ url: pageUrl, ok: false }))
          );
        }

        const results = await Promise.all(batchPromises);
        for (const result of results) {
          if (result.ok) {
            pages.push({ url: result.url, pageNumber: pageNum });
            pageNum++;
          } else {
            hasMore = false;
            break;
          }
        }

        if (pageNum > 300) break;
      }

      return pages;
    } catch (err) {
      console.error(`MadaraProvider [${this.id}] getPages failed:`, err);
      return [];
    }
  }

  async getCatalog(_listType: "popular" | "latest"): Promise<SearchResult[]> {
    return [];
  }
}
