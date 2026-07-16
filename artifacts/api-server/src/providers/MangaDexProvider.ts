import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

export class MangaDexProvider implements Provider {
  id = "mangadex";
  name = "MangaDex";
  language = "multi";

  private extractPtDescription(descMap: any): string {
    if (!descMap) return "";
    const keys = Object.keys(descMap);
    const ptKey = keys.find(k => k.toLowerCase() === "pt-br" || k.toLowerCase() === "pt");
    if (ptKey && descMap[ptKey]) return descMap[ptKey];
    const ptAnyKey = keys.find(k => k.toLowerCase().includes("pt"));
    if (ptAnyKey && descMap[ptAnyKey]) return descMap[ptAnyKey];
    const enKey = keys.find(k => k.toLowerCase() === "en");
    if (enKey && descMap[enKey]) return descMap[enKey];
    const firstVal = Object.values(descMap)[0];
    return typeof firstVal === "string" ? firstVal : "";
  }

  private extractGenres(item: any): string[] {
    const tags = item.attributes?.tags || [];
    const translationMap: Record<string, string> = {
      "Action": "Ação",
      "Adventure": "Aventura",
      "Comedy": "Comédia",
      "Drama": "Drama",
      "Fantasy": "Fantasia",
      "Horror": "Horror",
      "Mystery": "Mistério",
      "Romance": "Romance",
      "Sci-Fi": "Sci-Fi",
      "Slice of Life": "Slice of Life",
      "Sports": "Esportes",
      "Supernatural": "Sobrenatural",
      "Thriller": "Thriller",
      "Historical": "Histórico",
      "Isekai": "Isekai",
      "Military": "Militar",
      "Psychological": "Psicológico",
      "School Life": "Vida Escolar",
      "Martial Arts": "Artes Marciais",
      "Magic": "Magia",
      "Crime": "Crime",
      "Monsters": "Monstros",
      "Hentai": "Hentai",
      "Ecchi": "Ecchi",
      "Doujinshi": "Doujinshi",
      "Erotica": "Erótico"
    };

    return tags
      .filter((t: any) => t.attributes?.group === "genre" || t.attributes?.group === "theme")
      .map((t: any) => {
        const name = t.attributes?.name?.en || "";
        return translationMap[name] || name;
      })
      .filter(Boolean);
  }

