import { proxyCoverUrl } from "@/lib/utils";

/**
 * Page-image cache shared by the reader's preloader and its viewport engine.
 *
 * Two jobs, both needed for an instant page turn:
 *
 *  1. Resolve a provider page URL to one that actually loads, and remember its
 *     natural size. The viewport needs the size *before* it opens the page —
 *     laying a double spread out, or picking a fit, without it means opening at
 *     a guessed geometry and correcting it a frame later, which is exactly the
 *     "image jumps when it appears" the reader is trying to get rid of.
 *
 *  2. Keep a small, bounded set of decoded <img> elements alive. The browser's
 *     HTTP cache alone only saves the download; holding the element keeps the
 *     *decode*, so re-opening a neighbouring page costs nothing.
 *
 * `crossOrigin` matters here: the viewport engine requests its images with
 * `crossOrigin="anonymous"`, and a preload fetched under a different CORS mode
 * lands in a different cache slot — the page would be downloaded twice and the
 * preload would buy nothing. Both sides use "anonymous".
 */

export interface PageImage {
  /** The URL that actually loaded — hand this one to the viewer, not the raw one. */
  src: string;
  width: number;
  height: number;
}

const resolved = new Map<string, PageImage>();
const inflight = new Map<string, Promise<PageImage>>();
/** Decoded images deliberately kept referenced; insertion order is the LRU. */
const held = new Map<string, HTMLImageElement>();

let holdLimit = 6;

/** The proxy first (same origin, so CORS-clean), the raw URL as a fallback. */
function candidates(url: string): string[] {
  const proxied = proxyCoverUrl(url);
  return proxied && proxied !== url ? [proxied, url] : [url];
}

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) reject(new Error(`empty image: ${src}`));
      else resolve(img);
    };
    img.onerror = () => reject(new Error(`failed to load: ${src}`));
    img.src = src;
  });
}

function hold(url: string, img: HTMLImageElement) {
  held.delete(url);
  held.set(url, img);
  while (held.size > holdLimit) {
    const oldest = held.keys().next().value;
    if (oldest === undefined) break;
    held.delete(oldest);
  }
}

/** Natural size of a page already resolved, if any. Never triggers a load. */
export function getPageImage(url: string | undefined): PageImage | undefined {
  return url ? resolved.get(url) : undefined;
}

/**
 * Resolve a page URL to a loadable source plus its natural size, trying the
 * image proxy first and the original URL second (the same ladder SafeImage
 * walks for covers). Concurrent callers for the same page share one load.
 */
export function loadPageImage(url: string): Promise<PageImage> {
  const cached = resolved.get(url);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(url);
  if (pending) return pending;

  const attempt = (async () => {
    let lastError: unknown;
    for (const src of candidates(url)) {
      try {
        const img = await decode(src);
        const meta: PageImage = { src, width: img.naturalWidth, height: img.naturalHeight };
        resolved.set(url, meta);
        hold(url, img);
        return meta;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`failed to load page: ${url}`);
  })();

  inflight.set(url, attempt);
  attempt.finally(() => { inflight.delete(url); }).catch(() => { /* surfaced to the caller */ });
  return attempt;
}

/**
 * Warm a window of pages and keep exactly those decoded. Pages that fall out of
 * the window are released, so a long chapter can't grow the reader's memory
 * without bound — the reason this is a window and not a plain "load everything".
 */
export function preloadPages(urls: (string | undefined)[], limit = 6) {
  holdLimit = Math.max(2, limit);
  const wanted = urls.filter((u): u is string => !!u && /^https?:/i.test(u));
  for (const url of held.keys()) {
    if (!wanted.includes(url)) held.delete(url);
  }
  for (const url of wanted) {
    const img = held.get(url);
    if (img) { hold(url, img); continue; }        // refresh its LRU position
    loadPageImage(url).catch(() => { /* the viewport reports its own failure */ });
  }
}

/** Drop a single page so the next open re-fetches it (the retry button). */
export function forgetPageImage(url: string) {
  resolved.delete(url);
  held.delete(url);
  inflight.delete(url);
}

/** Used by the diagnostics overlay's "clear cache" action. */
export function clearPageImages() {
  resolved.clear();
  held.clear();
  inflight.clear();
}
