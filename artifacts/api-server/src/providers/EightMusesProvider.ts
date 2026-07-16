import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

export class EightMusesProvider implements Provider {
  id = "eightmuses";
  name = "8Muses";
  language = "en";

  private popularComics = [
    { id: "incase-alfie", title: "Alfie (by Incase)", author: "Incase", desc: "Fantasy-adventure adult comic catalog entry.", cover: "https://images.unsplash.com/photo-1541963463532-d68292c34b19?w=256&fit=crop", genres: ["Adulto", "Fantasia", "Aventura"] },
    { id: "milftoon-beach", title: "Beach Adventure (Milftoon)", author: "Milftoon", desc: "Comedy/drama adult comic catalog entry.", cover: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=256&fit=crop", genres: ["Adulto", "Comedia", "Romance"] },
    { id: "jab-comix-office", title: "Office Affairs (Jab Comix)", author: "Jab Comix", desc: "Office-themed adult comic catalog entry.", cover: "https://images.unsplash.com/photo-1506880018603-83d5b814b5a6?w=256&fit=crop", genres: ["Adulto", "Drama", "Comedia"] },
    { id: "palcomix-portal", title: "Portal Parody (Palcomix)", author: "Palcomix", desc: "Sci-fi parody adult comic catalog entry.", cover: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=256&fit=crop", genres: ["Adulto", "Sci-Fi", "Parodia"] }
  ];

  async search(query: string): Promise<SearchResult[]> {
    const q = query.toLowerCase().trim();
    return this.popularComics
      .filter(c => c.title.toLowerCase().includes(q) || c.author.toLowerCase().includes(q))
      .map(c => ({
        id: c.id,
        title: c.title,
        description: `${c.desc} (8Muses catalog)`,
        coverUrl: c.cover,
        providerId: this.id,
        genres: c.genres
      }));
  }

  async getDetails(id: string): Promise<MangaDetails> {
    const found = this.popularComics.find(c => c.id === id);
    return {
      id,
      title: found?.title || id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      description: found?.desc || "8Muses did not return details for this title.",
      coverUrl: found?.cover,
      authors: found ? [found.author] : [],
      status: found ? "Catalogado" : undefined,
      providerId: this.id,
      genres: found?.genres || ["Adulto"]
    };
  }

  async getChapters(id: string): Promise<Chapter[]> {
    if (!this.popularComics.some(c => c.id === id)) return [];
    return [];
  }

  async getPages(_chapterId: string): Promise<Page[]> {
    return [];
  }

  async getCatalog(_listType: "popular" | "latest"): Promise<SearchResult[]> {
    return this.popularComics.map(c => ({
      id: c.id,
      title: c.title,
      description: `${c.desc} (8Muses catalog)`,
      coverUrl: c.cover,
      providerId: this.id,
      genres: c.genres
    }));
  }
}
