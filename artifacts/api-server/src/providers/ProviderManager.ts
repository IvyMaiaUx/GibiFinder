import { Provider, UnifiedSearchResult, MangaDetails, Chapter, Page } from "./types";
import { MangaDexProvider } from "./MangaDexProvider";
import { ComicExtraProvider } from "./ComicExtraProvider";
import { MangaPlusProvider } from "./MangaPlusProvider";
import { MangaFireProvider } from "./MangaFireProvider";
import { MugiwarasProvider } from "./MugiwarasProvider";
import { MadaraProvider } from "./MadaraProvider";
import { EightMusesProvider } from "./EightMusesProvider";
import { NHentaiProvider } from "./NHentaiProvider";
import { WordPressComicProvider } from "./WordPressComicProvider";
import * as fs from "fs";
import * as path from "path";

class StubProvider implements Provider {
  constructor(public id: string, public name: string, public language: string) {}
  async search() { return []; }
  async getDetails() { return { id: "", title: "", providerId: this.id }; }
  async getChapters() { return []; }
  async getPages() { return []; }
  async getCatalog() { return []; }
}

export class ProviderManager {
  private static providers: Map<string, Provider> = new Map();
  private static adultProviderIds = new Set([
    "eightmuses",
    "hentai-home",
    "hentai-fox",
    "hentai2read",
    "hq-desejo",
    "insta-hentai",
    "mega-hentai",
    "my-manga-comics",
    "nhentai",
    "quadrinhos-de-sexo",
    "quadrinhos-eroticos",
    "universo-hentai",
    "hentai-teca",
    "sombras-de-hentai"
  ]);
  private static adultTerms = [
    "adulto",
    "adult",
    "doujinshi",
    "ecchi",
    "erotic",
    "erotica",
    "erotico",
    "erótico",
    "hentai",
    "incesto",
    "milf",
    "nsfw",
    "porn",
    "pornografico",
    "pornográfico",
    "sacana",
    "sexo",
    "uncensored"
  ];
  private static activeStates: Map<string, boolean> = new Map([
    ["mangadex", true],
    ["comicextra", true],
    ["mangaplus", true],
    ["mangafire", true],
    ["mugiwaras", true],
    ["eightmuses", true],
    ["nhentai", true],
    ["bato", false],
    ["hqnow", false]
  ]);

  private static getCustomProvidersPath(): string {
    return path.join(process.cwd(), "custom_providers.json");
  }

