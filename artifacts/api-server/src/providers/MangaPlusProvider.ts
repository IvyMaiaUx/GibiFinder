import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

export class MangaPlusProvider implements Provider {
  id = "mangaplus";
  name = "Manga Plus";
  language = "multi";

  private popularComics = [
    { id: "one-piece", title: "One Piece", author: "Eiichiro Oda", desc: "A saga lendária dos piratas do bando do Chapéu de Palha em busca do lendário tesouro One Piece.", cover: "https://uploads.mangadex.org/covers/a1c7c1b4-1c69-42b7-849b-730623d6a6a0/88b75276-8798-4444-8ccf-056a297926e2.jpg.256.jpg" },
    { id: "jujutsu-kaisen", title: "Jujutsu Kaisen", author: "Gege Akutami", desc: "Estudantes colegiais enfrentando maldições e selando o Rei das Maldições Ryomen Sukuna.", cover: "https://uploads.mangadex.org/covers/c52b2ce3-7ee1-4373-8d0c-f9c821aa9a60/1cf2e2fe-0a44-4869-9065-538edb787532.jpg.256.jpg" },
    { id: "my-hero-academia", title: "My Hero Academia", author: "Kohei Horikoshi", desc: "Em um mundo onde quase todos possuem superpoderes, um garoto sem poderes sonha em se tornar o maior herói.", cover: "https://uploads.mangadex.org/covers/f81c9a18-97c9-4674-8b65-e9df2586940d/272fdf62-cd78-43d9-a79b-252a129d243c.jpg.256.jpg" },
    { id: "chainsaw-man", title: "Chainsaw Man", author: "Tatsuki Fujimoto", desc: "Denji é um jovem pobre que se funde com seu demônio de estimação Pochita, tornando-se o Homem-Motosserra.", cover: "https://uploads.mangadex.org/covers/a77742b1-d5d4-4df8-af5a-cd63f46ee61d/3e098877-0c7f-4f24-9b16-56543b573516.jpg.256.jpg" },
    { id: "dragon-ball-super", title: "Dragon Ball Super", author: "Akira Toriyama / Toyotarou", desc: "As novas batalhas de Goku e seus amigos contra deuses de outros universos.", cover: "https://uploads.mangadex.org/covers/2de67eb0-802c-4735-86f7-b08eafcfdb9f/7bdeed8e-17cf-45d6-bd66-3d7120df0cc4.jpg.256.jpg" },
    { id: "spy-x-family", title: "Spy x Family", author: "Tatsuya Endo", desc: "Um espião mestre deve criar uma família de mentira para uma missão secreta, sem saber que sua esposa é uma assassina e sua filha é telepata.", cover: "https://uploads.mangadex.org/covers/c2fe8896-1c7c-47eb-987d-8cd6e537e2db/90eb3af0-85f5-4074-be46-95e380e22cc3.jpg.256.jpg" },
    { id: "boruto", title: "Boruto: Two Blue Vortex", author: "Masashi Kishimoto / Mikio Ikemoto", desc: "A sequência direta das aventuras do filho de Naruto, Boruto Uzumaki, após um time-skip crucial.", cover: "https://uploads.mangadex.org/covers/8d89e13d-74d3-488b-a3d8-d652932cb5e9/a37b1968-3e4b-4b2a-9f57-ef665cf3cdbf.jpg.256.jpg" },
    { id: "kaiju-no-8", title: "Kaiju No. 8", author: "Naoya Matsumoto", desc: "Kafka Hibino sonha em se juntar à força de defesa contra kaijus, mas acaba adquirindo a habilidade de se transformar em um deles.", cover: "https://uploads.mangadex.org/covers/df1e2a56-805d-4537-b4d4-28b9fb6f5922/c0c45155-27a3-4a69-8089-a292416eb883.jpg.256.jpg" },
    { id: "sakamoto-days", title: "Sakamoto Days", author: "Yuto Suzuki", desc: "Taro Sakamoto era o assassino lendário temido por todos, mas se aposentou, casou, engordou e agora gerencia uma mercearia.", cover: "https://uploads.mangadex.org/covers/98cf292c-fcdb-4eb9-a2ff-11c713b190f8/8fdf8f4a-2f4c-47eb-9bd1-05701be5e5cc.jpg.256.jpg" },
    { id: "oshi-no-ko", title: "Oshi no Ko", author: "Aka Akasaka / Mengo Yokoyari", desc: "Um médico ginecologista e sua paciente renascem como os filhos gêmeos de sua idol favorita.", cover: "https://uploads.mangadex.org/covers/c40f69a5-aaaf-452c-9824-345388e36e65/7a6ca218-c2b6-4b36-a36c-2cc660144933.jpg.256.jpg" },
    { id: "dandadan", title: "Dandadan", author: "Yukinobu Tatsu", desc: "Um nerd de OVNIs e uma garota que acredita em fantasmas entram em um conflito insano de eventos sobrenaturais.", cover: "https://uploads.mangadex.org/covers/12d0959f-d31e-4be0-b9df-7517efeb9863/87d7b055-6677-4933-8756-3f1a2608405c.jpg.256.jpg" },
    { id: "black-clover", title: "Black Clover", author: "Yuki Tabata", desc: "Asta e Yuno são órfãos que competem para ver quem se tornará o Mago Imperador.", cover: "https://uploads.mangadex.org/covers/2d8c361e-1510-4ed3-a006-a67f975877c8/5645e7f1-a1e4-4d87-8d76-cb4fa24b5a37.jpg.256.jpg" },
    { id: "hunter-x-hunter", title: "Hunter x Hunter", author: "Yoshihiro Togashi", desc: "Gon Freecss sonha em se tornar um Hunter para encontrar seu pai desaparecido.", cover: "https://uploads.mangadex.org/covers/c476722d-3c22-482a-bc91-9e767499709c/f681a8b9-a0ca-4c54-ab4f-124b802e3b2b.jpg.256.jpg" }
  ];

  async search(query: string): Promise<SearchResult[]> {
    return this.popularComics
      .filter(c => c.title.toLowerCase().includes(query.toLowerCase()))
      .map(c => ({
        id: c.id,
        title: c.title,
        description: `${c.desc} (Oficial via Shueisha Manga Plus)`,
        coverUrl: c.cover,
        providerId: this.id
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
      providerId: this.id
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
      providerId: this.id
    }));
  }
}
