import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";
import { logger } from "../lib/logger";
import { normalizeTitleForMatch } from "./titleMatch";

const GENRE_EN_PT: Record<string, string> = {
  "Action": "Ação", "Adventure": "Aventura", "Comedy": "Comédia", "Drama": "Drama",
  "Fantasy": "Fantasia", "Horror": "Horror", "Mystery": "Mistério", "Romance": "Romance",
  "Sci-Fi": "Sci-Fi", "Slice of Life": "Slice of Life", "Sports": "Esportes",
  "Supernatural": "Sobrenatural", "Thriller": "Thriller", "Historical": "Histórico",
  "Isekai": "Isekai", "Military": "Militar", "Psychological": "Psicológico",
  "School Life": "Vida Escolar", "Martial Arts": "Artes Marciais", "Magic": "Magia",
  "Crime": "Crime", "Monsters": "Monstros", "Hentai": "Hentai", "Ecchi": "Ecchi",
  "Doujinshi": "Doujinshi", "Erotica": "Erótico",
  // Adult subgenres
  "Boys' Love": "Yaoi", "Yaoi": "Yaoi", "Girls' Love": "Yuri", "Yuri": "Yuri",
  "Loli": "Lolicon", "Lolicon": "Lolicon", "Shota": "Shotacon", "Shotacon": "Shotacon",
  "Futanari": "Futanari", "Incest": "Incesto", "Netorare": "Netorare", "NTR": "Netorare"
};
const mdNorm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const GENRE_PT_EN: Record<string, string> = Object.fromEntries(
  Object.entries(GENRE_EN_PT).map(([en, pt]) => [mdNorm(pt), en])
);

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

  // Real, verified example of why this exists: Solo Leveling's MangaDex
  // entry has a primary title map of just {"ko-ro": "Na Honjaman
  // Level-Up"} — no "en" key at all, so titleMap.en || titleMap.ja ||
  // first-available fell through to that Korean romanization nobody
  // recognizes. altTitles has {"en": "Solo Leveling"} right near the top
  // of dozens of translations — the actual well-known name, just never
  // consulted for the display title (only for enrichment matching).
  private extractDisplayTitle(item: any): string {
    const titleMap = item.attributes?.title || {};
    if (titleMap.en) return titleMap.en;
    const altTitles: any[] = item.attributes?.altTitles || [];
    const enAlt = altTitles.find((t: any) => t?.en)?.en;
    if (enAlt) return enAlt;
    if (titleMap.ja) return titleMap.ja;
    // Object.values(titleMap)[0] only checked the first key, which could be
    // an empty string while a later language had a real title — walk all of
    // them instead of bailing to "Sem título" too early (CodeRabbit PR #48).
    return this.getTitleMapValues(item)[0] || "Sem título";
  }

  // All non-empty primary-title-map values, e.g. every {"ko-ro": "...",
  // "ja": "..."} entry — not just the one extractDisplayTitle() settles on
  // for display. findBestMatch() needs the full set so a query using the
  // *original* (non-English) primary title still matches once display
  // preference has moved to an English altTitle (CodeRabbit PR #48).
  private getTitleMapValues(item: any): string[] {
    const titleMap = item.attributes?.title || {};
    return Object.values(titleMap).filter((v): v is string => typeof v === "string" && v.length > 0);
  }

  private getReleaseDate(item: any): string | undefined {
    const year = item.attributes?.year;
    if (typeof year === "number" && year > 0) return String(year);
    return item.attributes?.createdAt || item.attributes?.updatedAt;
  }

  private extractGenres(item: any): string[] {
    const tags = item.attributes?.tags || [];
    return tags
      .filter((t: any) => t.attributes?.group === "genre" || t.attributes?.group === "theme" || t.attributes?.group === "content")
      .map((t: any) => {
        const name = t.attributes?.name?.en || "";
        return GENRE_EN_PT[name] || name;
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
        const title = this.extractDisplayTitle(item);
        const descMap = item.attributes?.description || {};
        const description = this.extractPtDescription(descMap);
        
        const coverRel = item.relationships?.find((r: any) => r.type === "cover_art");
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

        return { id, title, description, coverUrl, genres, providerId: this.id, releaseDate: this.getReleaseDate(item) };
      });
    } catch (err) {
      logger.error({ err: err }, "MangaDex search failed:");
      return [];
    }
  }

  // Used only by ProviderManager's cross-provider enrichment pass — not part
  // of the Provider interface. MangaDex's own catalog title is routinely the
  // Japanese romanized name ("Boku no Hero Academia"), while the same series
  // scraped from another provider is filed under its English/localized name
  // ("My Hero Academia"). Comparing search()'s single title field misses
  // most well-known series for exactly this reason; MangaDex's own
  // `altTitles` list (dozens of translations per manga) is what actually
  // has the localized name as one of its entries, so this checks every
  // candidate's main title AND all of its altTitles, not just the former.
  async findBestMatch(query: string, nsfw?: boolean, signal?: AbortSignal): Promise<SearchResult | null> {
    // A query that's punctuation/symbols-only (or, before the Unicode fix
    // above, any non-Latin-script title) normalizes to "" — without this
    // guard that would then "exact match" the first MangaDex result whose
    // title/altTitles ALSO happen to normalize to "", enriching the item
    // with a completely unrelated cover/description instead of just finding
    // nothing.
    const normQuery = normalizeTitleForMatch(query);
    if (!normQuery) return null;

    try {
      const ratingQuery = nsfw
        ? "contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic"
        : "contentRating[]=safe&contentRating[]=suggestive";
      const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=20&includes[]=cover_art&${ratingQuery}`;
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`MangaDex search error: ${res.status}`);
      const data = await res.json() as any;

      for (const item of (data.data || [])) {
        const mainTitle = this.extractDisplayTitle(item);
        const altTitles: string[] = (item.attributes?.altTitles || []).flatMap((entry: any) => Object.values(entry) as string[]);
        // Include every primary-title-map value, not just the one
        // extractDisplayTitle() picked for display — otherwise a query for
        // the original non-English primary title (e.g. the Korean
        // romanization) stops matching once display prefers an English
        // altTitle instead (CodeRabbit PR #48).
        const candidateTitles = [mainTitle, ...this.getTitleMapValues(item), ...altTitles].filter(Boolean);
        if (!candidateTitles.some(t => normalizeTitleForMatch(t) === normQuery)) continue;

        const id = item.id;
        const descMap = item.attributes?.description || {};
        const description = this.extractPtDescription(descMap);
        const coverRel = item.relationships?.find((r: any) => r.type === "cover_art");
        const coverFileName = coverRel?.attributes?.fileName;
        const coverUrl = coverFileName
          ? `https://uploads.mangadex.org/covers/${id}/${coverFileName}.256.jpg`
          : undefined;
        const genres = this.extractGenres(item);
        return { id, title: mainTitle || query, description, coverUrl, genres, providerId: this.id, releaseDate: this.getReleaseDate(item) };
      }
      return null;
    } catch (err) {
      // An aborted lookup (enrichment's own timeout) isn't a real failure —
      // it's the expected outcome of giving up on a slow request, so it
      // shouldn't be logged alongside genuine errors.
      if (!(err instanceof Error) || err.name !== "AbortError") {
        logger.error({ err: err }, "MangaDex findBestMatch failed:");
      }
      return null;
    }
  }

  async getDetails(id: string): Promise<MangaDetails> {
    const url = `https://api.mangadex.org/manga/${id}?includes[]=cover_art`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MangaDex details error: ${res.status}`);
    const data = await res.json() as any;
    const item = data.data;

    const title = this.extractDisplayTitle(item);
    const descMap = item.attributes?.description || {};
    const description = this.extractPtDescription(descMap);

    const coverRel = item.relationships?.find((r: any) => r.type === "cover_art");
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
        if (offset >= 2500) break; // safety breaker: MangaDex caps offset at 2500
        // Fetch chapters in Portuguese and English
        const url = `https://api.mangadex.org/manga/${id}/feed?translatedLanguage[]=pt-br&translatedLanguage[]=pt&translatedLanguage[]=en&order[chapter]=asc&limit=${limit}&offset=${offset}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`MangaDex chapters error: ${res.status}`);
        const data = await res.json() as any;

        allData = allData.concat(data.data || []);
        offset += limit;
        hasMore = (data.data || []).length === limit && allData.length < (data.total || 0);
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
      logger.error({ err: err }, "MangaDex chapters load failed:");
      return [];
    }
  }

  // Used only by ProviderManager's "recent updates" row — not part of the
  // Provider interface. getChapters() above deliberately fetches a title's
  // ENTIRE chapter history (paginated up to 2500), which is the right thing
  // for a reader's chapter list but far too much for "what are the 3 newest
  // chapters" — this is a single lean request for just that, using
  // MangaDex's own `readableAt` per chapter (a field getChapters() doesn't
  // even ask for, since nothing before this needed it).
  async getRecentChapters(id: string, limit = 3, signal?: AbortSignal): Promise<{ chapterNum: string; date?: string }[]> {
    try {
      // Over-fetch and de-dupe: MangaDex returns each translation of a
      // chapter as its own feed resource, so requesting pt-br/pt/en
      // together can return several entries for the SAME chapter number
      // before the newest DISTINCT chapters are known — fetching exactly
      // `limit` items risked returning duplicates instead of the 3 newest
      // chapters. Same dedup approach getChapters() above already uses for
      // its own multi-language feed, just windowed to the newest ones.
      const overfetchLimit = Math.max(limit * 5, 15);
      const url = `https://api.mangadex.org/manga/${id}/feed?translatedLanguage[]=pt-br&translatedLanguage[]=pt&translatedLanguage[]=en&order[readableAt]=desc&limit=${overfetchLimit}`;
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`MangaDex recent chapters error: ${res.status}`);
      const data = await res.json() as any;

      const seen = new Set<string>();
      const result: { chapterNum: string; date?: string }[] = [];
      for (const item of (data.data || [])) {
        const chapterNum = item.attributes?.chapter || "Especial";
        if (seen.has(chapterNum)) continue;
        seen.add(chapterNum);
        result.push({ chapterNum, date: item.attributes?.readableAt || item.attributes?.publishAt });
        if (result.length >= limit) break;
      }
      return result;
    } catch (err) {
      if (!(err instanceof Error) || err.name !== "AbortError") {
        logger.error({ err }, "MangaDex getRecentChapters failed:");
      }
      return [];
    }
  }

  async getPages(chapterId: string): Promise<Page[]> {
    try {
      const url = `https://api.mangadex.org/at-home/server/${chapterId}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`MangaDex pages error: ${res.status}`);
      const data = await res.json() as any;

      const baseUrl = data.baseUrl;
      const hash = data.chapter?.hash;
      const fileNames = data.chapter?.data;

      if (!baseUrl || !hash || !Array.isArray(fileNames)) {
        logger.error({ chapterId, data }, "MangaDex pages: unexpected at-home response shape");
        return [];
      }

      return fileNames.map((fn: string, index: number) => ({
        url: `${baseUrl}/data/${hash}/${fn}`,
        pageNumber: index + 1
      }));
    } catch (err) {
      logger.error({ err, chapterId }, "MangaDex getPages failed:");
      return [];
    }
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
        const title = this.extractDisplayTitle(item);
        const descMap = item.attributes?.description || {};
        const description = descMap.en || descMap["pt-br"] || (Object.values(descMap).length > 0 ? Object.values(descMap)[0] : "");
        
        const coverRel = item.relationships?.find((r: any) => r.type === "cover_art");
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

        return { id, title, description, coverUrl, genres, providerId: this.id, releaseDate: this.getReleaseDate(item) };
      });
    } catch (err) {
      logger.error({ err: err }, "MangaDex catalog failed:");
      return [];
    }
  }

  private toResult(item: any): SearchResult {
    const id = item.id;
    const title = this.extractDisplayTitle(item);
    const descMap = item.attributes?.description || {};
    const description = (descMap.en || descMap["pt-br"] || (Object.values(descMap)[0] as string) || "") as string;
    const coverRel = item.relationships?.find((r: any) => r.type === "cover_art");
    const coverFileName = coverRel?.attributes?.fileName;
    const coverUrl = coverFileName ? `https://uploads.mangadex.org/covers/${id}/${coverFileName}.256.jpg` : undefined;
    const genres = this.extractGenres(item);
    const cr = item.attributes?.contentRating;
    if ((cr === "erotica" || cr === "pornographic") && !genres.includes("Adulto")) genres.push("Adulto");
    return { id, title, description, coverUrl, genres, providerId: this.id, releaseDate: this.getReleaseDate(item) };
  }

  private static tagMap: Record<string, string> | null = null;
  private async getTagMap(): Promise<Record<string, string>> {
    if (MangaDexProvider.tagMap) return MangaDexProvider.tagMap;
    try {
      const res = await fetch("https://api.mangadex.org/manga/tag");
      if (!res.ok) return {};
      const data = await res.json() as any;
      const map: Record<string, string> = {};
      for (const t of data.data || []) {
        const name = (t.attributes?.name?.en || "").toLowerCase();
        if (name) map[name] = t.id;
      }
      MangaDexProvider.tagMap = map;
      return map;
    } catch {
      return {};
    }
  }

  // Fetch many titles for a genre using MangaDex's tag filter.
  async getByGenre(genre: string, nsfw?: boolean): Promise<SearchResult[]> {
    try {
      const en = (GENRE_PT_EN[mdNorm(genre)] || genre).toLowerCase();
      const tagMap = await this.getTagMap();
      const tagId = tagMap[en];
      if (!tagId) return [];
      const ratingQuery = nsfw
        ? "contentRating[]=erotica&contentRating[]=pornographic"
        : "contentRating[]=safe&contentRating[]=suggestive";
      // MangaDex caps at 100 per request — paginate up to 300 per genre.
      const results: SearchResult[] = [];
      for (let offset = 0; offset < 300; offset += 100) {
        const url = `https://api.mangadex.org/manga?limit=100&offset=${offset}&includes[]=cover_art&includedTags[]=${tagId}&${ratingQuery}&order[followedCount]=desc`;
        const res = await fetch(url);
        if (!res.ok) break;
        const data = await res.json() as any;
        const items = data.data || [];
        results.push(...items.map((item: any) => this.toResult(item)));
        if (items.length < 100) break;
      }
      return results;
    } catch (err) {
      logger.warn({ err }, "MangaDex getByGenre failed");
      return [];
    }
  }
}
