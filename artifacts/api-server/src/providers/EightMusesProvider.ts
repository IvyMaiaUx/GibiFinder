import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

export class EightMusesProvider implements Provider {
  id = "eightmuses";
  name = "8Muses";
  language = "en";

  async search(_query: string): Promise<SearchResult[]> {
    return [];
  }

  async getDetails(id: string): Promise<MangaDetails> {
    return {
      id,
      title: id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      description: "8Muses is listed as a future provider, but does not have a live parser yet.",
      authors: [],
      providerId: this.id,
      genres: ["Adulto"]
    };
  }

  async getChapters(_id: string): Promise<Chapter[]> {
    return [];
  }

  async getPages(_chapterId: string): Promise<Page[]> {
    return [];
  }

  async getCatalog(_listType: "popular" | "latest"): Promise<SearchResult[]> {
    return [];
  }
}