  async search(query: string, nsfw?: boolean): Promise<SearchResult[]> {
    try {
      const ratingQuery = nsfw
        ? "contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic"
        : "contentRating[]=safe&contentRating[]=suggestive";
      const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=15&includes[]=cover_art&${ratingQuery}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`MangaDex search error: ${res.status}`);
      const data = await res.json() as any;

      return data.data.map((item: any) => {
        const id = item.id;
        const titleMap = item.attributes?.title || {};
        const title = titleMap.en || titleMap.ja || (Object.values(titleMap).length > 0 ? Object.values(titleMap)[0] : "Sem título");
        const descMap = item.attributes?.description || {};
        const description = this.extractPtDescription(descMap);
        
        const coverRel = item.relationships.find((r: any) => r.type === "cover_art");
        const coverFileName = coverRel?.attributes?.fileName;
        const coverUrl = coverFileName 
          ? `https://uploads.mangadex.org/covers/${id}/${coverFileName}.256.jpg` 
          : undefined;

        const genres = this.extractGenres(item);
        const contentRating = item.attributes?.contentRating;
        if (contentRating === "erotica" || contentRating === "pornographic") {
          if (!genres.includes("Adulto")) {
            genres.push("Adulto");
          }
        }

        return { id, title, description, coverUrl, genres, providerId: this.id };
      });
    } catch (err) {
      console.error("MangaDex search failed:", err);
      return [];
    }
  }

  async getDetails(id: string): Promise<MangaDetails> {
    const url = `https://api.mangadex.org/manga/${id}?includes[]=cover_art`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MangaDex details error: ${res.status}`);
    const data = await res.json() as any;
    const item = data.data;

    const titleMap = item.attributes?.title || {};
    const title = titleMap.en || titleMap.ja || (Object.values(titleMap).length > 0 ? Object.values(titleMap)[0] : "Sem título");
    const descMap = item.attributes?.description || {};
    const description = this.extractPtDescription(descMap);
    
    const coverRel = item.relationships.find((r: any) => r.type === "cover_art");
    const coverFileName = coverRel?.attributes?.fileName;
    const coverUrl = coverFileName 
      ? `https://uploads.mangadex.org/covers/${id}/${coverFileName}.512.jpg` 
      : undefined;

    const status = item.attributes.status;
    const genres = this.extractGenres(item);

    return { id, title, description, coverUrl, status, genres, providerId: this.id };
  }

  async getChapters(id: string): Promise<Chapter[]> {
    try {
      let allData: any[] = [];
      let offset = 0;
      let limit = 500;
      let hasMore = true;

      while (hasMore) {
        // Fetch chapters in Portuguese and English
        const url = `https://api.mangadex.org/manga/${id}/feed?translatedLanguage[]=pt-br&translatedLanguage[]=pt&translatedLanguage[]=en&order[chapter]=asc&limit=${limit}&offset=${offset}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`MangaDex chapters error: ${res.status}`);
        const data = await res.json() as any;
        
        allData = allData.concat(data.data || []);
        offset += limit;
        hasMore = (data.data || []).length === limit && allData.length < (data.total || 0);

        if (offset > 2500) break; // safety breaker
      }

      const results: Chapter[] = allData.map((item: any) => {
        const chapterId = item.id;
        const chapterNum = item.attributes.chapter || "Especial";
        const title = item.attributes.title || `Capítulo ${chapterNum}`;
        const language = item.attributes.translatedLanguage;
        
        return { id: chapterId, chapterNum, title, language, providerId: this.id };
      });

      // De-duplicate same chapter number per language
      const uniqueChapters: Chapter[] = [];
      const seen = new Set<string>();
      for (const ch of results) {
        const key = `${ch.language}-${ch.chapterNum}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueChapters.push(ch);
        }
      }

      return uniqueChapters;
    } catch (err) {
      console.error("MangaDex chapters load failed:", err);
      return [];
    }
  }

  async getPages(chapterId: string): Promise<Page[]> {
    const url = `https://api.mangadex.org/at-home/server/${chapterId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MangaDex pages error: ${res.status}`);
    const data = await res.json() as any;

    const baseUrl = data.baseUrl;
    const hash = data.chapter.hash;
    const fileNames = data.chapter.data;

    return fileNames.map((fn: string, index: number) => ({
      url: `${baseUrl}/data/${hash}/${fn}`,
      pageNumber: index + 1
    }));
  }

  async getCatalog(listType: "popular" | "latest", nsfw?: boolean): Promise<SearchResult[]> {
    try {
      const orderQuery = listType === "popular" 
        ? "order[followedCount]=desc" 
        : "order[latestUploadedChapter]=desc";
      const ratingQuery = nsfw 
        ? "contentRating[]=erotica&contentRating[]=pornographic" 
        : "contentRating[]=safe&contentRating[]=suggestive";
      const url = `https://api.mangadex.org/manga?limit=100&includes[]=cover_art&${ratingQuery}&${orderQuery}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`MangaDex catalog error: ${res.status}`);
      const data = await res.json() as any;

      return (data.data || []).map((item: any) => {
        const id = item.id;
        const titleMap = item.attributes?.title || {};
        const title = titleMap.en || titleMap.ja || (Object.values(titleMap).length > 0 ? Object.values(titleMap)[0] : "Sem título");
        const descMap = item.attributes?.description || {};
        const description = descMap.en || descMap["pt-br"] || (Object.values(descMap).length > 0 ? Object.values(descMap)[0] : "");
        
        const coverRel = item.relationships.find((r: any) => r.type === "cover_art");
        const coverFileName = coverRel?.attributes?.fileName;
        const coverUrl = coverFileName 
          ? `https://uploads.mangadex.org/covers/${id}/${coverFileName}.256.jpg` 
          : undefined;
        const genres = this.extractGenres(item);
        const contentRating = item.attributes?.contentRating;
        if (contentRating === "erotica" || contentRating === "pornographic") {
          if (!genres.includes("Adulto")) {
            genres.push("Adulto");
          }
        }

        return { id, title, description, coverUrl, genres, providerId: this.id };
      });
    } catch (err) {
      console.error("MangaDex catalog failed:", err);
      return [];
    }
  }
}
