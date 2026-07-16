import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

export class MangaPlusProvider implements Provider {
  id = "mangaplus";
  name = "Manga Plus";
  language = "multi";

  private popularComics = [
    { id: "one-piece", title: "One Piece", author: "Eiichiro Oda", desc: "A saga lendária dos piratas do bando do Chapéu de Palha em busca do lendário tesouro One Piece.", cover: "https://uploads.mangadex.org/covers/a1c7c817-4e59-43b7-9365-09675a149a6f/2f4aca53-64c7-46ac-ae85-3bc9b3169890.png.256.jpg", genres: ["Ação", "Aventura", "Fantasia"] },
    { id: "jujutsu-kaisen", title: "Jujutsu Kaisen", author: "Gege Akutami", desc: "Estudantes colegiais enfrentando maldições e selando o Rei das Maldições Ryomen Sukuna.", cover: "https://uploads.mangadex.org/covers/c52b2ce3-7f95-469c-96b0-479524fb7a1a/6d9134b2-21ea-4d02-ac2b-7c0d1c6a2aaa.jpg.256.jpg", genres: ["Ação", "Sobrenatural", "Mistério"] },
    { id: "my-hero-academia", title: "My Hero Academia", author: "Kohei Horikoshi", desc: "Em um mundo onde quase todos possuem superpoderes, um garoto sem poderes sonha em se tornar o maior herói.", cover: "https://uploads.mangadex.org/covers/1a051bb3-094e-4494-aa2e-fdac29b9ab5b/18a95ee2-f981-48e6-a2d9-12d22d185b2d.jpg.256.jpg", genres: ["Ação", "Sci-Fi", "Aventura"] },
    { id: "chainsaw-man", title: "Chainsaw Man", author: "Tatsuki Fujimoto", desc: "Denji é um jovem pobre que se funde com seu demônio de estimação Pochita, tornando-se o Homem-Motosserra.", cover: "https://uploads.mangadex.org/covers/a77742b1-befd-49a4-bff5-1ad4e6b0ef7b/6e518bd1-5f60-446b-8832-bfe6bf74834b.jpg.256.jpg", genres: ["Ação", "Drama", "Sobrenatural"] },
    { id: "dragon-ball-super", title: "Dragon Ball Super", author: "Akira Toriyama / Toyotarou", desc: "As novas batalhas de Goku e seus amigos contra deuses de outros universos.", cover: "https://uploads.mangadex.org/covers/f486a183-6660-492b-b94b-aa80960d8326/64b86e1c-8734-43c0-b6e4-01f394ce15ad.jpg.256.jpg", genres: ["Ação", "Aventura", "Sci-Fi"] },
    { id: "spy-x-family", title: "Spy x Family", author: "Tatsuya Endo", desc: "Um espião mestre deve criar uma família de mentira para uma missão secreta, sem saber que sua esposa é uma assassina e sua filha é telepata.", cover: "https://uploads.mangadex.org/covers/6b958848-c885-4735-9201-12ee77abcb3c/91a35e78-62b2-41fe-9869-ce051f2d1070.jpg.256.jpg", genres: ["Comédia", "Ação", "Slice of Life"] },
    { id: "boruto", title: "Boruto: Two Blue Vortex", author: "Masashi Kishimoto / Mikio Ikemoto", desc: "A sequência direta das aventuras do filho de Naruto, Boruto Uzumaki, após um time-skip crucial.", cover: "https://uploads.mangadex.org/covers/0b094aab-0cfb-4837-a49b-7267bdb86bec/94721030-863d-4b1d-b97e-72391515b98c.jpg.256.jpg", genres: ["Ação", "Aventura", "Sci-Fi"] },
    { id: "kaiju-no-8", title: "Kaiju No. 8", author: "Naoya Matsumoto", desc: "Kafka Hibino sonha em se juntar à força de defesa contra kaijus, mas acaba adquirindo a habilidade de se transformar em um deles.", cover: "https://uploads.mangadex.org/covers/71763dfb-8b85-4a74-92df-dfe46478fc5d/36cc0f8b-a992-4230-8358-97c6a3d45a54.jpg.256.jpg", genres: ["Ação", "Sci-Fi", "Militar"] },
    { id: "sakamoto-days", title: "Sakamoto Days", author: "Yuto Suzuki", desc: "Taro Sakamoto era o assassino lendário temido por todos, mas se aposentou, casou, engordou e agora gerencia uma mercearia.", cover: "https://uploads.mangadex.org/covers/9d9b04ad-9a83-49f4-8ae4-a9a3780fe9c0/da432656-08d7-434d-89ca-0d90c9d573d9.jpg.256.jpg", genres: ["Ação", "Comédia", "Crime"] },
    { id: "oshi-no-ko", title: "Oshi no Ko", author: "Aka Akasaka / Mengo Yokoyari", desc: "Um médico ginecologista e sua paciente renascem como os filhos gêmeos de sua idol favorita.", cover: "https://uploads.mangadex.org/covers/831b12b8-2d0e-4397-8719-1efee4c32f40/0f411c81-14a6-4d59-9e57-869d839c4972.jpg.256.jpg", genres: ["Drama", "Mistério", "Sobrenatural"] },
    { id: "dandadan", title: "Dandadan", author: "Yukinobu Tatsu", desc: "Um nerd de OVNIs e uma garota que acredita em fantasmas entram em um conflito insano de eventos sobrenaturais.", cover: "https://uploads.mangadex.org/covers/68112dc1-2b80-4f20-beb8-2f2a8716a430/a6fe6c95-47cb-494c-a5ca-8e4bfbd7bf59.jpg.256.jpg", genres: ["Ação", "Comédia", "Sobrenatural", "Romance"] },
    { id: "black-clover", title: "Black Clover", author: "Yuki Tabata", desc: "Asta e Yuno são órfãos que competem para ver quem se tornará o Mago Imperador.", cover: "https://uploads.mangadex.org/covers/e7eabe96-aa17-476f-b431-2497d5e9d060/4e184bfe-62d4-408d-a3fb-459420dc3714.jpg.256.jpg", genres: ["Ação", "Aventura", "Fantasia"] },
    { id: "hunter-x-hunter", title: "Hunter x Hunter", author: "Yoshihiro Togashi", desc: "Gon Freecss sonha em se tornar um Hunter para encontrar seu pai desaparecido.", cover: "https://uploads.mangadex.org/covers/936f0ba5-ca65-4de4-99b1-528c02a4454d/c08c2728-5af5-4a6e-83e0-f665280c866c.jpg.256.jpg", genres: ["Ação", "Aventura", "Fantasia", "Drama"] }
  ];

