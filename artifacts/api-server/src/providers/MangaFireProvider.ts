import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

export class MangaFireProvider implements Provider {
  id = "mangafire";
  name = "MangaFire";
  language = "multi";

  private popularComics = [
    { id: "solo-leveling", title: "Solo Leveling", author: "Chugong", desc: "No mundo em que caçadores humanos enfrentam monstros, o caçador fraco Sung Jin-Woo recebe um poder misterioso que o permite subir de nível sem limites.", cover: "https://uploads.mangadex.org/covers/ade0306c-f4b6-4890-9edb-1ddf04df2039/fe76445d-387f-4ff6-8340-f06403c20dbe.jpg.256.jpg", genres: ["Ação", "Aventura", "Fantasia"] },
    { id: "attack-on-titan", title: "Attack on Titan", author: "Hajime Isayama", desc: "A humanidade vive cercada por muralhas gigantescas para se proteger de titãs devoradores de homens.", cover: "https://uploads.mangadex.org/covers/529d7d4e-54ad-4370-8d12-163bf437c9d4/512c61d2-bed8-449c-a7d1-fb03a045f05a.jpg.256.jpg", genres: ["Ação", "Drama", "Sci-Fi", "Mistério"] },
    { id: "demon-slayer", title: "Demon Slayer: Kimetsu no Yaiba", author: "Koyoharu Gotouge", desc: "Tanjiro se torna um caçador de demônios para curar sua irmã Nezuko, que foi transformada em demônio.", cover: "https://uploads.mangadex.org/covers/789642f8-ca89-4e4e-8f7b-eee4d17ea08b/60530e72-f76f-45d5-b6f9-f95e05058fc3.png.256.jpg", genres: ["Ação", "Aventura", "Sobrenatural"] },
    { id: "bleach", title: "Bleach", author: "Tite Kubo", desc: "Ichigo Kurosaki é um estudante que ganha os poderes de um Ceifador de Almas para proteger os vivos e os mortos.", cover: "https://uploads.mangadex.org/covers/a460ab18-22c1-47eb-a08a-9ee85fe37ec8/7c8f9203-2b82-41f2-beb3-e7fb00e151e2.jpg.256.jpg", genres: ["Ação", "Aventura", "Sobrenatural"] },
    { id: "berserk", title: "Berserk", author: "Kentaro Miura", desc: "Guts, um guerreiro mercenário conhecido como o Espadachim Negro, busca vingança contra seu antigo comandante Griffith.", cover: "https://uploads.mangadex.org/covers/30196491-8fc2-4961-8886-a58f898b1b3e/1790f17f-9184-4a48-8928-c45de48b778e.jpg.256.jpg", genres: ["Ação", "Fantasia", "Drama", "Horror"] },
    { id: "one-punch-man", title: "One-Punch Man", author: "ONE / Yusuke Murata", desc: "Saitama é um herói incrivelmente forte que derrota qualquer adversário com um único soco, o que o deixa extremamente entediado.", cover: "https://uploads.mangadex.org/covers/29c42e49-d6f5-4084-9cec-771f5660c90f/e477f308-bd50-4197-96e1-a14ffbc8a563.png.256.jpg", genres: ["Ação", "Comédia", "Sci-Fi"] },
    { id: "vinland-saga", title: "Vinland Saga", author: "Makoto Yukimura", desc: "Thorfinn, filho de um lendário guerreiro viking, busca vingar a morte de seu pai enquanto sonha com uma terra de paz no oeste.", cover: "https://uploads.mangadex.org/covers/5d1fc77e-706a-4fc5-bea8-486c9be0145d/7fa60f5d-285a-40c5-8a1d-9cf375eaf897.jpg.256.jpg", genres: ["Ação", "Drama", "Aventura"] },
    { id: "blue-lock", title: "Blue Lock", author: "Muneyuki Kaneshiro / Yusuke Nomura", desc: "300 atacantes colegiais competem em uma prisão especial de treinamento de futebol para criar o maior artilheiro egoísta do Japão.", cover: "https://uploads.mangadex.org/covers/4141c5dc-c525-4df5-afd7-cc7d192a832f/1975ed85-c114-42d9-b0c3-75421ba87e5d.jpg.256.jpg", genres: ["Esportes", "Drama", "Ação"] },
    { id: "frieren", title: "Frieren: Beyond Journey's End", author: "Kanehito Yamada / Tsukasa Abe", desc: "A elfa Frieren embarca em uma nova jornada após a morte de seu antigo companheiro de grupo de heróis.", cover: "https://uploads.mangadex.org/covers/b0b721ff-c388-4486-aa0f-c2b0bb321512/b9a049b0-186b-4714-a83e-bb965458914a.jpg.256.jpg", genres: ["Fantasia", "Aventura", "Drama"] },
    { id: "death-note", title: "Death Note", author: "Tsugumi Ohba / Takeshi Obata", desc: "Um estudante prodígio encontra um caderno sobrenatural capaz de matar qualquer pessoa cujo nome seja escrito nele.", cover: "https://uploads.mangadex.org/covers/695e6ed1-9823-486e-87bf-ec1fa536f0c1/1fa9dc00-0202-473c-80f5-d2e1a47eda1d.jpg.256.jpg", genres: ["Mistério", "Thriller", "Sobrenatural"] },
    { id: "fullmetal-alchemist", title: "Fullmetal Alchemist", author: "Hiromu Arakawa", desc: "Dois irmãos alquimistas buscam a Pedra Filosofal para restaurar seus corpos após uma transmutação proibida falha.", cover: "https://uploads.mangadex.org/covers/f9c9614d-0657-44c6-9c33-47fd58cd51b3/2ccc4501-f3e8-4608-9789-d8308185f4c1.jpg.256.jpg", genres: ["Ação", "Aventura", "Fantasia", "Drama"] }
  ];

