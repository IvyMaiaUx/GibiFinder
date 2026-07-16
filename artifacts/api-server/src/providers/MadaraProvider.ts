import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

export class MadaraProvider implements Provider {
  constructor(
    public id: string,
    public name: string,
    public language: string,
    public baseUrl: string
  ) {
    // Ensure baseUrl has a trailing slash
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
      .replace(/&gt;/g, ">");
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

  private collectPageUrls(html: string): string[] {
    const urls = new Set<string>();
    const imageExt = /\.(?:webp|jpe?g|png)(?:[?#][^"' <>)\\]*)?$/i;
    const badFragments = [
      "logo",
      "avatar",
      "banner",
      "ads",
      "advert",
      "placeholder",
      "loading",
      "wp-content/plugins",
      "wp-includes"
    ];

    const addCandidate = (raw?: string) => {
      if (!raw) return;
      const resolved = this.resolveUrl(raw);
      if (!resolved) return;
      const lower = resolved.toLowerCase();
      if (!imageExt.test(lower)) return;
      if (badFragments.some(fragment => lower.includes(fragment))) return;
      urls.add(resolved);
    };

    const readerBlocks = [
      /<div[^>]+class="[^"]*(?:reading-content|entry-content|chapter-content|page-break|wp-manga-chapter-img)[^"]*"[\s\S]*?<\/div>/gi,
      /<figure[\s\S]*?<\/figure>/gi,
      /<img[^>]+>/gi
    ];

    for (const blockRegex of readerBlocks) {
      for (const blockMatch of html.matchAll(blockRegex)) {
        const block = blockMatch[0];
        for (const imgMatch of block.matchAll(/<img[^>]+>/gi)) {
          const tag = imgMatch[0];
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

    for (const urlMatch of html.matchAll(/https?:\\?\/\\?\/[^"' <>)\\]+?\.(?:webp|jpe?g|png)(?:\?[^"' <>)\\]*)?/gi)) {
      addCandidate(urlMatch[0]);
    }

    return Array.from(urls).map((url, index) => ({ url, index }))
      .sort((a, b) => {
        const pageA = a.url.match(/(?:^|[^\d])(\d{1,4})(?:\D*)\.(?:webp|jpe?g|png)/i)?.[1];
        const pageB = b.url.match(/(?:^|[^\d])(\d{1,4})(?:\D*)\.(?:webp|jpe?g|png)/i)?.[1];
        if (pageA && pageB) return Number(pageA) - Number(pageB);
        return a.index - b.index;
      })
      .map(item => item.url);
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const url = `${this.baseUrl}?s=${encodeURIComponent(query)}&post_type=wp-manga`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      if (!res.ok) throw new Error(`Search failed status: ${res.status}`);
      const html = await res.text();

      const parts = html.split('<div class="row c-tabs-item__content">');
      const results: SearchResult[] = [];

      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        
        // Extract URL and slug
        const urlMatch = part.match(/href="([^"]+?\/manga\/([^\/]+?)\/)"/i);
        if (!urlMatch) continue;
        const slug = urlMatch[2];
        if (slug === "feed") continue;

        // Extract Title
        const titleMatch = part.match(/class="post-title"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
                           part.match(/title="([^"]+)"/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : slug.replace(/-/g, " ").toUpperCase();

        // Extract Cover Image
        const coverMatch = part.match(/<img[^>]+src="([^"]+)"/i) ||
                           part.match(/<img[^>]+data-src="([^"]+)"/i);
        const coverUrl = coverMatch ? coverMatch[1] : undefined;

        results.push({
          id: slug,
          title,
          description: `Disponível no portal ${this.name}.`,
          coverUrl,
          providerId: this.id
        });
      }

      return results;
    } catch (err) {
      console.error(`MadaraProvider [${this.id}] search failed:`, err);
      return [];
    }
  }

  async getDetails(id: string): Promise<MangaDetails> {
    try {
      const url = `${this.baseUrl}manga/${id}/`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (!res.ok) throw new Error(`Details status: ${res.status}`);
      const html = await res.text();

      const coverMatch = html.match(/class="wp-post-image"[^>]+src="([^"]+)"/i) ||
                         html.match(/class="summary_image"[\s\S]*?<img[^>]+src="([^"]+)"/i) ||
                         html.match(/class="tab-summary"[\s\S]*?<img[^>]+src="([^"]+)"/i) ||
                         html.match(/<div[^>]+class="[^"]*summary_image[^"]*"[\s\S]*?<img[^>]+src="([^"]+)"/i);

      const descMatch = html.match(/class="summary__content"[\s\S]*?<p>([\s\S]*?)<\/p>/i) ||
                        html.match(/class="description-summary"[\s\S]*?<p>([\s\S]*?)<\/p>/i) ||
                        html.match(/class="manga-excerpt"[\s\S]*?<p>([\s\S]*?)<\/p>/i);

      const titleMatch = html.match(/<div[^>]+class="post-title"[\s\S]*?<h1>([\s\S]*?)<\/h1>/i);

      const genresMatch = html.match(/class="genres-content"[\s\S]*?<\/div>/i);
      let genres: string[] = [];
      if (genresMatch) {
        const genreTags = genresMatch[0].matchAll(/<a[^>]+>([^<]+)<\/a>/gi);
        for (const gt of genreTags) {
          const g = gt[1].trim();
          if (g) genres.push(g);
        }
      }

      return {
        id,
        title: titleMatch ? titleMatch[1].trim() : id.replace(/-/g, " ").toUpperCase(),
        description: descMatch ? descMatch[1].replace(/<[^>]*>/g, "").trim() : `Mangá disponível no portal ${this.name}.`,
        coverUrl: coverMatch ? coverMatch[1] : undefined,
        genres,
        providerId: this.id
      };
    } catch (err) {
      console.error(`MadaraProvider [${this.id}] getDetails failed:`, err);
      return {
        id,
        title: id.replace(/-/g, " ").toUpperCase(),
        description: `Mangá disponível no portal ${this.name}.`,
        genres: [],
        providerId: this.id
      };
    }
  }

  async getChapters(id: string): Promise<Chapter[]> {
    try {
      const url = `${this.baseUrl}manga/${id}/ajax/chapters/`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (!res.ok) throw new Error(`Chapters status: ${res.status}`);
      const html = await res.text();

      const chapters: Chapter[] = [];
      const matches = html.matchAll(/<li[^>]*class="[^"]*wp-manga-chapter[^"]*"[\s\S]*?<a[^>]+href="([^"]+)"[\s\S]*?>([\s\S]*?)<\/a>/gi);

      for (const m of matches) {
        const href = m[1];
        const rawTitle = m[2].trim();
        
        const slugMatch = href.match(/\/manga\/([^\/]+)\/([^\/]+)/);
        if (!slugMatch) continue;
        const chapSlug = `${slugMatch[1]}/${slugMatch[2]}`;

        const numMatch = rawTitle.match(/capitulo\s+(\d+)/i) || rawTitle.match(/cap\.?\s*(\d+)/i);
        const chapterNum = numMatch ? numMatch[1] : rawTitle.replace(/[^0-9]/g, "") || "Especial";

        chapters.push({
          id: chapSlug,
          chapterNum,
          title: rawTitle,
          language: this.language === "multi" ? "pt" : this.language,
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
      const url = `${this.baseUrl}manga/${chapterId}/`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (!res.ok) throw new Error(`Pages status: ${res.status}`);
      const html = await res.text();

      const extractedPageUrls = this.collectPageUrls(html);
      if (extractedPageUrls.length > 0) {
        return extractedPageUrls.map((url, index) => ({
          url,
          pageNumber: index + 1
        }));
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
      const basePart = firstPageUrl.slice(0, firstPageUrl.lastIndexOf(numStr + "." + ext));
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
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": this.baseUrl
              }
            })
              .then(res => ({ url: pageUrl, ok: res.ok }))
              .catch(() => ({ url: pageUrl, ok: false }))
          );
        }

        const results = await Promise.all(batchPromises);
        for (const r of results) {
          if (r.ok) {
            pages.push({ url: r.url, pageNumber: pageNum });
            pageNum++;
          } else {
            hasMore = false;
            break;
          }
        }

        if (pageNum > 300) break; // safety limit
      }

      return pages;
    } catch (err) {
      console.error(`MadaraProvider [${this.id}] getPages failed:`, err);
      return [];
    }
  }

  async getCatalog(listType: "popular" | "latest"): Promise<SearchResult[]> {
    // Return empty or dynamic popular list if catalog list requested
    return [];
  }
}
