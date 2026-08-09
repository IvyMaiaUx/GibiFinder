import { Provider, UnifiedSearchResult, SearchResult, MangaDetails, Chapter, Page } from "./types";
import { logger } from "../lib/logger";
import { MangaDexProvider } from "./MangaDexProvider";
import { ComicExtraProvider } from "./ComicExtraProvider";
import { MangaPlusProvider } from "./MangaPlusProvider";
import { MangaFireProvider } from "./MangaFireProvider";
import { MugiwarasProvider } from "./MugiwarasProvider";
import { MadaraProvider } from "./MadaraProvider";
import { EightMusesProvider } from "./EightMusesProvider";
import { NHentaiProvider } from "./NHentaiProvider";
import { OrionProvider } from "./OrionProvider";
import { WordPressComicProvider } from "./WordPressComicProvider";
import { SlimeReadProvider } from "./SlimeReadProvider";
import { CuratedComicsProvider } from "./CuratedComicsProvider";
import { InternetArchiveProvider } from "./InternetArchiveProvider";
import { supabase } from "../lib/supabase";
import * as fs from "fs";
import * as path from "path";

type ProviderOverrideRow = {
  id: string;
  name: string | null;
  language: string | null;
  base_url: string | null;
  engine: string | null;
  active: boolean | null;
  deleted: boolean;
};

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
    "mega-hq",
    "meu-hentai",
    "my-manga-comics",
    "nhentai",
    "quadrinhos-de-sexo",
    "quadrinhos-eroticos",
    "universo-hentai",
    "hentai-teca",
    "sombras-de-hentai",
    "superhentais",
    "hentaidatia",
    "muitohentai",
    "tankou-hentai"
  ]);
  private static adultTerms = [
    "adulto",
    "adult",
    "amateur",
    "amadoras",
    "camgirl",
    "doujinshi",
    "ecchi",
    "erotic",
    "erotica",
    "erotico",
    "erótico",
    "gonewild",
    "hardcore",
    "hentai",
    "imageset",
    "incesto",
    "milf",
    "nsfw",
    "nude",
    "nudes",
    "nua",
    "nuas",
    "nudez",
    "onlyfans",
    "pelada",
    "peladas",
    "porn",
    "pornografico",
    "pornográfico",
    "sacana",
    "sexo",
    "softcore",
    "uncensored",
    "xxx",
    "18+"
  ];
  private static activeStates: Map<string, boolean> = new Map([
    ["mangadex", true],
    ["comicextra", false],
    ["mangaplus", true],
    ["mangafire", true],
    ["mugiwaras", true],
    ["eightmuses", true],
    ["nhentai", true],
    ["biblioteca-br", true],
    ["internet-archive", true],
    ["bato", false],
    ["hqnow", false]
  ]);

  // Supabase-backed overrides on top of custom_providers.json — see
  // ensureOverridesLoaded(). Vercel's function filesystem is read-only, so
  // the fs.writeFileSync calls below are a best-effort for local dev only;
  // this is what actually persists admin toggle/add/delete in production.
  private static overridesPromise: Promise<void> | null = null;
  private static overridesLoadedAt = 0;
  private static readonly OVERRIDES_TTL_MS = 30_000;

  private static getCustomProvidersPath(): string {
    return path.join(process.cwd(), "custom_providers.json");
  }

  private static instantiateProvider(item: { id: string; name: string; language: string; baseUrl: string; engine?: string | null }): Provider {
    return item.engine === "wordpress-comic"
      ? new WordPressComicProvider(item.id, item.name, item.language, item.baseUrl)
      : item.engine === "orion"
        ? new OrionProvider(item.id, item.name, item.language, item.baseUrl)
        : item.engine === "slimeread"
          ? new SlimeReadProvider(item.id, item.name, item.language, item.baseUrl)
          : new MadaraProvider(item.id, item.name, item.language, item.baseUrl);
  }

  static loadCustomProviders() {
    try {
      const filePath = this.getCustomProvidersPath();
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        const list = JSON.parse(content) as Array<{ id: string; name: string; language: string; baseUrl: string; active?: boolean; engine?: string }>;
        for (const item of list) {
          this.registerProvider(this.instantiateProvider(item));
          this.activeStates.set(item.id, item.active !== false);
        }
      }
    } catch (err) {
      logger.error({ err: err }, "Failed to load custom providers:");
    }
  }

  // Fetches provider_overrides once per OVERRIDES_TTL_MS (memoized per warm
  // instance) and applies them on top of the custom_providers.json baseline:
  // a row with base_url is a full custom provider added via the admin
  // (registered if not already present), a row with only `active` toggles an
  // existing provider, and `deleted` removes it (bundled or custom) — this is
  // what makes admin actions in providers.ts actually take effect and
  // survive across serverless invocations. No-op if Supabase isn't configured.
  static async ensureOverridesLoaded(force = false): Promise<void> {
    if (!supabase) return;
    const stale = Date.now() - this.overridesLoadedAt > this.OVERRIDES_TTL_MS;
    if (!force && this.overridesPromise && !stale) return this.overridesPromise;

    // Stamp loadedAt before the fetch resolves (not after) so concurrent
    // calls in the same tick see the in-flight promise as fresh and await
    // it instead of each kicking off their own duplicate Supabase query.
    this.overridesLoadedAt = Date.now();
    this.overridesPromise = (async () => {
      try {
        const { data, error } = await supabase.from("provider_overrides").select("*");
        if (error) throw error;
        for (const row of (data || []) as ProviderOverrideRow[]) {
          if (row.deleted) {
            this.providers.delete(row.id);
            this.activeStates.delete(row.id);
            continue;
          }
          if (row.base_url && !this.providers.has(row.id)) {
            this.registerProvider(this.instantiateProvider({
              id: row.id,
              name: row.name || row.id,
              language: row.language || "pt",
              baseUrl: row.base_url,
              engine: row.engine
            }));
          }
          if (this.providers.has(row.id) && row.active !== null) {
            this.activeStates.set(row.id, row.active);
          }
        }
      } catch (err) {
        logger.error({ err: err }, "Failed to load provider overrides from Supabase:");
        // Let the next call retry sooner instead of waiting out the full TTL.
        this.overridesLoadedAt = 0;
      }
    })();

    return this.overridesPromise;
  }

  // Throws when Supabase IS configured but the write genuinely fails, so
  // toggleProvider/addCustomProvider/deleteCustomProvider (and their routes)
  // don't report success for a change that didn't actually persist — the
  // exact "looked like it worked, disappeared later" failure mode this
  // override layer exists to fix. A missing Supabase config is a different,
  // expected case (no durable layer available) and stays a silent no-op.
  private static async persistOverride(row: Partial<ProviderOverrideRow> & { id: string }): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from("provider_overrides").upsert({ ...row, updated_at: new Date().toISOString() });
    if (error) {
      logger.error({ err: error }, "Failed to persist provider override to Supabase:");
      throw error;
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
    this.registerProvider(new CuratedComicsProvider("biblioteca-br", "Biblioteca BR", "pt"));
    this.registerProvider(new InternetArchiveProvider());

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

  static async toggleProvider(id: string, active: boolean): Promise<void> {
    if (this.providers.has(id)) {
      this.activeStates.set(id, active);
      await this.persistOverride({ id, active });

      // Best-effort for local dev — no-op on Vercel's read-only filesystem.
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
        logger.error({ err: err }, "Failed to persist toggle state for custom provider:");
      }
    }
  }

  static async addCustomProvider(name: string, language: string, baseUrl: string): Promise<Provider> {
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
    await this.persistOverride({ id, name, language, base_url: baseUrl, engine: null, active: true, deleted: false });

    // Best-effort for local dev — no-op on Vercel's read-only filesystem.
    try {
      const filePath = this.getCustomProvidersPath();
      let list: any[] = [];
      if (fs.existsSync(filePath)) {
        list = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      }
      list.push({ id, name, language, baseUrl, active: true });
      fs.writeFileSync(filePath, JSON.stringify(list, null, 2), "utf-8");
    } catch (err) {
      logger.error({ err: err }, "Failed to save custom provider:");
    }

    return provider;
  }

  static async deleteCustomProvider(id: string): Promise<void> {
    if (!this.providers.has(id)) return;
    this.providers.delete(id);
    this.activeStates.delete(id);
    await this.persistOverride({ id, deleted: true });

    // Best-effort for local dev — no-op on Vercel's read-only filesystem.
    try {
      const filePath = this.getCustomProvidersPath();
      if (fs.existsSync(filePath)) {
        let list = JSON.parse(fs.readFileSync(filePath, "utf-8")) as any[];
        list = list.filter(item => item.id !== id);
        fs.writeFileSync(filePath, JSON.stringify(list, null, 2), "utf-8");
      }
    } catch (err) {
      logger.error({ err: err }, "Failed to delete custom provider:");
    }
  }

  static clearCatalogCache(): void {
    for (const p of this.providers.values()) {
      const anyP = p as any;
      if (typeof anyP.clearCache === "function") anyP.clearCache();
    }
  }

  static listProviders() {
    return Array.from(this.providers.values()).map(p => ({
      id: p.id,
      name: p.name,
      language: p.language,
      active: this.activeStates.get(p.id) === true,
      isCustom: p instanceof MadaraProvider || p instanceof WordPressComicProvider || p instanceof OrionProvider || p instanceof SlimeReadProvider,
      engine: p instanceof WordPressComicProvider ? "WordPress Comic" : p instanceof OrionProvider ? "Orion" : p instanceof SlimeReadProvider ? "SlimeRead" : p instanceof MadaraProvider ? "Madara/WordPress" : "Nativo",
      baseUrl: p instanceof MadaraProvider || p instanceof WordPressComicProvider || p instanceof OrionProvider || p instanceof SlimeReadProvider ? p.baseUrl : undefined
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

  // A few adapters fall back to a single hardcoded generic tag ("Hentai",
  // "Doujinshi", "Adulto") when they can't scrape a real genre for an item.
  // Titles get grouped across providers by normalized-title match only, so a
  // coincidental title collision with an unrelated work would otherwise let
  // that generic tag bleed into a group that already has real genre data
  // (or vice versa, two unrelated generic tags piling onto the same group).
  // Once a group has any specific (non-generic) genre, stop mixing in generic
  // ones from other sources — they don't add real information.
  private static readonly GENERIC_FALLBACK_GENRES = new Set(["hentai", "doujinshi", "adulto"]);

  private static mergeGenres(existing: string[] | undefined, incoming: string[] | undefined): string[] | undefined {
    if (!incoming || incoming.length === 0) return existing;
    if (!existing || existing.length === 0) return incoming;

    // Symmetric: as soon as EITHER side contributes a specific genre, generic
    // fallback tags are dropped from BOTH sides — not just the incoming one.
    // Filtering only one side made this order-dependent (a group that started
    // out generic-only would keep its fallback tag forever, even after a
    // later provider added real genres for the same title).
    const combined = [...existing, ...incoming];
    const isSpecific = (genre: string) => !this.GENERIC_FALLBACK_GENRES.has(this.normalizeText(genre));
    const hasSpecific = combined.some(isSpecific);

    const result = hasSpecific ? combined.filter(isSpecific) : combined;
    return Array.from(new Set(result));
  }

  // Items are grouped across providers by normalized-title match only (see
  // normalizeTitle), and an adult provider (nhentai, eightmuses, ...) title-
  // colliding with an unrelated safe title is a real, verified occurrence —
  // doujin parodies are routinely titled exactly like the mainstream series
  // they parody. coverUrl/description used to be filled first-writer-wins
  // regardless of which source supplied them: whichever provider's result
  // was processed first for that title won, adult or not, and stayed won
  // even once a safe provider's own result came in for the same group.
  // stripAdultSources() below only removes adult *sources*/genre terms once
  // a group is fully assembled — it never re-derives coverUrl/description,
  // so an adult-sourced image/synopsis that already won the fill survived
  // straight into an item marked isAdult: false and got displayed to a user
  // who opted out of NSFW content. Track provenance per group so a safe
  // source's value always wins over an adult-sourced one (whichever order
  // results arrive in), and so a group that never received a safe-sourced
  // value at all can have its cover/description scrubbed entirely instead
  // of leaking the only (adult) one that exists — see finalizeGroupResults.
  private static mergeAdultAwareField(
    current: string | undefined,
    currentIsAdult: boolean,
    incoming: string | undefined,
    incomingIsAdult: boolean,
  ): { value: string | undefined; isAdult: boolean } {
    if (!incoming) return { value: current, isAdult: currentIsAdult };
    if (!current) return { value: incoming, isAdult: incomingIsAdult };
    if (currentIsAdult && !incomingIsAdult) return { value: incoming, isAdult: incomingIsAdult };
    return { value: current, isAdult: currentIsAdult };
  }

  // Shared by search/unifyCatalog/getByGenre's grouping loops: links a new
  // source into an existing group and merges coverUrl/description/genres the
  // adult-aware way above. Mutates `existing` and `provenance` in place.
  private static mergeIntoGroup(
    existing: UnifiedSearchResult,
    result: SearchResult,
    norm: string,
    provenance: Map<string, { coverIsAdult: boolean; descIsAdult: boolean }>,
  ): void {
    const alreadyLinked = existing.sources.some(s => s.providerId === result.providerId && s.id === result.id);
    if (!alreadyLinked) {
      existing.sources.push({ providerId: result.providerId, id: result.id, title: result.title, releaseDate: result.releaseDate });
    }

    const resultIsAdult = this.isAdultProvider(result.providerId);
    const prov = provenance.get(norm) ?? { coverIsAdult: false, descIsAdult: false };
    const cover = this.mergeAdultAwareField(existing.coverUrl, prov.coverIsAdult, result.coverUrl, resultIsAdult);
    const desc = this.mergeAdultAwareField(existing.description, prov.descIsAdult, result.description, resultIsAdult);
    existing.coverUrl = cover.value;
    existing.description = desc.value;
    provenance.set(norm, { coverIsAdult: cover.isAdult, descIsAdult: desc.isAdult });

    existing.genres = this.mergeGenres(existing.genres, result.genres);
  }

  private static createGroupEntry(
    result: SearchResult,
    norm: string,
    provenance: Map<string, { coverIsAdult: boolean; descIsAdult: boolean }>,
  ): UnifiedSearchResult {
    const resultIsAdult = this.isAdultProvider(result.providerId);
    provenance.set(norm, {
      coverIsAdult: resultIsAdult && !!result.coverUrl,
      descIsAdult: resultIsAdult && !!result.description,
    });
    return {
      id: `${norm}_group`,
      title: result.title,
      coverUrl: result.coverUrl,
      description: result.description,
      genres: result.genres,
      isAdult: this.isAdultResult(result),
      releaseDate: result.releaseDate,
      sources: [{ providerId: result.providerId, id: result.id, title: result.title, releaseDate: result.releaseDate }],
    };
  }

  // Final pass over every assembled group: recomputes isAdult from the full
  // merged sources/genres/title (as before), and — for a group that ends up
  // NOT adult — scrubs any coverUrl/description whose provenance is still
  // adult-only. That only happens when no safe source in the group ever
  // contributed its own cover/description, i.e. there is no safe
  // alternative to prefer; showing nothing is safer than leaking the one
  // (adult-sourced) value that exists.
  private static finalizeGroupResults(
    groups: Map<string, UnifiedSearchResult>,
    provenance: Map<string, { coverIsAdult: boolean; descIsAdult: boolean }>,
  ): UnifiedSearchResult[] {
    return Array.from(groups.entries()).map(([norm, result]) => {
      const isAdult = this.isAdultResult(result);
      const prov = provenance.get(norm);
      const coverUrl = !isAdult && prov?.coverIsAdult ? undefined : result.coverUrl;
      const description = !isAdult && prov?.descIsAdult ? undefined : result.description;
      return { ...result, coverUrl, description, isAdult };
    });
  }

  private static getReleaseTime(date?: string): number {
    if (!date) return 0;
    const trimmed = String(date).trim();
    if (/^\d{4}$/.test(trimmed)) {
      return new Date(`${trimmed}-01-01T00:00:00.000Z`).getTime();
    }
    const time = new Date(trimmed).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  private static pickNewestReleaseDate(current?: string, next?: string): string | undefined {
    if (!current) return next;
    if (!next) return current;
    return this.getReleaseTime(next) > this.getReleaseTime(current) ? next : current;
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
      "colecao",
      "completa",
      "complete",
      "completo",
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
      "toda",
      "todas",
      "todo",
      "todos",
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
    const title = this.normalizeText(result.title || "");
    const compactTitle = title.replace(/\s+/g, "");
    const phrase = this.normalizeText(query).trim();
    const compactPhrase = phrase.replace(/\s+/g, "");
    const rawTerms = phrase.split(/[^a-z0-9]+/i).filter(Boolean);

    if (phrase && title.includes(phrase)) return true;
    if (compactPhrase && compactTitle.includes(compactPhrase)) return true;

    if (terms.length <= 1) {
      return terms.length === 1 ? this.titleMatchesTerm(title, terms[0]) : rawTerms.length <= 1;
    }

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
  // Resolve with `fallback` if `promise` doesn't settle within `ms`, so one slow
  // provider can't hold up the whole aggregated search/catalog.
  private static withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
    ]);
  }

  private static async withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 600): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try { return await fn(); } catch (err) {
        lastErr = err;
        if (i < attempts - 1) await new Promise(r => setTimeout(r, baseMs * 2 ** i));
      }
    }
    throw lastErr;
  }

  static async search(query: string, nsfw?: boolean, providerIds?: string[]): Promise<UnifiedSearchResult[]> {
    return (await this.searchWithMetadata(query, nsfw, providerIds)).results;
  }

  static async searchWithMetadata(query: string, nsfw?: boolean, providerIds?: string[]): Promise<{ results: UnifiedSearchResult[]; hiddenAdultCount: number; adultQuery: boolean }> {
    await this.ensureOverridesLoaded();
    // Optional provider scoping: e.g. HQ/Gibi rows only need the curated library,
    // so we skip the slow manga providers and the search returns almost instantly.
    const scope = providerIds && providerIds.length ? new Set(providerIds) : null;
    const activeProviders = Array.from(this.providers.values()).filter(
      p => this.activeStates.get(p.id) === true && (!scope || scope.has(p.id))
    );
    const searchPromises = activeProviders.map(p =>
      this.withTimeout(
        p.search(query, nsfw).catch(err => {
          logger.error({ err: err }, `Error searching provider ${p.name}:`);
          return [];
        }),
        7000,
        []
      )
    );

    const resultsArray = await Promise.all(searchPromises);
    const flatResults = resultsArray.flat();

    // Group by normalized title
    const groups: Map<string, UnifiedSearchResult> = new Map();
    const coverProvenance: Map<string, { coverIsAdult: boolean; descIsAdult: boolean }> = new Map();

    for (const result of flatResults) {
      if (!result || !result.title) continue;
      const norm = this.normalizeTitle(result.title);
      if (!norm) continue;

      const existing = groups.get(norm);
      if (existing) {
        this.mergeIntoGroup(existing, result, norm, coverProvenance);
        existing.releaseDate = this.pickNewestReleaseDate(existing.releaseDate, result.releaseDate);
      } else {
        groups.set(norm, this.createGroupEntry(result, norm, coverProvenance));
      }
    }

    const allResults = this.finalizeGroupResults(groups, coverProvenance);
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

  // A cold instance hit directly with a deep link (e.g. a bookmarked chapter
  // URL) skips search/catalog entirely, so it wouldn't otherwise know about a
  // provider that only exists via a persisted admin override — ensure those
  // are loaded here too, not just on the aggregate read paths.
  static async getDetails(providerId: string, id: string): Promise<MangaDetails> {
    await this.ensureOverridesLoaded();
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    return this.withRetry(() => provider.getDetails(id));
  }

  static async getChapters(providerId: string, id: string): Promise<Chapter[]> {
    await this.ensureOverridesLoaded();
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    return this.withRetry(() => provider.getChapters(id));
  }

  static async getPages(providerId: string, chapterId: string): Promise<Page[]> {
    await this.ensureOverridesLoaded();
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    return this.withRetry(() => provider.getPages(chapterId));
  }

  static async getCatalog(listType: "popular" | "latest", nsfw?: boolean): Promise<UnifiedSearchResult[]> {
    await this.ensureOverridesLoaded();
    const activeProviders = Array.from(this.providers.values()).filter(
      p => this.activeStates.get(p.id) === true
    );

    const catalogPromises = activeProviders.map(p =>
      this.withTimeout(
        p.getCatalog(listType, nsfw).catch(err => {
          logger.error({ err: err }, `Error loading catalog from ${p.name}:`);
          return [];
        }),
        12000,
        []
      )
    );

    const resultsArray = await Promise.all(catalogPromises);
    const flatResults = resultsArray.flat();
    return this.unifyCatalog(flatResults, nsfw);
  }

  // Groups a flat list of provider results into unified titles (merging sources,
  // covers, descriptions and genres), then filters by the nsfw flag. Shared by
  // getCatalog and getFullCatalog so both build identical unified shapes.
  private static unifyCatalog(flatResults: SearchResult[], nsfw?: boolean): UnifiedSearchResult[] {
    const groups: Map<string, UnifiedSearchResult> = new Map();
    const coverProvenance: Map<string, { coverIsAdult: boolean; descIsAdult: boolean }> = new Map();

    for (const result of flatResults) {
      if (!result || !result.title) continue;
      const norm = this.normalizeTitle(result.title);
      if (!norm) continue;

      const existing = groups.get(norm);
      if (existing) {
        this.mergeIntoGroup(existing, result, norm, coverProvenance);
        existing.releaseDate = this.pickNewestReleaseDate(existing.releaseDate, result.releaseDate);
      } else {
        groups.set(norm, this.createGroupEntry(result, norm, coverProvenance));
      }
    }

    const allResults = this.finalizeGroupResults(groups, coverProvenance);

    return nsfw ? allResults : allResults.filter(result => !result.isAdult);
  }

  // Collect raw (un-unified) items from every active provider, with a per-provider
  // count and error map for diagnostics. Curated providers return everything
  // (getAllItems); the rest fall back to their popular catalog. When forceCrawl is
  // set, providers exposing forceRefresh re-crawl their sources from scratch.
  private static async collectFullCatalogRaw(nsfw?: boolean, forceCrawl = false): Promise<{
    raw: SearchResult[]; providerRaw: Record<string, number>; errors: Record<string, string>;
  }> {
    await this.ensureOverridesLoaded();
    const activeProviders = Array.from(this.providers.values()).filter(
      p => this.activeStates.get(p.id) === true
    );
    const providerRaw: Record<string, number> = {};
    const errors: Record<string, string> = {};
    const arrays = await Promise.all(activeProviders.map(async p => {
      const anyP = p as Provider & {
        getAllItems?: () => Promise<SearchResult[]>;
        forceRefresh?: () => Promise<SearchResult[]>;
      };
      try {
        let r: SearchResult[];
        if (forceCrawl && anyP.forceRefresh) {
          r = await anyP.forceRefresh();
        } else if (anyP.getAllItems) {
          // Curated crawl can be slow on a cold instance — give it more room than
          // the fast aggregators so it isn't dropped by the timeout.
          r = await this.withTimeout(anyP.getAllItems(), 25000, [] as SearchResult[]);
        } else {
          r = await this.withTimeout(p.getCatalog("popular", nsfw), 12000, [] as SearchResult[]);
        }
        providerRaw[p.id] = r.length;
        return r;
      } catch (err) {
        errors[p.id] = err instanceof Error ? err.message : String(err);
        providerRaw[p.id] = 0;
        logger.error({ err }, `Full catalog collect failed for ${p.name}`);
        return [] as SearchResult[];
      }
    }));
    return { raw: arrays.flat(), providerRaw, errors };
  }

  // Full curated catalog with no per-provider slice — powers the admin browser.
  static async getFullCatalog(nsfw?: boolean): Promise<UnifiedSearchResult[]> {
    const { raw } = await this.collectFullCatalogRaw(nsfw, false);
    return this.unifyCatalog(raw, nsfw);
  }

  // Same as getFullCatalog but also returns diagnostics (per-provider raw counts,
  // errors). forceCrawl re-crawls the curated sources first.
  static async getFullCatalogDiag(nsfw?: boolean, forceCrawl = false): Promise<{
    items: UnifiedSearchResult[]; providerRaw: Record<string, number>; errors: Record<string, string>;
  }> {
    const { raw, providerRaw, errors } = await this.collectFullCatalogRaw(nsfw, forceCrawl);
    return { items: this.unifyCatalog(raw, nsfw), providerRaw, errors };
  }

  // Cache health for every provider that reports it (the curated ones). Lets the
  // admin see whether the shared catalog cache is actually persisting.
  static async curatedCacheStatus(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const p of this.providers.values()) {
      const anyP = p as Provider & { cacheStatus?: () => Promise<unknown> };
      if (typeof anyP.cacheStatus === "function") {
        out[p.id] = await anyP.cacheStatus().catch(() => null);
      }
    }
    return out;
  }

  // Fetch a large set of titles for a single genre, on demand. Providers with a
  // real genre filter (MangaDex) use it; others contribute their catalog matches.
  static async getByGenre(genre: string, nsfw?: boolean): Promise<UnifiedSearchResult[]> {
    await this.ensureOverridesLoaded();
    const activeProviders = Array.from(this.providers.values()).filter(
      p => this.activeStates.get(p.id) === true
    );
    const normGenre = this.normalizeText(genre);
    const promises = activeProviders.map(p =>
      this.withTimeout(
        (p.getByGenre
          ? p.getByGenre(genre, nsfw)
          : p.getCatalog("popular", nsfw).then(items =>
              items.filter(it => (it.genres || []).some(g => this.normalizeText(g) === normGenre))
            )
        ).catch(() => []),
        9000,
        []
      )
    );
    const flat = (await Promise.all(promises)).flat();

    const groups: Map<string, UnifiedSearchResult> = new Map();
    const coverProvenance: Map<string, { coverIsAdult: boolean; descIsAdult: boolean }> = new Map();
    for (const result of flat) {
      if (!result || !result.title) continue;
      const norm = this.normalizeTitle(result.title);
      if (!norm) continue;
      const existing = groups.get(norm);
      if (existing) {
        this.mergeIntoGroup(existing, result, norm, coverProvenance);
      } else {
        groups.set(norm, this.createGroupEntry(result, norm, coverProvenance));
      }
    }
    const all = this.finalizeGroupResults(groups, coverProvenance);
    return nsfw
      ? all.filter(r => r.isAdult)
      : all.map(r => this.stripAdultSources(r)).filter((r): r is UnifiedSearchResult => r !== null);
  }
}