  static loadCustomProviders() {
    try {
      const filePath = this.getCustomProvidersPath();
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        const list = JSON.parse(content) as Array<{ id: string; name: string; language: string; baseUrl: string; active?: boolean; engine?: string }>;
        for (const item of list) {
          const provider = item.engine === "wordpress-comic"
            ? new WordPressComicProvider(item.id, item.name, item.language, item.baseUrl)
            : new MadaraProvider(item.id, item.name, item.language, item.baseUrl);
          this.registerProvider(provider);
          this.activeStates.set(item.id, item.active !== false);
        }
      }
    } catch (err) {
      console.error("Failed to load custom providers:", err);
    }
  }

  static {
    // Register active providers
    this.registerProvider(new MangaDexProvider());
    this.registerProvider(new ComicExtraProvider());
    this.registerProvider(new MangaPlusProvider());
    this.registerProvider(new MangaFireProvider());
    this.registerProvider(new MugiwarasProvider());
    this.registerProvider(new EightMusesProvider());
    this.registerProvider(new NHentaiProvider());
    
    // Register stub/future providers
    this.registerProvider(new StubProvider("bato", "Bato", "multi"));
    this.registerProvider(new StubProvider("hqnow", "HQ Now", "pt"));

    // Load custom providers
    this.loadCustomProviders();
  }

  static registerProvider(provider: Provider) {
    this.providers.set(provider.id, provider);
  }

  static getProvider(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  static toggleProvider(id: string, active: boolean) {
    if (this.providers.has(id)) {
      this.activeStates.set(id, active);

      // Persist toggled state for custom providers
      try {
        const filePath = this.getCustomProvidersPath();
        if (fs.existsSync(filePath)) {
          const list = JSON.parse(fs.readFileSync(filePath, "utf-8")) as any[];
          const itemIndex = list.findIndex(item => item.id === id);
          if (itemIndex > -1) {
            list[itemIndex].active = active;
            fs.writeFileSync(filePath, JSON.stringify(list, null, 2), "utf-8");
          }
        }
      } catch (err) {
        console.error("Failed to persist toggle state for custom provider:", err);
      }
    }
  }

  static addCustomProvider(name: string, language: string, baseUrl: string): Provider {
    const id = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .trim();

    if (this.providers.has(id)) {
      throw new Error("Já existe um provedor com este nome/identificador.");
    }

    const provider = new MadaraProvider(id, name, language, baseUrl);
    this.registerProvider(provider);
    this.activeStates.set(id, true);

    try {
      const filePath = this.getCustomProvidersPath();
      let list: any[] = [];
      if (fs.existsSync(filePath)) {
        list = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      }
      list.push({ id, name, language, baseUrl, active: true });
      fs.writeFileSync(filePath, JSON.stringify(list, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to save custom provider:", err);
    }

    return provider;
  }

  static deleteCustomProvider(id: string) {
    if (!this.providers.has(id)) return;
    this.providers.delete(id);
    this.activeStates.delete(id);

    try {
      const filePath = this.getCustomProvidersPath();
      if (fs.existsSync(filePath)) {
        let list = JSON.parse(fs.readFileSync(filePath, "utf-8")) as any[];
        list = list.filter(item => item.id !== id);
        fs.writeFileSync(filePath, JSON.stringify(list, null, 2), "utf-8");
      }
    } catch (err) {
      console.error("Failed to delete custom provider:", err);
    }
  }

  static listProviders() {
    return Array.from(this.providers.values()).map(p => ({
      id: p.id,
      name: p.name,
      language: p.language,
      active: this.activeStates.get(p.id) === true,
      isCustom: p instanceof MadaraProvider || p instanceof WordPressComicProvider,
      engine: p instanceof WordPressComicProvider ? "WordPress Comic" : p instanceof MadaraProvider ? "Madara/WordPress" : "Nativo",
      baseUrl: p instanceof MadaraProvider || p instanceof WordPressComicProvider ? p.baseUrl : undefined
    }));
  }

  // Normalizes a string to compare titles (e.g. "One Piece" -> "onepiece")
  private static normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/[^\w\s]/g, "") // remove special characters
      .replace(/\s+/g, "") // remove spaces
      .trim();
  }

  private static normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  static isAdultProvider(id: string): boolean {
    return this.adultProviderIds.has(id);
  }

  static isAdultQuery(query: string): boolean {
    const normalized = this.normalizeText(query);
    return this.adultTerms.some(term => normalized.includes(this.normalizeText(term)));
  }

  private static isAdultResult(result: { title?: string; providerId?: string; genres?: string[]; sources?: { providerId: string }[] }): boolean {
    if (result.providerId && this.isAdultProvider(result.providerId)) return true;
    if (result.sources?.some(source => this.isAdultProvider(source.providerId))) return true;

    const searchable = [
      result.title || "",
      ...(result.genres || [])
    ].map(text => this.normalizeText(text));

    return searchable.some(text => this.adultTerms.some(term => text.includes(this.normalizeText(term))));
  }

  private static stripAdultSources(result: UnifiedSearchResult): UnifiedSearchResult | null {
    const adultSources = result.sources.filter(source => this.isAdultProvider(source.providerId));
    const safeSources = result.sources.filter(source => !this.isAdultProvider(source.providerId));

    if (adultSources.length > 0 && safeSources.length > 0) {
      const safeGenres = (result.genres || []).filter(genre => {
        const normalized = this.normalizeText(genre);
        return !this.adultTerms.some(term => normalized.includes(this.normalizeText(term)));
      });

      return {
        ...result,
        sources: safeSources,
        genres: safeGenres.length > 0 ? safeGenres : undefined,
        isAdult: false
      };
    }

    if (this.isAdultResult(result)) return null;

    return {
      ...result,
      isAdult: false
    };
  }

  private static getSearchRelevance(query: string, result: UnifiedSearchResult): number {
    const title = this.normalizeText(result.title || "");
    const phrase = this.normalizeText(query).trim();
    const compactTitle = title.replace(/\s+/g, "");
    const compactPhrase = phrase.replace(/\s+/g, "");
    const terms = this.getSearchTerms(query);
    const titleWords = title.split(/[^a-z0-9]+/i).filter(Boolean);

    let score = 0;
    if (phrase && title === phrase) score += 500;
    if (compactPhrase && compactTitle === compactPhrase) score += 450;
    if (phrase && title.includes(phrase)) score += 260;
    if (compactPhrase && compactTitle.includes(compactPhrase)) score += 220;
    if (phrase && phrase.includes(title) && title.length > 4) score += 80;

    for (const term of terms) {
      const variants = this.getTermVariants(term);
      const exactWord = titleWords.some(word => variants.includes(word));
      const prefixWord = titleWords.some(word => variants.some(variant => word.startsWith(variant) || variant.startsWith(word)));
      const partial = variants.some(variant => title.includes(variant));

      if (exactWord) score += 40;
      else if (prefixWord) score += 24;
      else if (partial) score += 12;
    }

    score += Math.min(result.sources.length, 5) * 3;
    return score;
  }

  private static getSearchTerms(query: string): string[] {
    const stopWords = new Set([
      "and",
      "das",
      "de",
      "del",
      "der",
      "do",
      "dos",
      "for",
      "las",
      "les",
      "los",
      "the",
      "uma",
      "uns"
    ]);

    return this.normalizeText(query)
      .split(/[^a-z0-9]+/i)
      .map(term => term.trim())
      .filter(term => term.length > 2 && !stopWords.has(term));
  }

  private static getTermVariants(term: string): string[] {
    const variants = new Set([term]);

    if (term.endsWith("s") && term.length > 4) {
      variants.add(term.slice(0, -1));
    } else if (term.length > 3) {
      variants.add(`${term}s`);
    }

    if (term.endsWith("ies") && term.length > 5) {
      variants.add(`${term.slice(0, -3)}y`);
    }
    if (term.endsWith("y") && term.length > 3) {
      variants.add(`${term.slice(0, -1)}ies`);
    }

    return Array.from(variants);
  }

  private static titleMatchesTerm(title: string, term: string): boolean {
    const titleWords = title.split(/[^a-z0-9]+/i).filter(Boolean);
    const variants = this.getTermVariants(term);
    return titleWords.some(word => variants.includes(word)) ||
      variants.some(variant => title.includes(variant));
  }

  private static isRelevantSearchResult(query: string, result: UnifiedSearchResult): boolean {
    const terms = this.getSearchTerms(query);
    if (terms.length <= 1) return true;

    const title = this.normalizeText(result.title || "");
    const compactTitle = title.replace(/\s+/g, "");
    const phrase = this.normalizeText(query).trim();
    const compactPhrase = phrase.replace(/\s+/g, "");

    if (phrase && title.includes(phrase)) return true;
    if (compactPhrase && compactTitle.includes(compactPhrase)) return true;

    if (terms.includes("familia") && terms.includes("sacana")) {
      return (title.includes("familia") && title.includes("sacana")) || title.includes("sacanas");
    }

    const termMatches = terms.map(term => this.titleMatchesTerm(title, term));

    if (termMatches.every(Boolean)) return true;
    if (terms.length <= 2) return false;

    const matchedCount = termMatches.filter(Boolean).length;
    const coverage = matchedCount / terms.length;
    const hasDistinctiveTerm = terms.some(term => term.length >= 5 && this.titleMatchesTerm(title, term));

    return hasDistinctiveTerm && coverage >= 0.67;
  }

  // Searches all active providers simultaneously and unifies results
  static async search(query: string, nsfw?: boolean): Promise<UnifiedSearchResult[]> {
    return (await this.searchWithMetadata(query, nsfw)).results;
  }

  static async searchWithMetadata(query: string, nsfw?: boolean): Promise<{ results: UnifiedSearchResult[]; hiddenAdultCount: number; adultQuery: boolean }> {
    const activeProviders = Array.from(this.providers.values()).filter(
      p => this.activeStates.get(p.id) === true
    );
    const searchPromises = activeProviders.map(p => 
      p.search(query, nsfw).catch(err => {
        console.error(`Error searching provider ${p.name}:`, err);
        return [];
      })
    );

    const resultsArray = await Promise.all(searchPromises);
    const flatResults = resultsArray.flat();

    // Group by normalized title
    const groups: Map<string, UnifiedSearchResult> = new Map();

    for (const result of flatResults) {
      if (!result || !result.title) continue;
      const norm = this.normalizeTitle(result.title);
      if (!norm) continue;

      const existing = groups.get(norm);
      if (existing) {
        // Add as a source if it doesn't already exist
        const alreadyLinked = existing.sources.some(
          s => s.providerId === result.providerId && s.id === result.id
        );
        if (!alreadyLinked) {
          existing.sources.push({
            providerId: result.providerId,
            id: result.id,
            title: result.title
          });
        }
        // Fill coverUrl or description if missing
        if (!existing.coverUrl && result.coverUrl) {
          existing.coverUrl = result.coverUrl;
        }
        if (!existing.description && result.description) {
          existing.description = result.description;
        }
        if (!existing.genres && result.genres) {
          existing.genres = result.genres;
        } else if (existing.genres && result.genres) {
          existing.genres = Array.from(new Set([...existing.genres, ...result.genres]));
        }
        existing.isAdult = this.isAdultResult(existing) || this.isAdultResult(result);
      } else {
        // Create new group
        const groupId = `${norm}_group`;
        groups.set(norm, {
          id: groupId,
          title: result.title, // keep the original title
          coverUrl: result.coverUrl,
          description: result.description,
          genres: result.genres,
          isAdult: this.isAdultResult(result),
          sources: [{
            providerId: result.providerId,
            id: result.id,
            title: result.title
          }]
        });
      }
    }

    const allResults = Array.from(groups.values()).map(result => ({
      ...result,
      isAdult: this.isAdultResult(result)
    }));
    const relevantResults = allResults.filter(result => this.isRelevantSearchResult(query, result));
    const visibleResults = (nsfw
      ? relevantResults
      : relevantResults
        .map(result => this.stripAdultSources(result))
        .filter((result): result is UnifiedSearchResult => result !== null))
      .sort((a, b) => this.getSearchRelevance(query, b) - this.getSearchRelevance(query, a));

    const hiddenAdultCount = nsfw
      ? 0
      : relevantResults.filter(result => this.stripAdultSources(result) === null).length;

    return {
      results: visibleResults,
      hiddenAdultCount,
      adultQuery: this.isAdultQuery(query)
    };
  }

  static async getDetails(providerId: string, id: string): Promise<MangaDetails> {
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    return provider.getDetails(id);
  }

  static async getChapters(providerId: string, id: string): Promise<Chapter[]> {
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    return provider.getChapters(id);
  }

  static async getPages(providerId: string, chapterId: string): Promise<Page[]> {
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    return provider.getPages(chapterId);
  }

  static async getCatalog(listType: "popular" | "latest", nsfw?: boolean): Promise<UnifiedSearchResult[]> {
    const activeProviders = Array.from(this.providers.values()).filter(
      p => this.activeStates.get(p.id) === true
    );

    const catalogPromises = activeProviders.map(p => 
      p.getCatalog(listType, nsfw).catch(err => {
        console.error(`Error loading catalog from ${p.name}:`, err);
        return [];
      })
    );

    const resultsArray = await Promise.all(catalogPromises);
    const flatResults = resultsArray.flat();

    const groups: Map<string, UnifiedSearchResult> = new Map();

    for (const result of flatResults) {
      if (!result || !result.title) continue;
      const norm = this.normalizeTitle(result.title);
      if (!norm) continue;

      const existing = groups.get(norm);
      if (existing) {
        const alreadyLinked = existing.sources.some(
          s => s.providerId === result.providerId && s.id === result.id
        );
        if (!alreadyLinked) {
          existing.sources.push({
            providerId: result.providerId,
            id: result.id,
            title: result.title
          });
        }
        if (!existing.coverUrl && result.coverUrl) {
          existing.coverUrl = result.coverUrl;
        }
        if (!existing.description && result.description) {
          existing.description = result.description;
        }
        if (!existing.genres && result.genres) {
          existing.genres = result.genres;
        } else if (existing.genres && result.genres) {
          existing.genres = Array.from(new Set([...existing.genres, ...result.genres]));
        }
        existing.isAdult = this.isAdultResult(existing) || this.isAdultResult(result);
      } else {
        const groupId = `${norm}_group`;
        groups.set(norm, {
          id: groupId,
          title: result.title,
          coverUrl: result.coverUrl,
          description: result.description,
          genres: result.genres,
          isAdult: this.isAdultResult(result),
          sources: [{
            providerId: result.providerId,
            id: result.id,
            title: result.title
          }]
        });
      }
    }

    const allResults = Array.from(groups.values()).map(result => ({
      ...result,
      isAdult: this.isAdultResult(result)
    }));

    return nsfw ? allResults.filter(result => result.isAdult) : allResults.filter(result => !result.isAdult);
  }
}
