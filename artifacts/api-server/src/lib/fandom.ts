import { logger } from "./logger";

const HEADERS = {
  "User-Agent": "GibiFinder/1.0 (gibi identifier app)",
  "Accept": "application/json",
};

const TIMEOUT_MS = 6000;

// ── Wiki definitions ────────────────────────────────────────────────────────

const MONICA_API = "https://turmadamonica.fandom.com/pt-br/api.php";
const MARVEL_API = "https://marvel.fandom.com/api.php";
const DC_API     = "https://dc.fandom.com/api.php";

const WIKIS = [
  {
    name: "Turma da Mônica",
    apiBase: MONICA_API,
    keywords: ["monica", "mônica", "cebolinha", "cascao", "cascão", "magali", "bidu", "xaveco",
               "mauricio", "maurício", "turma", "gibi", "pantanal", "chico bento"],
  },
  {
    name: "Marvel",
    apiBase: MARVEL_API,
    keywords: ["homem-aranha", "spider", "marvel", "capitão", "vingadores", "x-men", "hulk", "thor", "iron man", "pantera negra"],
  },
  {
    name: "DC Comics",
    apiBase: DC_API,
    keywords: ["batman", "superman", "mulher maravilha", "dc comics", "flash", "aquaman", "liga da justiça", "coringa"],
  },
];

// Turma da Mônica category slugs (pt-br wiki)
const MONICA_CATEGORY = {
  character: "Personagens",
  gibi:      "Gibis",
  general:   null,
} as const;

type SearchType = "character" | "gibi" | "general";

// ── Helpers ─────────────────────────────────────────────────────────────────

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
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildSearchQuery(query: string, category: string | null): string {
  // MediaWiki supports `incategory:"CategoryName"` filter
  return category ? `${query} incategory:"${category}"` : query;
}

// ── Core wiki search ─────────────────────────────────────────────────────────

interface FandomResult {
  context: string;
  imageUrl: string | null;
}

async function searchWiki(
  apiBase: string,
  wikiName: string,
  query: string,
  category: string | null = null
): Promise<FandomResult | null> {
  try {
    const srQuery = buildSearchQuery(query, category);

    // 1. Full-text search
    const searchUrl = `${apiBase}?action=query&list=search&srsearch=${encodeURIComponent(srQuery)}&format=json&srlimit=3&srprop=snippet`;
    const searchRes = await fetchWithTimeout(searchUrl);
    if (!searchRes.ok) return null;

    const searchData = (await searchRes.json()) as {
      query?: { search?: { title: string; snippet: string }[] };
    };
    let results = searchData?.query?.search || [];

    // Fallback: if category filter returned nothing, try without it
    if (results.length === 0 && category) {
      const fallbackUrl = `${apiBase}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&srprop=snippet`;
      const fbRes = await fetchWithTimeout(fallbackUrl);
      if (fbRes.ok) {
        const fbData = (await fbRes.json()) as { query?: { search?: { title: string; snippet: string }[] } };
        results = fbData?.query?.search || [];
      }
    }

    if (results.length === 0) return null;

    const bestTitle = results[0].title;

    // 2. Fetch page extract
    const pageUrl = `${apiBase}?action=query&prop=extracts&exintro=1&exsentences=10&titles=${encodeURIComponent(bestTitle)}&format=json&redirects=1`;
    const pageRes = await fetchWithTimeout(pageUrl);
    if (!pageRes.ok) return null;

    const pageData = (await pageRes.json()) as {
      query?: { pages?: Record<string, { extract?: string; title: string }> };
    };
    const pages = pageData?.query?.pages || {};
    const page = Object.values(pages)[0];
    if (!page) return null;

    const extract = page.extract
      ? stripHtml(page.extract)
      : results[0].snippet.replace(/<[^>]+>/g, "");

    // 3. Collect all top results as context (multi-result enrichment)
    const allTitles = results.map(r => r.title).join(", ");
    const context = [
      `=== ${wikiName} Fandom Wiki ===`,
      `Páginas relacionadas: ${allTitles}`,
      `\n--- ${bestTitle} ---`,
      extract,
    ].join("\n");

    return { context, imageUrl: null };
  } catch (err) {
    logger.warn({ msg: "Fandom search failed", wiki: wikiName, query, err: String(err) });
    return null;
  }
}

// ── Category listing (for enriching character/gibi searches) ─────────────────

async function getCategoryMembers(category: string, limit = 20): Promise<string[]> {
  try {
    const url = `${MONICA_API}?action=query&list=categorymembers&cmtitle=Categoria:${encodeURIComponent(category)}&cmlimit=${limit}&format=json&cmnamespace=0`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      query?: { categorymembers?: { title: string }[] };
    };
    return (data?.query?.categorymembers || []).map(m => m.title);
  } catch {
    return [];
  }
}

// ── Detect best wiki for a query ─────────────────────────────────────────────

function detectWikis(query: string) {
  const q = query.toLowerCase();
  const matched = WIKIS.filter((w) => w.keywords.some((k) => q.includes(k)));
  // Always include Mônica wiki as default for Brazilian comics
  const monica = WIKIS[0];
  if (!matched.find((w) => w.name === monica.name)) matched.push(monica);
  return matched;
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface FandomContext {
  text: string;
  imageUrl: string | null;
}

export async function fetchFandomContext(
  query: string,
  searchType: SearchType = "general"
): Promise<FandomContext> {
  const wikis = detectWikis(query);

  // For Mônica wiki, use the appropriate category filter
  const monicaCategory = MONICA_CATEGORY[searchType];

  const searchPromises = wikis.map((w) => {
    const category = w.name === "Turma da Mônica" ? monicaCategory : null;
    return searchWiki(w.apiBase, w.name, query, category);
  });

  // Also fetch category members to give Gemini a list of known titles
  const categoryMembersPromise =
    searchType !== "general"
      ? getCategoryMembers(searchType === "character" ? "Personagens" : "Gibis", 30)
      : Promise.resolve([] as string[]);

  const [results, categoryMembers] = await Promise.all([
    Promise.allSettled(searchPromises),
    categoryMembersPromise,
  ]);

  const contextParts: string[] = [];

  // Add category member list as extra grounding
  if (categoryMembers.length > 0) {
    const label = searchType === "character" ? "personagens" : "gibis";
    contextParts.push(`=== Lista de ${label} conhecidos na wiki da Turma da Mônica ===\n${categoryMembers.join(", ")}`);
  }

  for (const r of results) {
    if (r.status === "fulfilled" && r.value?.context) {
      contextParts.push(r.value.context);
      break; // Take only the first successful wiki result
    }
  }

  return {
    text: contextParts.join("\n\n"),
    imageUrl: null,
  };
}
