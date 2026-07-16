import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

export class MangaFireProvider implements Provider {
  id = "mangafire";
  name = "MangaFire";
  language = "multi";

  private popularComics = [
    { id: "solo-leveling", title: "Solo Leveling", author: "Chugong", desc: "A hunter gains a mysterious power that lets him level up without limits.", cover: "https://uploads.mangadex.org/covers/ade0306c-f4b6-4890-9edb-1ddf04df2039/fe76445d-387f-4ff6-8340-f06403c20dbe.jpg.256.jpg", genres: ["Acao", "Aventura", "Fantasia"] },
    { id: "attack-on-titan", title: "Attack on Titan", author: "Hajime Isayama", desc: "Humanity lives behind giant walls to survive titans.", cover: "https://uploads.mangadex.org/covers/529d7d4e-54ad-4370-8d12-163bf437c9d4/512c61d2-bed8-449c-a7d1-fb03a045f05a.jpg.256.jpg", genres: ["Acao", "Drama", "Sci-Fi"] },
    { id: "demon-slayer", title: "Demon Slayer: Kimetsu no Yaiba", author: "Koyoharu Gotouge", desc: "Tanjiro becomes a demon slayer to save his sister.", cover: "https://uploads.mangadex.org/covers/789642f8-ca89-4e4e-8f7b-eee4d17ea08b/60530e72-f76f-45d5-b6f9-f95e05058fc3.png.256.jpg", genres: ["Acao", "Aventura", "Sobrenatural"] },
    { id: "bleach", title: "Bleach", author: "Tite Kubo", desc: "Ichigo gains the powers of a Soul Reaper.", cover: "https://uploads.mangadex.org/covers/a460ab18-22c1-47eb-a08a-9ee85fe37ec8/7c8f9203-2b82-41f2-beb3-e7fb00e151e2.jpg.256.jpg", genres: ["Acao", "Aventura", "Sobrenatural"] },
    { id: "berserk", title: "Berserk", author: "Kentaro Miura", desc: "Guts seeks revenge in a dark fantasy world.", cover: "https://uploads.mangadex.org/covers/30196491-8fc2-4961-8886-a58f898b1b3e/1790f17f-9184-4a48-8928-c45de48b778e.jpg.256.jpg", genres: ["Acao", "Fantasia", "Drama", "Horror"] },
    { id: "one-punch-man", title: "One-Punch Man", author: "ONE / Yusuke Murata", desc: "Saitama defeats any enemy with one punch.", cover: "https://uploads.mangadex.org/covers/29c42e49-d6f5-4084-9cec-771f5660c90f/e477f308-bd50-4197-96e1-a14ffbc8a563.png.256.jpg", genres: ["Acao", "Comedia", "Sci-Fi"] },
    { id: "vinland-saga", title: "Vinland Saga", author: "Makoto Yukimura", desc: "Thorfinn seeks revenge and dreams of a peaceful land.", cover: "https://uploads.mangadex.org/covers/5d1fc77e-706a-4fc5-bea8-486c9be0145d/7fa60f5d-285a-40c5-8a1d-9cf375eaf897.jpg.256.jpg", genres: ["Acao", "Drama", "Aventura"] },
    { id: "blue-lock", title: "Blue Lock", author: "Muneyuki Kaneshiro / Yusuke Nomura", desc: "Strikers compete to become Japan's ultimate forward.", cover: "https://uploads.mangadex.org/covers/4141c5dc-c525-4df5-afd7-cc7d192a832f/1975ed85-c114-42d9-b0c3-75421ba87e5d.jpg.256.jpg", genres: ["Esportes", "Drama", "Acao"] },
    { id: "frieren", title: "Frieren: Beyond Journey's End", author: "Kanehito Yamada / Tsukasa Abe", desc: "An elf begins a new journey after her old party's victory.", cover: "https://uploads.mangadex.org/covers/b0b721ff-6f0c-47a0-bb2e-8393b4b05589/09c9e7fd-6f3a-44a0-b064-f2813ca6b7ed.jpg.256.jpg", genres: ["Fantasia", "Aventura", "Drama"] },
    { id: "death-note", title: "Death Note", author: "Tsugumi Ohba / Takeshi Obata", desc: "A student finds a supernatural notebook.", cover: "https://uploads.mangadex.org/covers/695e6ed1-9823-486e-87bf-ec1fa536f0c1/1fa9dc00-0202-473c-80f5-d2e1a47eda1d.jpg.256.jpg", genres: ["Misterio", "Thriller", "Sobrenatural"] },
    { id: "fullmetal-alchemist", title: "Fullmetal Alchemist", author: "Hiromu Arakawa", desc: "Two alchemist brothers seek the Philosopher's Stone.", cover: "https://uploads.mangadex.org/covers/f9c9614d-0657-44c6-9c33-47fd58cd51b3/2ccc4501-f3e8-4608-9789-d8308185f4c1.jpg.256.jpg", genres: ["Acao", "Aventura", "Fantasia", "Drama"] }
  ];

  async search(query: string): Promise<SearchResult[]> {
    const q = query.toLowerCase().trim();
    return this.popularComics
      .filter(c => c.title.toLowerCase().includes(q))
      .map(c => ({
        id: c.id,
        title: c.title,
        description: `${c.desc} (MangaFire catalog)`,
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
      description: found?.desc || "MangaFire did not return details for this title.",
      coverUrl: found?.cover,
      authors: found ? [found.author] : [],
      status: found ? "Catalogado" : undefined,
      providerId: this.id,
      genres: found?.genres || []
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
      description: `${c.desc} (MangaFire catalog)`,
      coverUrl: c.cover,
      providerId: this.id,
      genres: c.genres
    }));
  }
}
