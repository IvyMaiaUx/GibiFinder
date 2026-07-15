import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

export class ComicExtraProvider implements Provider {
  id = "comicextra";
  name = "ComicExtra";
  language = "en";

  // Simple scraper using regex
  async search(query: string): Promise<SearchResult[]> {
    try {
      const url = `https://www.comicextra.me/search?keyword=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (!res.ok) throw new Error(`ComicExtra search returned ${res.status}`);
      const html = await res.text();
      
      const results: SearchResult[] = [];
      // Match comic items in search page
      // Match pattern in ComicExtra search:
      // <h3><a href="https://www.comicextra.me/comic/title">Title</a></h3>
      // <img src="image_url" ...>
      const regex = /<h3><a href="([^"]+)">([^<]+)<\/a><\/h3>[\s\S]*?<img src="([^"]+)"/g;
      let match;
      let count = 0;
      while ((match = regex.exec(html)) !== null && count < 10) {
        const comicUrl = match[1];
        const title = match[2].trim();
        const coverUrl = match[3];
        // Extract id from URL: e.g. "https://www.comicextra.me/comic/batman-2016" -> "batman-2016"
        const comicId = comicUrl.split("/").pop() || "";
        
        results.push({
          id: comicId,
          title,
          description: "HQ importada de ComicExtra",
          coverUrl,
          providerId: this.id
        });
        count++;
      }

      if (results.length > 0) return results;
    } catch (err) {
      console.warn("ComicExtra scraper failed, using fallback mock:", err);
    }

    // Fallback Mock Results for demonstration
    const fallbackComics = [
      { id: "batman-the-killing-joke", title: "Batman: The Killing Joke" },
      { id: "watchmen", title: "Watchmen (1986)" },
      { id: "spiderman-blue", title: "Spider-Man: Blue" },
      { id: "the-sandman", title: "The Sandman (1989)" }
    ];

    return fallbackComics
      .filter(c => c.title.toLowerCase().includes(query.toLowerCase()))
      .map(c => ({
        id: c.id,
        title: c.title,
        description: `Graphic Novel lendária da DC/Marvel (Fallback de demonstração para ${query})`,
        coverUrl: "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop",
        providerId: this.id
      }));
  }

  async getDetails(id: string): Promise<MangaDetails> {
    try {
      const url = `https://www.comicextra.me/comic/${id}`;
      const res = await fetch(url);
      if (res.ok) {
        const html = await res.text();
        const titleMatch = html.match(/<h1 class="title">([^<]+)<\/h1>/);
        const title = titleMatch ? titleMatch[1].trim() : id;
        const coverMatch = html.match(/<div class="movie-poster">[\s\S]*?src="([^"]+)"/);
        const coverUrl = coverMatch ? coverMatch[1] : undefined;
        
        return {
          id,
          title,
          description: `História em Quadrinhos hospedada no ComicExtra. ID: ${id}`,
          coverUrl,
          providerId: this.id
        };
      }
    } catch {}

    return {
      id,
      title: id.replace(/-/g, " ").toUpperCase(),
      description: "HQ americana carregada via provedor de contingência.",
      coverUrl: "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=512&fit=crop",
      providerId: this.id
    };
  }

  async getChapters(id: string): Promise<Chapter[]> {
    try {
      const url = `https://www.comicextra.me/comic/${id}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const html = await res.text();
      
      const chapters: Chapter[] = [];
      // Match chapter links in table
      // <a href="https://www.comicextra.me/comic/id/chapter-1">Chapter 1</a>
      const regex = /<a href="([^"]+\/chapter-([^"]+))">([^<]+)<\/a>/g;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const chapterUrl = match[1];
        const chapterNum = match[2];
        const title = match[3].trim();
        // Extract id: "https://www.comicextra.me/comic/id/chapter-1" -> "id/chapter-1"
        const relativeId = chapterUrl.split("/comic/").pop() || "";

        chapters.push({
          id: relativeId,
          chapterNum,
          title,
          language: "en",
          providerId: this.id
        });
      }

      if (chapters.length > 0) {
        // Sort ascending
        return chapters.reverse();
      }
    } catch (err) {
      console.warn("ComicExtra chapters scraper failed, using fallback mock:", err);
    }

    // Mock Chapters
    return [
      { id: `${id}/chapter-1`, chapterNum: "1", title: "Chapter 1: The Beginning", language: "en", providerId: this.id },
      { id: `${id}/chapter-2`, chapterNum: "2", title: "Chapter 2: The Confrontation", language: "en", providerId: this.id },
      { id: `${id}/chapter-3`, chapterNum: "3", title: "Chapter 3: The Climax", language: "en", providerId: this.id }
    ];
  }

  async getPages(chapterId: string): Promise<Page[]> {
    try {
      // chapterId is in the format "comic-id/chapter-num" or "comic-id/reader"
      const url = `https://www.comicextra.me/${chapterId}/full`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const html = await res.text();
      
      const pages: Page[] = [];
      // Match image urls in full reader page
      // <img class="chapter_img" src="image_url" ...>
      const regex = /<img[^>]+class="chapter_img"[^>]+src="([^"]+)"/g;
      let match;
      let pageNumber = 1;
      while ((match = regex.exec(html)) !== null) {
        pages.push({
          url: match[1],
          pageNumber
        });
        pageNumber++;
      }

      if (pages.length > 0) return pages;
    } catch {}

    // Fallback Mock Pages (Uses high-quality placeholders for reading demonstration)
    return Array.from({ length: 30 }).map((_, i) => ({
      url: `https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?w=800&q=80&text=Page+${i+1}`,
      pageNumber: i + 1
    }));
  }

  async getCatalog(listType: "popular" | "latest"): Promise<SearchResult[]> {
    const popularComics = [
      { id: "batman-the-killing-joke", title: "Batman: The Killing Joke", coverUrl: "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop" },
      { id: "watchmen", title: "Watchmen (1986)", coverUrl: "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop" },
      { id: "spiderman-blue", title: "Spider-Man: Blue", coverUrl: "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop" },
      { id: "the-sandman", title: "The Sandman (1989)", coverUrl: "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop" },
      { id: "invincible", title: "Invincible (2003)", coverUrl: "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop" },
      { id: "the-walking-dead", title: "The Walking Dead (2003)", coverUrl: "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop" },
      { id: "saga", title: "Saga (2012)", coverUrl: "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop" },
      { id: "v-for-vendetta", title: "V for Vendetta (1989)", coverUrl: "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop" },
      { id: "civil-war", title: "Civil War (2006)", coverUrl: "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop" },
      { id: "daredevil-born-again", title: "Daredevil: Born Again (1986)", coverUrl: "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop" }
    ];

    return popularComics.map(c => ({
      id: c.id,
      title: c.title,
      description: "Graphic Novel clássica disponível no ComicExtra",
      coverUrl: c.coverUrl,
      providerId: this.id
    }));
  }
}
