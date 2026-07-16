export interface SearchResult {
  id: string; // ID específico do provedor
  title: string;
  coverUrl?: string;
  description?: string;
  providerId: string;
  genres?: string[];
  releaseDate?: string;
}

export interface MangaDetails {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string;
  authors?: string[];
  status?: string;
  providerId: string;
  genres?: string[];
}

export interface Chapter {
  id: string; // ID específico do capítulo no provedor
  chapterNum: string;
  title: string;
  language: string;
  providerId: string;
}

export interface Page {
  url: string;
  pageNumber: number;
}

export interface Provider {
  id: string;
  name: string;
  language: string; // "pt", "en" ou "multi"

  search(query: string, nsfw?: boolean): Promise<SearchResult[]>;
  getDetails(id: string): Promise<MangaDetails>;
  getChapters(id: string): Promise<Chapter[]>;
  getPages(chapterId: string): Promise<Page[]>;
  getCatalog(listType: "popular" | "latest", nsfw?: boolean): Promise<SearchResult[]>;
}

export interface UnifiedSearchResult {
  id: string; // ID gerado para agrupamento
  title: string;
  coverUrl?: string;
  description?: string;
  rating?: number;
  genres?: string[];
  isAdult?: boolean;
  releaseDate?: string;
  sources: {
    providerId: string;
    id: string; // ID original do mangá no provedor
    title: string;
    releaseDate?: string;
  }[];
}
