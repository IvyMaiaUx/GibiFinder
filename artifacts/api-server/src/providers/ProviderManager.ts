import { Provider, UnifiedSearchResult, MangaDetails, Chapter, Page } from "./types";
import { MangaDexProvider } from "./MangaDexProvider";
import { ComicExtraProvider } from "./ComicExtraProvider";
import { MangaPlusProvider } from "./MangaPlusProvider";
import { MangaFireProvider } from "./MangaFireProvider";
import { MugiwarasProvider } from "./MugiwarasProvider";
import { MadaraProvider } from "./MadaraProvider";
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
  private static activeStates: Map<string, boolean> = new Map([
    ["mangadex", true],
    ["comicextra", true],
    ["mangaplus", true],
    ["mangafire", true],
    ["mugiwaras", true],
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
        const list = JSON.parse(content) as Array<{ id: string; name: string; language: string; baseUrl: string; active?: boolean }>;
        for (const item of list) {
          const provider = new MadaraProvider(item.id, item.name, item.language, item.baseUrl);
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
      isCustom: p instanceof MadaraProvider,
      baseUrl: p instanceof MadaraProvider ? (p as MadaraProvider).baseUrl : undefined
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

  // Searches all active providers simultaneously and unifies results
  static async search(query: string): Promise<UnifiedSearchResult[]> {
    const activeProviders = Array.from(this.providers.values()).filter(
      p => this.activeStates.get(p.id) === true
    );
    const searchPromises = activeProviders.map(p => 
      p.search(query).catch(err => {
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
      } else {
        // Create new group
        const groupId = `${norm}_group`;
        groups.set(norm, {
          id: groupId,
          title: result.title, // keep the original title
          coverUrl: result.coverUrl,
          description: result.description,
          sources: [{
            providerId: result.providerId,
            id: result.id,
            title: result.title
          }]
        });
      }
    }

    return Array.from(groups.values());
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

  static async getCatalog(listType: "popular" | "latest"): Promise<UnifiedSearchResult[]> {
    const activeProviders = Array.from(this.providers.values()).filter(
      p => this.activeStates.get(p.id) === true
    );

    const catalogPromises = activeProviders.map(p => 
      p.getCatalog(listType).catch(err => {
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
      } else {
        const groupId = `${norm}_group`;
        groups.set(norm, {
          id: groupId,
          title: result.title,
          coverUrl: result.coverUrl,
          description: result.description,
          sources: [{
            providerId: result.providerId,
            id: result.id,
            title: result.title
          }]
        });
      }
    }

    return Array.from(groups.values());
  }
}
