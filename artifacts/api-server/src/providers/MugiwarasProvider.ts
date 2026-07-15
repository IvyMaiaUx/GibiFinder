import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

export class MugiwarasProvider implements Provider {
  id = "mugiwaras";
  name = "Mugiwaras";
  language = "pt";

  private popularComics = [
    { id: "one-piece", title: "One Piece", desc: "A jornada épica de Luffy e o bando do Chapéu de Palha.", cover: "https://cdn.mugiverso.com/mugiwarasoficial/wp-content/uploads/2026/02/HLTkvNSWEAACgXz-193x278.webp" },
    { id: "boruto-two-blue-vortex", title: "Boruto: Two Blue Vortex", desc: "A sequência direta das aventuras de Boruto Uzumaki.", cover: "https://cdn.mugiverso.com/mugiwarasoficial/wp-content/uploads/2026/03/boruto-two-blue-vortex-8208.webp" },
    { id: "jujutsu-kaisen", title: "Jujutsu Kaisen", desc: "A batalha das maldições e feiticeiros jujutsu.", cover: "https://cdn.mugiverso.com/mugiwarasoficial/wp-content/uploads/2026/03/jujutsu-kaisen-160x229.webp" },
    { id: "chainsaw-man", title: "Chainsaw Man", desc: "A história insana do homem-motosserra Denji.", cover: "https://cdn.mugiverso.com/mugiwarasoficial/wp-content/uploads/2026/03/chainsaw-man-160x229.webp" },
    { id: "kagurabachi", title: "Kagurabachi", desc: "A jornada de vingança com espadas encantadas.", cover: "https://cdn.mugiverso.com/mugiwarasoficial/wp-content/uploads/2026/03/kagurabachi-160x229.webp" }
  ];

  async search(query: string): Promise<SearchResult[]> {
    try {
      const url = `https://mugiwarasoficial.com/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      if (!res.ok) throw new Error(`Mugiwaras search failed status: ${res.status}`);
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
          description: `Disponível no portal Mugiwaras Oficial.`,
          coverUrl,
          providerId: this.id
        });
      }

      return results;
    } catch (err) {
      console.error("Mugiwaras search failed:", err);
      return [];
    }
  }

  async getDetails(id: string): Promise<MangaDetails> {
    try {
      const url = `https://mugiwarasoficial.com/manga/${id}/`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (!res.ok) throw new Error(`Failed to load details page: ${res.status}`);
      const html = await res.text();

      const coverMatch = html.match(/class="wp-post-image"[^>]+src="([^"]+)"/i) ||
                         html.match(/class="summary_image"[\s\S]*?<img[^>]+src="([^"]+)"/i) ||
                         html.match(/class="tab-summary"[\s\S]*?<img[^>]+src="([^"]+)"/i) ||
                         html.match(/<div[^>]+class="[^"]*summary_image[^"]*"[\s\S]*?<img[^>]+src="([^"]+)"/i);

      const descMatch = html.match(/class="summary__content"[\s\S]*?<p>([\s\S]*?)<\/p>/i) ||
                        html.match(/class="description-summary"[\s\S]*?<p>([\s\S]*?)<\/p>/i) ||
                        html.match(/class="manga-excerpt"[\s\S]*?<p>([\s\S]*?)<\/p>/i);

      const titleMatch = html.match(/<div[^>]+class="post-title"[\s\S]*?<h1>([\s\S]*?)<\/h1>/i);

      return {
        id,
        title: titleMatch ? titleMatch[1].trim() : id.replace(/-/g, " ").toUpperCase(),
        description: descMatch ? descMatch[1].replace(/<[^>]*>/g, "").trim() : "Mangá disponível no portal Mugiwaras Oficial.",
        coverUrl: coverMatch ? coverMatch[1] : undefined,
        providerId: this.id
      };
    } catch (err) {
      console.error("Mugiwaras getDetails failed:", err);
      const found = this.popularComics.find(c => c.id === id);
      return {
        id,
        title: found?.title || id.replace(/-/g, " ").toUpperCase(),
        description: found?.desc || "Mangá disponível no portal Mugiwaras Oficial.",
        coverUrl: found?.cover,
        providerId: this.id
      };
    }
  }

  async getChapters(id: string): Promise<Chapter[]> {
    try {
      const url = `https://mugiwarasoficial.com/manga/${id}/ajax/chapters/`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (!res.ok) throw new Error(`Failed to load chapters: ${res.status}`);
      const html = await res.text();

      const chapters: Chapter[] = [];
      const matches = html.matchAll(/<li[^>]*class="[^"]*wp-manga-chapter[^"]*"[\s\S]*?<a[^>]+href="([^"]+)"[\s\S]*?>([\s\S]*?)<\/a>/gi);

      for (const m of matches) {
        const href = m[1];
        const rawTitle = m[2].trim();
        
        // Extract chapter slug (e.g. capitulo-1)
        const slugMatch = href.match(/\/manga\/([^\/]+)\/([^\/]+)/);
        if (!slugMatch) continue;
        const chapSlug = `${slugMatch[1]}/${slugMatch[2]}`;

        // Get clean chapter number
        const numMatch = rawTitle.match(/capitulo\s+(\d+)/i) || rawTitle.match(/cap\.?\s*(\d+)/i);
        const chapterNum = numMatch ? numMatch[1] : rawTitle.replace(/[^0-9]/g, "") || "Especial";

        chapters.push({
          id: chapSlug,
          chapterNum,
          title: rawTitle,
          language: "pt",
          providerId: this.id
        });
      }

      // Return reversed (ascending order)
      return chapters.reverse();
    } catch (err) {
      console.error("Mugiwaras getChapters failed:", err);
      return [];
    }
  }

  async getPages(chapterId: string): Promise<Page[]> {
    try {
      // chapterId is in format: manga-slug/chapter-slug
      const url = `https://mugiwarasoficial.com/manga/${chapterId}/`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (!res.ok) throw new Error(`Failed to load chapter page: ${res.status}`);
      const html = await res.text();

      const match = html.match(/a=(https?%3A%2F%2F[^\s"&]+|https?:\/\/[^\s"&]+)/i);
      if (!match) throw new Error("Mugiwaras: failed to find base image URL inside HTML jump link.");
      
      const firstPageUrl = decodeURIComponent(match[1]);
      const numMatch = firstPageUrl.match(/(\d+)\.(webp|jpg|jpeg|png)$/i);
      if (!numMatch) throw new Error("Mugiwaras: image name does not match sequential pattern.");

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
                "Referer": "https://mugiwarasoficial.com/"
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
      console.error("Mugiwaras getPages failed:", err);
      return [];
    }
  }

  async getCatalog(listType: "popular" | "latest"): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    // Resolve full detail objects for the popular list
    await Promise.all(
      this.popularComics.map(async (c) => {
        try {
          const details = await this.getDetails(c.id);
          results.push({
            id: c.id,
            title: details.title,
            description: details.description,
            coverUrl: details.coverUrl || c.cover,
            providerId: this.id
          });
        } catch {
          results.push({
            id: c.id,
            title: c.title,
            description: c.desc,
            coverUrl: c.cover,
            providerId: this.id
          });
        }
      })
    );

    return results;
  }
}
