import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

export class MangaPlusProvider implements Provider {
  id = "mangaplus";
  name = "Manga Plus";
  language = "multi";

  private popularComics = [
    { id: "one-piece", title: "One Piece", author: "Eiichiro Oda", desc: "Official catalog entry for One Piece.", cover: "https://uploads.mangadex.org/covers/a1c7c817-4e59-43b7-9365-09675a149a6f/2f4aca53-64c7-46ac-ae85-3bc9b3169890.png.256.jpg", genres: ["Acao", "Aventura", "Fantasia"] },
    { id: "jujutsu-kaisen", title: "Jujutsu Kaisen", author: "Gege Akutami", desc: "Official catalog entry for Jujutsu Kaisen.", cover: "https://uploads.mangadex.org/covers/c52b2ce3-7f95-469c-96b0-479524fb7a1a/6d9134b2-21ea-4d02-ac2b-7c0d1c6a2aaa.jpg.256.jpg", genres: ["Acao", "Sobrenatural", "Misterio"] },
    { id: "my-hero-academia", title: "My Hero Academia", author: "Kohei Horikoshi", desc: "Official catalog entry for My Hero Academia.", cover: "https://uploads.mangadex.org/covers/1a051bb3-094e-4494-aa2e-fdac29b9ab5b/18a95ee2-f981-48e6-a2d9-12d22d185b2d.jpg.256.jpg", genres: ["Acao", "Sci-Fi", "Aventura"] },
    { id: "chainsaw-man", title: "Chainsaw Man", author: "Tatsuki Fujimoto", desc: "Official catalog entry for Chainsaw Man.", cover: "https://uploads.mangadex.org/covers/a77742b1-befd-49a4-bff5-1ad4e6b0ef7b/6e518bd1-5f60-446b-8832-bfe6bf74834b.jpg.256.jpg", genres: ["Acao", "Drama", "Sobrenatural"] },
    { id: "spy-x-family", title: "Spy x Family", author: "Tatsuya Endo", desc: "Official catalog entry for Spy x Family.", cover: "https://uploads.mangadex.org/covers/6b958848-c885-4735-9201-12ee77abcb3c/91a35e78-62b2-41fe-9869-ce051f2d1070.jpg.256.jpg", genres: ["Comedia", "Acao", "Slice of Life"] }
  ];

  async search(query: string): Promise<SearchResult[]> {
    const q = query.toLowerCase().trim();
    return this.popularComics
      .filter(c => c.title.toLowerCase().includes(q))
      .map(c => ({
        id: c.id,
        title: c.title,
        description: `${c.desc} (Manga Plus catalog)`,
        coverUrl: c.cover,
        providerId: this.id,
        genres: c.genres
      }));
  }

  async getDetails(id: string): Promise<MangaDetails> {
    const found = this.popularComics.find(c => c.id === id);
    return {
      id,
      title: found?.title || id.replace(/-/g, " ").toUpperCase(),
      description: found?.desc || "Manga Plus did not return details for this title.",
      coverUrl: found?.cover,
      authors: found ? [found.author] : [],
      status: found ? "Catalogado" : undefined,
      providerId: this.id,
      genres: found?.genres || []
    };
  }

  async getChapters(_id: string): Promise<Chapter[]> {
    return [];
  }

  async getPages(_chapterId: string): Promise<Page[]> {
    return [];
  }

  async getCatalog(_listType: "popular" | "latest"): Promise<SearchResult[]> {
    return this.popularComics.map(c => ({
      id: c.id,
      title: c.title,
      description: `${c.desc} (Manga Plus catalog)`,
      coverUrl: c.cover,
      providerId: this.id,
      genres: c.genres
    }));
  }
}
