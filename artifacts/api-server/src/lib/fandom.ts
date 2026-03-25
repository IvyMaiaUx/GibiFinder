import { logger } from "./logger";

const HEADERS = {
  "User-Agent": "GibiFinder/1.0 (gibi identifier app)",
  "Accept": "application/json",
};

const TIMEOUT_MS = 6000;

// Known wikis to search, in priority order
const WIKIS = [
  {
    name: "Turma da Mônica",
    apiBase: "https://turmadamonica.fandom.com/pt-br/api.php",
    keywords: ["monica", "mônica", "cebolinha", "cascao", "cascão", "magali", "mauricio", "maurício", "turma"],
  },
  {
    name: "Marvel",
    apiBase: "https://marvel.fandom.com/api.php",
    keywords: ["homem-aranha", "spider", "marvel", "capitão", "vingadores", "x-men", "hulk", "thor", "iron man"],
  },
  {
    name: "DC Comics",
    apiBase: "https://dc.fandom.com/api.php",
    keywords: ["batman", "superman", "mulher maravilha", "dc comics", "flash", "aquaman", "liga da justiça"],
  },
];

function detectWikis(query: string): typeof WIKIS {
  const q = query.toLowerCase();
  const matched = WIKIS.filter((w) => w.keywords.some((k) => q.includes(k)));
  // Always include Mônica wiki as fallback for Brazilian comics
  const monica = WIKIS[0];
  if (!matched.find((w) => w.name === monica.name)) matched.push(monica);
  return matched;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { headers: HEADERS, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface FandomResult {
  context: string;
  imageUrl: string | null;
  sourceWiki: string;
  pageTitle: string;
}

async function searchWiki(wiki: (typeof WIKIS)[0], query: string): Promise<FandomResult | null> {
  try {
    // 1. Search for relevant pages
    const searchUrl = `${wiki.apiBase}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&srprop=snippet`;
    const searchRes = await fetchWithTimeout(searchUrl);
    if (!searchRes.ok) return null;

    const searchData = (await searchRes.json()) as {
      query?: { search?: { title: string; snippet: string }[] };
    };
    const results = searchData?.query?.search || [];
    if (results.length === 0) return null;

    const bestTitle = results[0].title;

    // 2. Fetch extract + images from the best page
    const pageUrl = `${wiki.apiBase}?action=query&prop=extracts|pageimages&exintro=1&exsentences=8&titles=${encodeURIComponent(bestTitle)}&format=json&pithumbsize=600&redirects=1`;
    const pageRes = await fetchWithTimeout(pageUrl);
    if (!pageRes.ok) return null;

    const pageData = (await pageRes.json()) as {
      query?: {
        pages?: Record<
          string,
          { extract?: string; thumbnail?: { source: string }; title: string }
        >;
      };
    };

    const pages = pageData?.query?.pages || {};
    const page = Object.values(pages)[0];
    if (!page) return null;

    const extract = page.extract ? stripHtml(page.extract) : results[0].snippet.replace(/<[^>]+>/g, "");
    const imageUrl = page.thumbnail?.source || null;

    const context = `=== ${wiki.name} Fandom Wiki: "${bestTitle}" ===\n${extract}`;

    return { context, imageUrl, sourceWiki: wiki.name, pageTitle: bestTitle };
  } catch (err) {
    logger.warn({ msg: "Fandom search failed", wiki: wiki.name, query, err: String(err) });
    return null;
  }
}

export interface FandomContext {
  text: string;
  imageUrl: string | null;
}

export async function fetchFandomContext(query: string): Promise<FandomContext> {
  const wikis = detectWikis(query);

  // Try wikis in parallel, take the first successful result
  const results = await Promise.allSettled(wikis.map((w) => searchWiki(w, query)));

  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      return {
        text: r.value.context,
        imageUrl: r.value.imageUrl,
      };
    }
  }

  return { text: "", imageUrl: null };
}
