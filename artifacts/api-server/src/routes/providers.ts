import { Router, Request, Response } from "express";
import { logger } from "../lib/logger";
import { ProviderManager } from "../providers/ProviderManager";
import { getOverrides, applyOverrides, overrideKey, upsertOverride } from "../lib/catalogOverrides";
import { hasDriveKey } from "../lib/driveKeys";
import { scrapeComicSynopsisDetailed } from "../lib/synopsisScraper";

const router = Router();

async function injectRatings(results: any[]) {
  const mangadexIds: { mangaId: string; resultIndex: number }[] = [];
  results.forEach((item, index) => {
    const mdSource = item.sources?.find((s: any) => s.providerId === "mangadex");
    if (mdSource) {
      mangadexIds.push({ mangaId: mdSource.id, resultIndex: index });
    }
  });

  if (mangadexIds.length > 0) {
    try {
      const ids = mangadexIds.map(x => x.mangaId);
      const queryParams = ids.map(id => `manga[]=${id}`).join("&");
      const url = `https://api.mangadex.org/statistics/manga?${queryParams}`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json() as any;
        const stats = data?.statistics || {};
        
        mangadexIds.forEach(x => {
          const mStats = stats[x.mangaId];
          if (mStats) {
            const rating = mStats.rating?.average || mStats.rating?.bayesian;
            if (rating) {
              results[x.resultIndex].rating = Math.round(rating * 10) / 10;
            }
          }
        });
      }
    } catch (err) {
      logger.error({ err: err }, "Failed to fetch bulk statistics from MangaDex:");
    }
  }

  // Inject fallback/mock ratings for items that don't have a rating
  results.forEach(item => {
    if (item.rating === undefined) {
      let hash = 0;
      const id = item.id || item.title || "";
      for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
      }
      const score = 7.0 + Math.abs(hash % 25) / 10;
      item.rating = Math.round(score * 10) / 10;
    }
  });
}

