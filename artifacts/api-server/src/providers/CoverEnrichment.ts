// Cover fallback for Western HQ/gibi titles that MangaDex enrichment can't
// help with (Marvel/DC/Disney/Turma da Mônica/etc. simply aren't in
// MangaDex's catalog). Two free, keyless-or-cheap-to-key sources, tried in
// order: Google Books (needs GOOGLE_BOOKS_API_KEY — works without one too,
// just against a much lower unauthenticated quota) and Open Library (no key
// at all). Neither is invented data — both just point at a real cover image
// for a real book/edition that plausibly matches the query title.
//
// The Death Note bug earlier in this catalog (a hardcoded-wrong MangaDex ID
// baked into MangaFireProvider) is the concrete lesson driving the matching
// rule here: never accept a search API's first result blind. A title alone
// is genuinely ambiguous for Western comics — "Batman" has hundreds of
// editions — so this only accepts a candidate whose own title, once
// stripped of issue/volume/year noise the same way the query is, equals or
// clearly contains the query. No ISBN/publisher/edition-number cross-check
// yet (the catalog's SearchResult type doesn't carry those fields) — that's
// a real accuracy ceiling, not something this pretends to solve.
import { logger } from "../lib/logger";
import { normalizeTitleForMatch } from "./titleMatch";

const FETCH_TIMEOUT_MS = 3500;

// "Batman #12 (2025)" -> "Batman", "The Boys Vol. 3" -> "The Boys" — the
// catalog's unified titles routinely carry issue/volume/year suffixes that
// no external catalog's own title field will ever literally contain.
function stripEditionNoise(title: string): string {
  return title
    .replace(/#\d+.*$/, "")
    .replace(/\(\d{4}\)\s*$/, "")
    .replace(/\b(vol(ume)?|n[uú]mero|edi[cç][aã]o)\.?\s*\d+\b/gi, "")
    .trim();
}

// Accepts an exact normalized match, or the candidate containing the query
// as a prefix (handles "Batman" matching Google Books' "Batman, Volume 1:
// ..."). Guards short titles (len < 3 normalized) against false-positive
// substring hits on unrelated longer titles.
function isConfidentMatch(queryNorm: string, candidateTitle: string): boolean {
  if (!queryNorm || queryNorm.length < 3) return false;
  const candidateNorm = normalizeTitleForMatch(candidateTitle);
  if (!candidateNorm) return false;
  return candidateNorm === queryNorm || candidateNorm.startsWith(queryNorm);
}

async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response | null> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

let warnedNoGoogleBooksKey = false;

async function searchGoogleBooksCover(baseTitle: string, queryNorm: string, signal?: AbortSignal): Promise<string | null> {
  const key = process.env["GOOGLE_BOOKS_API_KEY"];
  if (!key && !warnedNoGoogleBooksKey) {
    warnedNoGoogleBooksKey = true;
    logger.warn("GOOGLE_BOOKS_API_KEY not set — Google Books cover fallback runs against the unauthenticated (low) quota");
  }

  const params = new URLSearchParams({
    q: `intitle:${baseTitle}`,
    maxResults: "5",
    ...(key ? { key } : {}),
  });
  const res = await fetchWithTimeout(`https://www.googleapis.com/books/v1/volumes?${params}`, signal);
  if (!res) return null;

  try {
    const data = await res.json() as { items?: { volumeInfo?: { title?: string; imageLinks?: { thumbnail?: string } } }[] };
    for (const item of data.items || []) {
      const title = item.volumeInfo?.title;
      const thumbnail = item.volumeInfo?.imageLinks?.thumbnail;
      if (title && thumbnail && isConfidentMatch(queryNorm, title)) {
        // Google Books thumbnails default to http:// and a small zoom level.
        return thumbnail.replace(/^http:/, "https:").replace("zoom=1", "zoom=2");
      }
    }
  } catch (err) {
    logger.error({ err }, "Google Books cover search: bad response body");
  }
  return null;
}

async function searchOpenLibraryCover(baseTitle: string, queryNorm: string, signal?: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({ title: baseTitle, limit: "5" });
  const res = await fetchWithTimeout(`https://openlibrary.org/search.json?${params}`, signal);
  if (!res) return null;

  try {
    const data = await res.json() as { docs?: { title?: string; cover_i?: number }[] };
    for (const doc of data.docs || []) {
      if (doc.title && doc.cover_i && isConfidentMatch(queryNorm, doc.title)) {
        return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
      }
    }
  } catch (err) {
    logger.error({ err }, "Open Library cover search: bad response body");
  }
  return null;
}

// Google Books first (broader catalog, official publisher art more often),
// Open Library as the free no-key fallback when it comes up empty.
export async function findWesternCover(title: string, signal?: AbortSignal): Promise<string | null> {
  const baseTitle = stripEditionNoise(title);
  const queryNorm = normalizeTitleForMatch(baseTitle);
  if (!queryNorm) return null;

  const fromGoogle = await searchGoogleBooksCover(baseTitle, queryNorm, signal);
  if (fromGoogle) return fromGoogle;

  return searchOpenLibraryCover(baseTitle, queryNorm, signal);
}