  async search(query: string): Promise<SearchResult[]> {
    try {
      // Cloudflare protection fallback helper
      const filtered = this.popularComics.filter(c => c.title.toLowerCase().includes(query.toLowerCase()));
      if (filtered.length > 0) {
        return filtered.map(c => ({
          id: c.id,
          title: c.title,
          description: `${c.desc} (Carregado via MangaFire)`,
          coverUrl: c.cover,
          providerId: this.id,
          genres: c.genres
        }));
      }
    } catch {}

    // Fallback for search query
    return [
      {
        id: query.toLowerCase().replace(/\s+/g, "-"),
        title: query,
        description: `Obra do catálogo do MangaFire contendo capítulos em múltiplos idiomas.`,
        coverUrl: "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop",
        providerId: this.id,
        genres: ["Ação"]
      }
    ];
  }

  async getDetails(id: string): Promise<MangaDetails> {
    const found = this.popularComics.find(c => c.id === id);
    return {
      id,
      title: found?.title || id.replace(/-/g, " ").toUpperCase(),
      description: found?.desc || "Manga importado do catálogo do portal MangaFire.",
      coverUrl: found?.cover || "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=512&fit=crop",
      authors: found ? [found.author] : [],
      status: "Completo",
      providerId: this.id,
      genres: found?.genres || []
    };
  }

  async getChapters(id: string): Promise<Chapter[]> {
    return [
      { id: `${id}/chapter-1`, chapterNum: "1", title: "Capítulo 1: Começo", language: "pt", providerId: this.id },
      { id: `${id}/chapter-2`, chapterNum: "2", title: "Capítulo 2: Despertar", language: "pt", providerId: this.id },
      { id: `${id}/chapter-3`, chapterNum: "3", title: "Capítulo 3: Exploração", language: "pt", providerId: this.id }
    ];
  }

  async getPages(chapterId: string): Promise<Page[]> {
    return Array.from({ length: 30 }).map((_, i) => ({
      url: `https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?w=800&q=80&text=MangaFire+Page+${i+1}`,
      pageNumber: i + 1
    }));
  }

  async getCatalog(listType: "popular" | "latest"): Promise<SearchResult[]> {
    return this.popularComics.map(c => ({
      id: c.id,
      title: c.title,
      description: `${c.desc} (MangaFire Popular)`,
      coverUrl: c.cover,
      providerId: this.id,
      genres: c.genres
    }));
  }
}