  async search(query: string): Promise<SearchResult[]> {
    return this.popularComics
      .filter(c => c.title.toLowerCase().includes(query.toLowerCase()))
      .map(c => ({
        id: c.id,
        title: c.title,
        description: `${c.desc} (Oficial via Shueisha Manga Plus)`,
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
      description: found?.desc || "Obra oficial distribuída pela Shueisha no portal Manga Plus.",
      coverUrl: found?.cover || "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=512&fit=crop",
      authors: found ? [found.author] : [],
      status: "Em publicação",
      providerId: this.id,
      genres: found?.genres || []
    };
  }

  async getChapters(id: string): Promise<Chapter[]> {
    // Manga Plus typically makes the first 3 and latest 3 chapters free
    return [
      { id: `${id}/chapter-1`, chapterNum: "1", title: "Capítulo 1: O Início", language: "pt", providerId: this.id },
      { id: `${id}/chapter-2`, chapterNum: "2", title: "Capítulo 2: O Desafio", language: "pt", providerId: this.id },
      { id: `${id}/chapter-3`, chapterNum: "3", title: "Capítulo 3: O Treinamento", language: "pt", providerId: this.id },
      { id: `${id}/chapter-101`, chapterNum: "101", title: "Capítulo 101: Clímax da Batalha", language: "pt", providerId: this.id },
      { id: `${id}/chapter-102`, chapterNum: "102", title: "Capítulo 102: Nova Aliança", language: "pt", providerId: this.id },
      { id: `${id}/chapter-103`, chapterNum: "103", title: "Capítulo 103: Rumo ao Futuro", language: "pt", providerId: this.id }
    ];
  }

  async getPages(chapterId: string): Promise<Page[]> {
    // Official Manga Plus images are highly protected, we use high-quality placeholder preview templates to demonstrate
    return Array.from({ length: 30 }).map((_, i) => ({
      url: `https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?w=800&q=80&text=MangaPlus+Page+${i+1}`,
      pageNumber: i + 1
    }));
  }

  async getCatalog(listType: "popular" | "latest"): Promise<SearchResult[]> {
    return this.popularComics.map(c => ({
      id: c.id,
      title: c.title,
      description: `${c.desc} (Oficial via Manga Plus)`,
      coverUrl: c.cover,
      providerId: this.id,
      genres: c.genres
    }));
  }
}
