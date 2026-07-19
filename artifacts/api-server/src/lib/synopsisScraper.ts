import { logger } from "./logger";

const BASE = "https://zonafantasmanet.wordpress.com";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

function decodeHtml(value = ""): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8230;/g, "…")
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value = ""): string {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function normalize(value = ""): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Words + issue number the title should map to on the blog. */
function titleTokens(title: string): { words: string[]; issue: string | null } {
  const cleaned = normalize(title)
    .replace(/\bler\s+(?:online\s+)?/g, " ")
    .replace(/#/g, " ");
  const issueMatch = cleaned.match(/\b(\d{1,4})\b/);
  const issue = issueMatch ? String(parseInt(issueMatch[1], 10)) : null;
  const words = cleaned
    .replace(/\d+/g, " ")
    .split(/[^a-z]+/)
    .filter(w => w.length > 2);
  return { words, issue };
}

/** From the WordPress search page, pick the post link that best matches the title. */
function pickBestLink(html: string, title: string): string | null {
  const { words, issue } = titleTokens(title);
  const links = new Set<string>();
  for (const m of html.matchAll(
    /href="(https:\/\/zonafantasmanet\.wordpress\.com\/20\d{2}\/\d{2}\/\d{2}\/[^"#]+?)"/gi
  )) {
    links.add(m[1].replace(/\/$/, ""));
  }
  let fallback: string | null = null;
  for (const link of links) {
    const slug = normalize(link.split("/").pop() || "");
    const slugTokens = slug.split("-");
    const allWords = words.every(w => slugTokens.includes(w));
    if (!allWords) continue;
    if (!issue) return link; // no issue number to disambiguate
    // Require the slug to carry the exact issue number (avoid "-12" for "#2").
    if (slugTokens.includes(issue)) return link;
    fallback = fallback || link;
  }
  return issue ? null : fallback;
}

/** Pull the text after a bold "Sinopse:" label out of a post's HTML. */
function extractSynopsis(html: string): string {
  const patterns = [
    /sinopse\s*<\/(?:strong|b|span)>\s*:?\s*([\s\S]*?)<\/(?:td|p|div|li|section)>/i,
    /sinopse\s*:\s*(?:<\/(?:strong|b|span)>)?\s*([\s\S]*?)<\/(?:td|p|div|li|section)>/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const text = stripHtml(m[1]);
      if (text.length >= 40) return text.slice(0, 1200);
    }
  }
  return "";
}

async function fetchText(url: string): Promise<string> {
  // Bound each request so a slow/hanging source can't blow the whole batch's
  // serverless time budget (Vercel kills at 30s -> the action looks "broken").
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Look up a real pt-BR synopsis for a comic title by scraping the Zona Fantasma
 * blog (search -> best-matching post -> "Sinopse:" paragraph). Returns "" when
 * nothing suitable is found (e.g. for manga the blog doesn't cover).
 */
export async function scrapeComicSynopsis(title: string): Promise<string> {
  const clean = title.trim();
  if (!clean) return "";
  try {
    // Search with a normalized query (drop "ler online" noise, keep name + issue)
    // so the blog's search actually returns the matching post.
    const { words, issue } = titleTokens(clean);
    if (words.length === 0) return "";
    const query = [...words, issue].filter(Boolean).join(" ");
    const searchHtml = await fetchText(`${BASE}/?s=${encodeURIComponent(query)}`);
    const link = pickBestLink(searchHtml, clean);
    if (!link) return "";
    const postHtml = await fetchText(link);
    return extractSynopsis(postHtml);
  } catch (err) {
    logger.warn({ err, title }, "synopsis scrape failed");
    return "";
  }
}
