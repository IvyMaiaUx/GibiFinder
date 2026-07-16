import { Provider, SearchResult, MangaDetails, Chapter, Page } from "./types";

export class MangaPlusProvider implements Provider {
  id = "mangaplus";
  name = "Manga Plus";
  language = "multi";

  private popularComics = [
    { id: "one-piece", title: "One Piece", author: "Eiichiro Oda", desc: "A saga lendária dos piratas do bando do Chapéu de Palha em busca do lendário tesouro One Piece.", cover: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=256&fit=crop", genres: ["Ação", "Aventura", "Fantasia"] },
    { id: "jujutsu-kaisen", title: "Jujutsu Kaisen", author: "Gege Akutami", desc: "Estudantes colegiais enfrentando maldições e selando o Rei das Maldições Ryomen Sukuna.", cover: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=256&fit=crop", genres: ["Ação", "Sobrenatural", "Mistério"] },
    { id: "my-hero-academia", title: "My Hero Academia", author: "Kohei Horikoshi", desc: "Em um mundo onde quase todos possuem superpoderes, um garoto sem poderes sonha em se tornar o maior herói.", cover: "https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?w=256&fit=crop", genres: ["Ação", "Sci-Fi", "Aventura"] },
    { id: "chainsaw-man", title: "Chainsaw Man", author: "Tatsuki Fujimoto", desc: "Denji é um jovem pobre que se funde com seu demônio de estimação Pochita, tornando-se o Homem-Motosserra.", cover: "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop", genres: ["Ação", "Drama", "Sobrenatural"] },
    { id: "dragon-ball-super", title: "Dragon Ball Super", author: "Akira Toriyama / Toyotarou", desc: "As novas batalhas de Goku e seus amigos contra deuses de outros universos.", cover: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=256&fit=crop", genres: ["Ação", "Aventura", "Sci-Fi"] },
    { id: "spy-x-family", title: "Spy x Family", author: "Tatsuya Endo", desc: "Um espião mestre deve criar uma família de mentira para uma missão secreta, sem saber que sua esposa é uma assassina e sua filha é telepata.", cover: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=256&fit=crop", genres: ["Comédia", "Ação", "Slice of Life"] },
    { id: "boruto", title: "Boruto: Two Blue Vortex", author: "Masashi Kishimoto / Mikio Ikemoto", desc: "A sequência direta das aventuras do filho de Naruto, Boruto Uzumaki, após um time-skip crucial.", cover: "https://images.unsplash.com/photo-1501183007986-d0d080b147f9?w=256&fit=crop", genres: ["Ação", "Aventura", "Sci-Fi"] },
    { id: "kaiju-no-8", title: "Kaiju No. 8", author: "Naoya Matsumoto", desc: "Kafka Hibino sonha em se juntar à força de defesa contra kaijus, mas acaba adquirindo a habilidade de se transformar em um deles.", cover: "https://images.unsplash.com/photo-1534972195531-d756b9bda9f2?w=256&fit=crop", genres: ["Ação", "Sci-Fi", "Militar"] },
    { id: "sakamoto-days", title: "Sakamoto Days", author: "Yuto Suzuki", desc: "Taro Sakamoto era o assassino lendário temido por todos, mas se aposentou, casou, engordou e agora gerencia uma mercearia.", cover: "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=256&fit=crop", genres: ["Ação", "Comédia", "Crime"] },
    { id: "oshi-no-ko", title: "Oshi no Ko", author: "Aka Akasaka / Mengo Yokoyari", desc: "Um médico ginecologista e sua paciente renascem como os filhos gêmeos de sua idol favorita.", cover: "https://images.unsplash.com/photo-1580477667995-2b94f01c9516?w=256&fit=crop", genres: ["Drama", "Mistério", "Sobrenatural"] },
    { id: "dandadan", title: "Dandadan", author: "Yukinobu Tatsu", desc: "Um nerd de OVNIs e uma garota que acredita em fantasmas entram em um conflito insano de eventos sobrenaturais.", cover: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=256&fit=crop", genres: ["Ação", "Comédia", "Sobrenatural", "Romance"] },
    { id: "black-clover", title: "Black Clover", author: "Yuki Tabata", desc: "Asta e Yuno são órfãos que competem para ver quem se tornará o Mago Imperador.", cover: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=256&fit=crop", genres: ["Ação", "Aventura", "Fantasia"] },
    { id: "hunter-x-hunter", title: "Hunter x Hunter", author: "Yoshihiro Togashi", desc: "Gon Freecss sonha em se tornar um Hunter para encontrar seu pai desaparecido.", cover: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=256&fit=crop", genres: ["Ação", "Aventura", "Fantasia", "Drama"] }
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