// GET /api/providers - List all active providers
router.get("/providers", (_req: Request, res: Response) => {
  try {
    const list = ProviderManager.listProviders();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: "failed_to_list_providers", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/providers/search - Search across all active providers with unifications
router.get("/providers/search", async (req: Request, res: Response) => {
  const query = req.query.query as string;
  const nsfw = req.query.nsfw === "true";
  const providers = typeof req.query.providers === "string" && req.query.providers
    ? req.query.providers.split(",").map(p => p.trim()).filter(Boolean)
    : undefined;
  if (!query) {
    res.status(400).json({ error: "missing_query", message: "O parâmetro de busca 'query' é obrigatório." });
    return;
  }

  try {
    const { results, hiddenAdultCount, adultQuery } = await ProviderManager.searchWithMetadata(query, nsfw, providers);
    res.setHeader("X-Adult-Results-Hidden", String(hiddenAdultCount));
    res.setHeader("X-Adult-Query", adultQuery ? "true" : "false");
    const curated = applyOverrides(results, await getOverrides());
    await injectRatings(curated);
    res.json(curated);
  } catch (err) {
    res.status(500).json({ error: "search_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/providers/details - Get details for a specific manga/HQ
router.get("/providers/details", async (req: Request, res: Response) => {
  const providerId = req.query.providerId as string;
  const id = req.query.id as string;

  if (!providerId || !id) {
    res.status(400).json({ error: "missing_params", message: "Os parâmetros 'providerId' e 'id' são obrigatórios." });
    return;
  }

  try {
    const details = await ProviderManager.getDetails(providerId, id) as unknown as Record<string, unknown>;
    const ov = (await getOverrides()).get(overrideKey(providerId, id));
    if (ov) {
      if (ov.coverUrl) details.coverUrl = ov.coverUrl;
      if (ov.description) details.description = ov.description;
      if (ov.title) details.title = ov.title;
    }
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: "details_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/providers/chapters - List chapters from a provider
router.get("/providers/chapters", async (req: Request, res: Response) => {
  const providerId = req.query.providerId as string;
  const id = req.query.id as string;

  if (!providerId || !id) {
    res.status(400).json({ error: "missing_params", message: "Os parâmetros 'providerId' e 'id' são obrigatórios." });
    return;
  }

  try {
    const chapters = await ProviderManager.getChapters(providerId, id);
    res.json(chapters);
  } catch (err) {
    res.status(500).json({ error: "chapters_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/providers/pages - Get pages of a chapter
router.get("/providers/pages", async (req: Request, res: Response) => {
  const providerId = req.query.providerId as string;
  const chapterId = req.query.chapterId as string;

  if (!providerId || !chapterId) {
    res.status(400).json({ error: "missing_params", message: "Os parâmetros 'providerId' e 'chapterId' são obrigatórios." });
    return;
  }

  try {
    const pages = await ProviderManager.getPages(providerId, chapterId);
    res.json(pages);
  } catch (err) {
    res.status(500).json({ error: "pages_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/providers/toggle - Toggle provider active state
router.post("/providers/toggle", (req: Request, res: Response) => {
  const { providerId, active } = req.body;
  if (!providerId || active === undefined) {
    res.status(400).json({ error: "missing_params", message: "Os parâmetros 'providerId' e 'active' são obrigatórios." });
    return;
  }

  try {
    ProviderManager.toggleProvider(providerId, !!active);
    res.json({ success: true, providerId, active: !!active });
  } catch (err) {
    res.status(500).json({ error: "toggle_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/providers/catalog - Fetch unified catalog from all active providers
router.get("/providers/catalog", async (req: Request, res: Response) => {
  const listType = (req.query.listType as "popular" | "latest") || "popular";
  const nsfw = req.query.nsfw === "true";

  try {
    const items = applyOverrides(await ProviderManager.getCatalog(listType, nsfw), await getOverrides());
    await injectRatings(items);
    res.json(items);
  } catch (err) {
    res.status(500).json({ 
      error: "catalog_failed", 
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    });
  }
});

// GET /api/providers/by-genre - Fetch many titles for one genre (on demand)
router.get("/providers/by-genre", async (req: Request, res: Response) => {
  const genre = (req.query.genre as string) || "";
  const nsfw = req.query.nsfw === "true";
  if (!genre.trim()) {
    res.status(400).json({ error: "missing_genre" });
    return;
  }
  try {
    const items = applyOverrides(await ProviderManager.getByGenre(genre, nsfw), await getOverrides());
    await injectRatings(items);
    res.json(items);
  } catch (err) {
    logger.error({ err }, "by-genre failed");
    res.status(500).json({ error: "by_genre_failed" });
  }
});

// GET /api/providers/statistics - Fetch statistics/ratings for a manga/HQ
router.get("/providers/statistics", async (req: Request, res: Response) => {
  const providerId = req.query.providerId as string;
  const id = req.query.id as string;

  if (!providerId || !id) {
    res.status(400).json({ error: "missing_params", message: "Os parâmetros 'providerId' e 'id' são obrigatórios." });
    return;
  }

  try {
    if (providerId === "mangadex") {
      const response = await fetch(`https://api.mangadex.org/statistics/manga/${id}`);
      if (response.ok) {
        const stats = await response.json() as any;
        const mangaStats = stats?.statistics?.[id];
        if (mangaStats) {
          const rating = mangaStats.rating?.average || mangaStats.rating?.bayesian;
          const votes = mangaStats.rating?.distribution 
            ? Object.values(mangaStats.rating.distribution).reduce((a: any, b: any) => a + b, 0) as number
            : 0;
          res.json({
            rating: rating ? Math.round(rating * 10) / 10 : null, // scale of 10
            votes,
            follows: mangaStats.follows || 0
          });
          return;
        }
      }
    }
    
    // Fallback/Mock for other providers to ensure UI consistency
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const score = 7.0 + Math.abs(hash % 25) / 10;
    const votes = Math.abs(hash % 900) + 100;
    res.json({
      rating: Math.round(score * 10) / 10,
      votes,
      follows: Math.abs(hash % 5000) + 500
    });
  } catch (err) {
    res.status(500).json({ error: "statistics_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

const ADMIN_KEY = process.env["ADMIN_KEY"] || "gibi-admin-2024";
function requireAdmin(req: Request, res: Response): boolean {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) {
    res.status(401).json({ error: "unauthorized", message: "Chave de administrador inválida" });
    return false;
  }
  return true;
}

const INSPECT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
};

function resolveUrl(value: string, baseUrl: string): string | null {
  try {
    if (!value || value.startsWith("data:")) return null;
    return new URL(value.replace(/&amp;/g, "&"), baseUrl).toString();
  } catch {
    return null;
  }
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractImageCandidates(html: string, baseUrl: string) {
  const images: Array<{ url: string; selector: string; alt?: string; width?: number; height?: number }> = [];
  for (const match of html.matchAll(/<img[^>]+>/gi)) {
    const tag = match[0];
    const raw = tag.match(/\s(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["']/i)?.[1];
    const url = raw ? resolveUrl(raw, baseUrl) : null;
    if (!url || !/\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(url)) continue;
    const className = tag.match(/\sclass=["']([^"']+)["']/i)?.[1]?.split(/\s+/).filter(Boolean)[0];
    images.push({
      url,
      selector: className ? `img.${className}` : "img",
      alt: tag.match(/\salt=["']([^"']*)["']/i)?.[1],
      width: Number(tag.match(/\swidth=["']?(\d+)/i)?.[1] || 0) || undefined,
      height: Number(tag.match(/\sheight=["']?(\d+)/i)?.[1] || 0) || undefined
    });
  }

  for (const match of html.matchAll(/https?:\/\/[^"' <>()]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"' <>()]*)?/gi)) {
    const url = resolveUrl(match[0], baseUrl);
    if (url && !images.some(image => image.url === url)) {
      images.push({ url, selector: "regex:url" });
    }
  }

  return images;
}

function isDecorativeImage(url: string) {
  return /logo|favicon|social|share|avatar|banner|placeholder|removebg|cropped-|icon|ads?\//i.test(url);
}

function getReadingEvidence(html: string, images: Array<{ url: string; selector: string }>) {
  const usefulImages = images.filter(image => !isDecorativeImage(image.url));
  const sequentialImages = usefulImages.filter(image =>
    /(?:page|pagina|p[._-]?\d{1,3}|\/\d{1,3}\.(?:jpg|jpeg|png|webp)|-\d{1,3}\.(?:jpg|jpeg|png|webp))/i.test(image.url)
  ).length;
  const readingSelectors = [
    "reading-content",
    "chapter-content",
    "entry-content",
    "post-content",
    "comicpic",
    "page-break",
    "reader",
    "chapter"
  ].filter(term => new RegExp(term, "i").test(html));
  const chapterLinks = (html.match(/<a[^>]+href=["'][^"']*(?:chapter|capitulo|capitulo-|ler-online|read-online|issue|volume|\/\d+\/)[^"']*["']/gi) || []).length;
  const likelyReadingImages = usefulImages.filter(image =>
    /reading|chapter|reader|page|comic|manga|wp-manga/i.test(image.selector) ||
    /(?:page|pagina|chapter|capitulo|scan|\/(?:chapters?|capitulos?|pages?)\/)/i.test(image.url)
  ).length;
  const score = [
    usefulImages.length >= 3,
    usefulImages.length >= 8,
    sequentialImages >= 3,
    readingSelectors.length > 0,
    chapterLinks > 0,
    likelyReadingImages >= 3
  ].filter(Boolean).length;

  return {
    score,
    usefulImages: usefulImages.length,
    sequentialImages,
    readingSelectors,
    chapterLinks,
    likelyReadingImages
  };
}

function extractExternalReaderLinks(html: string, baseUrl: string) {
  const links: Array<{ url: string; label: string; kind: string }> = [];
  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = resolveUrl(match[1], baseUrl);
    if (!url) continue;
    const label = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const kind = /docs\.google\.com|drive\.google\.com/i.test(url)
      ? "google-drive"
      : /mega\.nz|mega\.co/i.test(url)
        ? "mega"
        : /mediafire\.com/i.test(url)
          ? "mediafire"
          : /\.(?:pdf|cbz|cbr)(?:\?|$)/i.test(url)
            ? "direct-file"
            : "";
    if (!kind) continue;
    if (!/ler|online|read|baixar|download|pdf|cbz|cbr/i.test(label + " " + url)) continue;
    links.push({ url, label: label || kind, kind });
  }
  return links;
}

function countSelectorImages(html: string, selector: string, blockRegex: RegExp) {
  const blocks: string[] = html.match(blockRegex) || [];
  const count = blocks.reduce<number>((sum, block) => sum + (block.match(/<img[^>]+>/gi)?.length || 0), 0);
  return { selector, count };
}

async function probeOneImage(image: { url: string; selector: string }, headers: Record<string, string>, accessMode: "direct" | "referer") {
  let res = await fetchWithTimeout(image.url, { method: "HEAD", headers }, 8000);
  if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) {
    res = await fetchWithTimeout(image.url, { method: "GET", headers: { ...headers, Range: "bytes=0-32" } }, 8000);
  }
  return {
    url: image.url,
    selector: image.selector,
    ok: res.ok,
    status: res.status,
    contentType: res.headers.get("content-type") || "",
    accessMode
  };
}

async function probeImages(images: Array<{ url: string; selector: string }>, pageUrl: string, origin: string) {
  const imageHeaders = {
    ...INSPECT_HEADERS,
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
  };
  const refererHeaders = {
    ...imageHeaders,
    Referer: pageUrl,
    Origin: origin
  };

  return await Promise.all(images.slice(0, 8).map(async image => {
    try {
      const direct = await probeOneImage(image, imageHeaders, "direct");
      if (direct.ok && direct.contentType.startsWith("image/")) {
        return direct;
      }
      const withReferer = await probeOneImage(image, refererHeaders, "referer");
      if (withReferer.ok && withReferer.contentType.startsWith("image/")) {
        return withReferer;
      }
      return direct;
    } catch (err) {
      return { url: image.url, selector: image.selector, ok: false, status: 0, contentType: "", accessMode: "direct", error: err instanceof Error ? err.message : String(err) };
    }
  }));
}

async function readJsonIfPossible(res: globalThis.Response) {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function detectHtmlEngine(origin: string, html: string): string | null {
  const host = new URL(origin).hostname.replace(/^www\./, "");
  if (/comicextra/i.test(host) || /episode-list|comicextra/i.test(html)) {
    return "comicextra-like";
  }
  if (/readallcomics|readcomiconline|readcomics/i.test(host) || /lst-chapters|chapter-heading|comicpic|readcomiconline/i.test(html)) {
    return "readcomics-like";
  }
  if (/comicfury/i.test(host) || /comic fury|comicfury|webcomic profile/i.test(html)) {
    return "comicfury";
  }
  if (/comicbookplus|comicbookplus\.com/i.test(host) || /comic book plus|public domain comic/i.test(html)) {
    return "comicbookplus";
  }
  if (/comiccms/i.test(host) || /comiccms|comic cms|data-comic|comic-reader/i.test(html)) {
    return "comiccms";
  }
  if (/foolslide|foolz/i.test(host) || /foolslide|FoOlSlide|fs-reader|reader\/read|slide-reader/i.test(html)) {
    return "foolslide";
  }
  if (/genkan/i.test(host) || /genkan|__NEXT_DATA__[\s\S]{0,5000}(manga|chapter)|\/api\/manga/i.test(html)) {
    return "genkan";
  }
  if (/plumacomics/i.test(host) || /orionmanhuas|cdn\.orionmanhuas\.com|\/api\/obras|\/viewer\/bootstrap/i.test(html)) {
    return "orion";
  }
  if (/mangakakalot|manganato|chapmanganato/i.test(host) || /2xstorage\.com|chapter-list|panel-story-info/i.test(html)) {
    return "mangakakalot-like";
  }
  if (/mangareader|mangafire/i.test(host) || /data-src=.*manga|chapter-list/i.test(html)) {
    return "mangareader-like";
  }
  if (/madara|wp-manga|reading-content|c-blog__heading/i.test(html)) {
    return "madara";
  }
  return null;
}

function isPrivateInspectionTarget(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(host)) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

router.get("/providers/inspect", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const target = req.query.url as string;
  if (!target) {
    res.status(400).json({ error: "missing_url", message: "URL obrigatoria." });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid protocol");
  } catch {
    res.status(400).json({ error: "invalid_url", message: "Informe uma URL http/https valida." });
    return;
  }
  if (isPrivateInspectionTarget(parsed.hostname)) {
    res.status(400).json({ error: "blocked_private_url", message: "URLs locais ou privadas nao podem ser inspecionadas pelo admin online." });
    return;
  }

  const origin = parsed.origin;
  const normalizedTarget = parsed.toString();

  try {
    const pageRes = await fetchWithTimeout(normalizedTarget, { headers: INSPECT_HEADERS }, 15000);
    const contentType = pageRes.headers.get("content-type") || "";
    const server = pageRes.headers.get("server") || "";
    const html = await pageRes.text();
    const cloudflare = /cloudflare/i.test(server) || /cf-ray|checking your browser|just a moment/i.test(html);

    let wpJson: any = null;
    let wpRestAvailable = false;
    let wpPostsAvailable = false;
    let wpError: string | null = null;
    try {
      const wpRes = await fetchWithTimeout(`${origin}/wp-json/`, { headers: INSPECT_HEADERS }, 10000);
      wpJson = wpRes.ok ? await readJsonIfPossible(wpRes) : null;
      const namespaces = Array.isArray(wpJson?.namespaces) ? wpJson.namespaces : [];
      wpRestAvailable = wpRes.ok && namespaces.length > 0;
      if (namespaces.includes("wp/v2")) {
        const postsRes = await fetchWithTimeout(`${origin}/wp-json/wp/v2/posts?per_page=1&_embed=1`, { headers: INSPECT_HEADERS }, 10000);
        const postsJson = postsRes.ok ? await readJsonIfPossible(postsRes) : null;
        wpPostsAvailable = postsRes.ok && Array.isArray(postsJson);
      }
    } catch (err) {
      wpError = err instanceof Error ? err.message : String(err);
    }

    const images = extractImageCandidates(html, normalizedTarget);
    const externalReaderLinks = extractExternalReaderLinks(html, normalizedTarget);
    const selectorCandidates: Array<{ selector: string; count: number }> = [
      countSelectorImages(html, "article img", /<article[\s\S]*?<\/article>/gi),
      countSelectorImages(html, ".entry-content img", /<[^>]+class=["'][^"']*entry-content[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|article)>/gi),
      countSelectorImages(html, ".post-content img", /<[^>]+class=["'][^"']*post-content[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|article)>/gi),
      countSelectorImages(html, ".elementor-widget-image img", /<[^>]+class=["'][^"']*elementor-widget-image[^"']*["'][^>]*>[\s\S]*?<\/div>/gi),
      countSelectorImages(html, ".wp-block-image img", /<figure[^>]+class=["'][^"']*wp-block-image[^"']*["'][^>]*>[\s\S]*?<\/figure>/gi),
      countSelectorImages(html, ".reading-content img", /<[^>]+class=["'][^"']*reading-content[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|article)>/gi),
      { selector: "regex:url", count: images.filter(image => image.selector === "regex:url").length },
      { selector: "img", count: images.length }
    ].filter(item => item.count > 0).sort((a, b) => b.count - a.count);

    const imageAccess = await probeImages(images, normalizedTarget, origin);
    const readableImageCount = imageAccess.filter(image => image.ok).length;
    const directImageCount = imageAccess.filter(image => image.ok && image.accessMode === "direct").length;
    const refererImageCount = imageAccess.filter(image => image.ok && image.accessMode === "referer").length;
    const readingEvidence = getReadingEvidence(html, images);
    const detectedHtmlEngine = detectHtmlEngine(origin, html);
    const suggestedEngine = wpPostsAvailable ? "wordpress-comic" : detectedHtmlEngine || (selectorCandidates.length > 0 ? "generic-html" : "manual");
    const namespaces = Array.isArray(wpJson?.namespaces) ? wpJson.namespaces : [];
    const hasWordPressHtmlSignals = /wp-content|wp-includes/i.test(html) && /wp-json|wp-embed|wordpress/i.test(html);
    const wordpressDetected = namespaces.includes("wp/v2") || hasWordPressHtmlSignals;
    const needsImageProxy = readableImageCount > 0 && directImageCount === 0;
    const hasReadingEvidence = readingEvidence.score >= 3;
    const weakReadingEvidence = readingEvidence.score > 0 || readingEvidence.usefulImages > 1;
    const externalReaderFlow = externalReaderLinks.length >= 3 && readingEvidence.likelyReadingImages < 3 && readingEvidence.sequentialImages < 3;
    const canReadInsideGibiFinder = !externalReaderFlow && directImageCount > 0 && hasReadingEvidence && (wpPostsAvailable || selectorCandidates.length > 0 || Boolean(detectedHtmlEngine));
    const verdict = externalReaderFlow
      ? "external_reader_links"
      : canReadInsideGibiFinder
        ? "readable_provider"
        : needsImageProxy
        ? "needs_image_proxy"
      : externalReaderLinks.length > 0
        ? "external_reader_links"
      : pageRes.ok && (weakReadingEvidence || wpPostsAvailable || selectorCandidates.length > 0)
        ? "needs_chapter_test"
      : pageRes.ok && !cloudflare && images.length === 0
        ? "catalog_or_external_only"
        : "manual_or_blocked";

    res.json({
      url: normalizedTarget,
      origin,
      status: pageRes.status,
      ok: pageRes.ok,
      contentType,
      server,
      cloudflare,
      wordpress: {
        detected: wordpressDetected,
        restAvailable: wpRestAvailable,
        postsAvailable: wpPostsAvailable,
        name: wpJson?.name,
        description: wpJson?.description,
        namespaces,
        error: wpError
      },
      images: {
        totalFound: images.length,
        uniqueFound: unique(images.map(image => image.url)).length,
        usefulFound: readingEvidence.usefulImages,
        accessibleInSample: readableImageCount,
        directInSample: directImageCount,
        refererOnlyInSample: refererImageCount,
        needsProxy: needsImageProxy,
        sample: imageAccess
      },
      readingEvidence,
      externalReaderLinks: {
        total: externalReaderLinks.length,
        sample: externalReaderLinks.slice(0, 12)
      },
      selectorCandidates,
      verdict,
      canReadInsideGibiFinder,
      suggestedEngine,
      integrationScore: [
        pageRes.ok,
        !cloudflare,
        wpPostsAvailable || selectorCandidates.length > 0,
        readingEvidence.score >= 2,
        readableImageCount > 0 && readingEvidence.score >= 3
      ].filter(Boolean).length
    });
  } catch (err) {
    res.status(500).json({ error: "inspect_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/providers/custom - Add a custom provider (requires admin key)
router.post("/providers/custom", (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { name, language, baseUrl } = req.body;
  if (!name || !language || !baseUrl) {
    res.status(400).json({ error: "missing_params", message: "Os campos 'name', 'language' e 'baseUrl' são obrigatórios." });
    return;
  }

  try {
    const provider = ProviderManager.addCustomProvider(name, language, baseUrl);
    res.json({
      success: true,
      provider: {
        id: provider.id,
        name: provider.name,
        language: provider.language,
        active: true,
        isCustom: true,
        baseUrl
      }
    });
  } catch (err) {
    res.status(500).json({ error: "add_custom_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/providers/custom/:id - Delete a custom provider (requires admin key)
router.delete("/providers/custom/:id", (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const id = req.params.id as string;
  if (!id) {
    res.status(400).json({ error: "missing_id", message: "ID do provedor é obrigatório." });
    return;
  }

  try {
    ProviderManager.deleteCustomProvider(id);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: "delete_custom_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// Serialize the full catalog for the admin browser, with a per-provider count
// breakdown so the admin can see where items come from (drives vs providers).
function serializeAdminCatalog(
  items: Awaited<ReturnType<typeof ProviderManager.getFullCatalog>>,
  diag: { providerRaw: Record<string, number>; errors: Record<string, string>; driveKey: boolean; cache: Record<string, unknown> },
) {
  const byProvider: Record<string, number> = {};
  for (const it of items) {
    const pid = it.sources?.[0]?.providerId || "unknown";
    byProvider[pid] = (byProvider[pid] || 0) + 1;
  }
  return {
    total: items.length,
    byProvider,
    diag,
    items: items.map(it => ({
      id: it.id,
      title: it.title,
      coverUrl: it.coverUrl,
      description: it.description,
      genres: it.genres || [],
      sources: it.sources || [],
    })),
  };
}

// GET /api/admin/catalog — full curated catalog for the admin browser.
// Returns raw items (overrides are NOT applied) so the admin can see and manage
// hidden/edited items. Each item carries its sources[] so the override key
// (providerId:itemId) can be derived on the client. Includes diagnostics so the
// admin can see why the curated (Drive) library may be empty.
router.get("/admin/catalog", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { items, providerRaw, errors } = await ProviderManager.getFullCatalogDiag(false, false);
    const cache = await ProviderManager.curatedCacheStatus();
    res.json(serializeAdminCatalog(items, { providerRaw, errors, driveKey: hasDriveKey(), cache }));
  } catch (err) {
    logger.error({ err }, "admin catalog failed");
    res.status(500).json({ error: "catalog_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/admin/catalog/rebuild — force a fresh crawl of the curated sources
// (Drive + Google Sites) and return the rebuilt catalog. Use when the cached
// catalog looks stale or partial.
router.post("/admin/catalog/rebuild", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { items, providerRaw, errors } = await ProviderManager.getFullCatalogDiag(false, true);
    const cache = await ProviderManager.curatedCacheStatus();
    res.json(serializeAdminCatalog(items, { providerRaw, errors, driveKey: hasDriveKey(), cache }));
  } catch (err) {
    logger.error({ err }, "admin catalog rebuild failed");
    res.status(500).json({ error: "rebuild_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/admin/catalog/autofill-synopsis — scrape a real pt-BR synopsis for a
// batch of items the CLIENT selected (so we skip the heavy full-catalog load and
// stay well under the serverless timeout). body: { items: [{providerId, itemId, title}] }
router.post("/admin/catalog/autofill-synopsis", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const list: { providerId?: string; itemId?: string; title?: string }[] =
    Array.isArray(req.body?.items) ? req.body.items.slice(0, 25) : [];
  if (list.length === 0) { res.json({ scanned: 0, filled: 0, reasons: {}, results: [] }); return; }
  try {
    const overrides = await getOverrides();
    let filled = 0;
    const results: { title: string; ok: boolean; reason: string }[] = [];
    const reasons: Record<string, number> = {};
    const CONC = 6;
    for (let i = 0; i < list.length; i += CONC) {
      await Promise.all(list.slice(i, i + CONC).map(async (raw) => {
        const providerId = String(raw?.providerId || "");
        const itemId = String(raw?.itemId || "");
        const title = String(raw?.title || "");
        if (!providerId || !itemId || !title) { reasons["bad-item"] = (reasons["bad-item"] || 0) + 1; return; }
        const { synopsis, reason } = await scrapeComicSynopsisDetailed(title).catch(() => ({ synopsis: "", reason: "fetch-error" as const }));
        reasons[reason] = (reasons[reason] || 0) + 1;
        const syn = synopsis.trim();
        if (syn.length >= 40) {
          const cur = overrides.get(overrideKey(providerId, itemId));
          await upsertOverride({
            providerId, itemId,
            hidden: cur?.hidden ?? false,
            coverUrl: cur?.coverUrl ?? null,
            description: syn,
            title: cur?.title ?? null,
          });
          filled++;
          results.push({ title, ok: true, reason });
        } else {
          results.push({ title, ok: false, reason });
        }
      }));
    }
    res.json({ scanned: list.length, filled, reasons, results });
  } catch (err) {
    logger.error({ err }, "autofill synopsis failed");
    res.status(500).json({ error: "autofill_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/cron/refresh-catalog — invoked by Vercel Cron every 6h to re-crawl the
// Drive/Sites catalog automatically (keeps covers + new folders fresh without a
// manual RECONSTRUIR). Secured with CRON_SECRET when set (Vercel sends it as a
// Bearer token); left open only when no secret is configured.
router.get("/cron/refresh-catalog", async (req: Request, res: Response) => {
  const secret = (process.env["CRON_SECRET"] || "").trim();
  if (secret && req.headers["authorization"] !== `Bearer ${secret}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { items } = await ProviderManager.getFullCatalogDiag(false, true);
    logger.info({ total: items.length }, "cron: catalog refreshed");
    res.json({ ok: true, total: items.length });
  } catch (err) {
    logger.error({ err }, "cron catalog refresh failed");
    res.status(500).json({ error: "refresh_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
