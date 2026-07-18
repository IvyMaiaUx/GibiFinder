import { Chapter, MangaDetails, Page, Provider, SearchResult } from "./types";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json,text/html;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
};

type WpPost = {
  id: number;
  slug: string;
  link: string;
  type?: string;
  date?: string;
  modified?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
  yoast_head_json?: { og_image?: Array<{ url?: string }> };
  _embedded?: {
    "wp:featuredmedia"?: Array<{ source_url?: string; media_details?: { sizes?: Record<string, { source_url?: string }> } }>;
  };
};

export class WordPressComicProvider implements Provider {
  constructor(
    public id: string,
    public name: string,
    public language: string,
    public baseUrl: string
  ) {
    this.baseUrl = this.baseUrl.replace(/\/+$/, "");
  }

  private api(path: string): string {
    return `${this.baseUrl}/wp-json/wp/v2/${path.replace(/^\/+/, "")}`;
  }

  private decodeHtml(value = ""): string {
    return value
      .replace(/&amp;/g, "&")
      .replace(/&#038;/g, "&")
      .replace(/&quot;/g, "\"")
      .replace(/&#039;/g, "'")
      .replace(/&#8211;/g, "-")
      .replace(/&#8212;/g, "-")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  private stripHtml(value = ""): string {
    return this.decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
  }

  private normalizeText(value = ""): string {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  private getSearchTerms(query: string): string[] {
    const stopWords = new Set([
      "and",
      "colecao",
      "completa",
      "complete",
      "completo",
      "das",
      "de",
      "do",
      "dos",
      "ler",
      "online",
      "the",
      "toda",
      "todas",
      "todo",
      "todos"
    ]);

    return this.normalizeText(query)
      .split(/[^a-z0-9]+/i)
      .map(term => term.trim())
      .filter(term => term.length > 2 && !stopWords.has(term));
  }

  private titleMatchesQuery(title: string, query: string): boolean {
    const terms = this.getSearchTerms(query);
    if (terms.length === 0) return true;
    const normalizedTitle = this.normalizeText(title);
    return terms.every(term => normalizedTitle.includes(term));
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) throw new Error(`WordPress API returned ${res.status}`);
    return await res.json() as T;
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) throw new Error(`WordPress page returned ${res.status}`);
    return await res.text();
  }

  private postCover(post: WpPost): string | undefined {
    return post._embedded?.["wp:featuredmedia"]?.[0]?.media_details?.sizes?.large?.source_url ||
      post._embedded?.["wp:featuredmedia"]?.[0]?.source_url ||
      post.yoast_head_json?.og_image?.[0]?.url ||
      post.content?.rendered?.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
  }

  private toPostId(post: WpPost): string {
    return `post:${post.slug || post.id}`;
  }

  private toPageId(page: WpPost): string {
    return `page:${page.id}`;
  }

  private cleanReadPageTitle(title: string): string {
    const clean = this.stripHtml(title).replace(/^ler\s+(?:online\s+)?/i, "").trim();
    if (/\([^)]*\)/.test(clean)) return clean;
    return /#\s*\d+/.test(clean) ? `${clean} (2024)` : clean;
  }

  private getIssueNumber(title: string): string | null {
    return this.stripHtml(title).match(/#\s*([0-9]+)/)?.[1] || null;
  }

  private readPageMatchesPost(page: WpPost, post: WpPost): boolean {
    const postTitle = this.stripHtml(post.title?.rendered || "");
    const pageTitle = this.cleanReadPageTitle(page.title?.rendered || page.slug);
    const postIssue = this.getIssueNumber(postTitle);
    const pageIssue = this.getIssueNumber(pageTitle);
    if (postIssue && pageIssue && postIssue !== pageIssue) return false;

    const postTerms = this.getSearchTerms(postTitle.replace(/#\s*[0-9]+.*/i, ""));
    if (postTerms.length === 0) return true;
    const pageText = this.normalizeText(pageTitle);
    const matched = postTerms.filter(term => pageText.includes(term)).length;
    return matched / postTerms.length >= 0.67;
  }

  private async getPost(id: string): Promise<WpPost | null> {
    const clean = id.replace(/^post:/, "");
    if (/^\d+$/.test(clean)) {
      return await this.fetchJson<WpPost>(this.api(`posts/${clean}?_embed=1`));
    }
    const posts = await this.fetchJson<WpPost[]>(this.api(`posts?slug=${encodeURIComponent(clean)}&_embed=1`));
    return posts[0] || null;
  }

  private async getPageById(id: string): Promise<WpPost | null> {
    return await this.fetchJson<WpPost>(this.api(`pages/${encodeURIComponent(id)}`));
  }

  private extractReadLinks(html: string): Array<{ title: string; url: string }> {
    const links: Array<{ title: string; url: string }> = [];
    for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const url = this.decodeHtml(match[1]);
      const label = this.stripHtml(match[2]);
      if (!/ler\s+(online|absolute|hq|quadrinho)|read\s+online/i.test(label) && !/\/ler-[^/]*|\/ler-online-/i.test(url)) continue;
      if (!url.includes(this.baseUrl)) continue;
      links.push({ title: label || "Ler Online", url });
    }
    return links;
  }

  private async findReadPage(post: WpPost): Promise<{ id: string; title: string; url: string } | null> {
    const content = post.content?.rendered || "";
    const direct = this.extractReadLinks(content)[0];
    if (direct) {
      const slug = new URL(direct.url).pathname.replace(/^\/+|\/+$/g, "");
      const pages = await this.fetchJson<WpPost[]>(this.api(`pages?slug=${encodeURIComponent(slug)}&per_page=1`));
      if (pages[0] && this.readPageMatchesPost(pages[0], post)) {
        return { id: `page:${pages[0].id}`, title: direct.title, url: pages[0].link };
      }
    }

    const title = this.stripHtml(post.title?.rendered || "");
    const number = title.match(/#\s*([0-9]+)/)?.[1];
    const series = title.replace(/#\s*[0-9]+.*/i, "").replace(/\([^)]*\)/g, "").trim();
    const query = number ? `ler online ${series} ${number}` : `ler online ${title}`;
    const hits = await this.fetchJson<Array<{ id: number; title: string; url: string; subtype: string }>>(this.api(`search?search=${encodeURIComponent(query)}&per_page=30`));
    const pageHit = hits.find(hit => hit.subtype === "page" && /ler/i.test(hit.title) && (!number || hit.title.includes(`#${number}`) || new RegExp(`\\b${number}\\b`).test(hit.title)));
    return pageHit ? { id: `page:${pageHit.id}`, title: pageHit.title, url: pageHit.url } : null;
  }

  private extractImages(html: string): string[] {
    const urls = new Set<string>();
    for (const img of html.matchAll(/<img[^>]+>/gi)) {
      const tag = img[0];
      const raw = tag.match(/\s(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["']/i)?.[1];
      if (!raw) continue;
      const url = this.decodeHtml(raw);
      if (!/\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(url)) continue;
      if (/logo|avatar|banner|favicon|cropped-|removebg|195x300|googleads|pagead|\/ads?\//i.test(url)) continue;
      urls.add(url);
    }

    for (const match of html.matchAll(/https?:\/\/[^"' <>()]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"' <>()]*)?/gi)) {
      const url = this.decodeHtml(match[0]);
      if (/logo|avatar|banner|favicon|cropped-|removebg|195x300|googleads|pagead|\/ads?\//i.test(url)) continue;
      urls.add(url);
    }

    return Array.from(urls);
  }

  private toSearchResult(post: WpPost): SearchResult {
    return {
      id: this.toPostId(post),
      title: this.stripHtml(post.title?.rendered || post.slug),
      description: this.stripHtml(post.excerpt?.rendered || "").slice(0, 240),
      coverUrl: this.postCover(post),
      providerId: this.id,
      releaseDate: post.date || post.modified
    };
  }

  private toPageSearchResult(page: WpPost): SearchResult {
    const images = this.extractImages(page.content?.rendered || "");
    return {
      id: this.toPageId(page),
      title: this.cleanReadPageTitle(page.title?.rendered || page.slug),
      description: this.stripHtml(page.excerpt?.rendered || "").slice(0, 240),
      coverUrl: images[0] || this.postCover(page),
      providerId: this.id,
      releaseDate: page.date || page.modified
    };
  }

  private async hasReadablePages(post: WpPost): Promise<boolean> {
    if (this.extractImages(post.content?.rendered || "").length > 0) return true;

    const readPage = await this.findReadPage(post).catch(() => null);
    if (!readPage) return false;

    try {
      let html = "";
      if (readPage.id.startsWith("page:")) {
        const page = await this.getPageById(readPage.id.replace(/^page:/, ""));
        html = page?.content?.rendered || "";
      } else {
        html = await this.fetchHtml(readPage.url);
      }
      return this.extractImages(html).length > 0;
    } catch {
      return false;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const searchText = this.getSearchTerms(query).join(" ") || query;
      const [posts, pages] = await Promise.all([
        this.fetchJson<WpPost[]>(this.api(`posts?search=${encodeURIComponent(searchText)}&per_page=40&_embed=1`)),
        this.fetchJson<WpPost[]>(this.api(`pages?search=${encodeURIComponent(searchText)}&per_page=100&_embed=1`)).catch(() => [])
      ]);
      const queryIssue = (query.match(/#\s*(\d+)\s*$/) || query.match(/\b(\d{1,3})\s*$/))?.[1];
      const sorted = [...posts].sort((a, b) => {
        if (!queryIssue) return 0;
        const aTitle = this.stripHtml(a.title?.rendered || "");
        const bTitle = this.stripHtml(b.title?.rendered || "");
        const aExact = new RegExp(`#\\s*${queryIssue}\\b`).test(aTitle) ? 1 : 0;
        const bExact = new RegExp(`#\\s*${queryIssue}\\b`).test(bTitle) ? 1 : 0;
        return bExact - aExact;
      });
      const candidates = queryIssue
        ? sorted.filter(post => new RegExp(`#\\s*${queryIssue}\\b`).test(this.stripHtml(post.title?.rendered || "")))
        : sorted;

      const readable = await Promise.all(candidates.map(async post => ({
        post,
        readable: await this.hasReadablePages(post)
      })));

      const pageResults = pages
        .filter(page => /^ler/i.test(this.stripHtml(page.title?.rendered || "")))
        .filter(page => this.titleMatchesQuery(page.title?.rendered || "", query))
        .filter(page => !queryIssue || new RegExp(`#\\s*${queryIssue}\\b`).test(this.stripHtml(page.title?.rendered || "")))
        .filter(page => this.extractImages(page.content?.rendered || "").length > 0)
        .map(page => this.toPageSearchResult(page));
      const postResults = readable
        .filter(item => item.readable)
        .map(item => this.toSearchResult(item.post))
        .filter(result => this.titleMatchesQuery(result.title, query));
      const seenTitles = new Set<string>();

      return [...pageResults, ...postResults].filter(result => {
        const key = result.title.toLowerCase().replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
        if (seenTitles.has(key)) return false;
        seenTitles.add(key);
        return true;
      });
    } catch (err) {
      console.warn(`WordPress provider [${this.id}] search failed:`, err);
      return [];
    }
  }

  async getDetails(id: string): Promise<MangaDetails> {
    if (id.startsWith("page:")) {
      const page = await this.getPageById(id.replace(/^page:/, ""));
      if (!page) return { id, title: id.replace(/^page:/, "").replace(/-/g, " "), providerId: this.id };
      const images = this.extractImages(page.content?.rendered || "");
      return {
        id: this.toPageId(page),
        title: this.cleanReadPageTitle(page.title?.rendered || page.slug),
        description: this.stripHtml(page.excerpt?.rendered || page.content?.rendered || "").slice(0, 600),
        coverUrl: images[0] || this.postCover(page),
        providerId: this.id
      };
    }

    const post = await this.getPost(id);
    if (!post) return { id, title: id.replace(/^post:/, "").replace(/-/g, " "), providerId: this.id };
    return {
      id: this.toPostId(post),
      title: this.stripHtml(post.title?.rendered || post.slug),
      description: this.stripHtml(post.excerpt?.rendered || post.content?.rendered || "").slice(0, 600),
      coverUrl: this.postCover(post),
      providerId: this.id
    };
  }

  async getChapters(id: string): Promise<Chapter[]> {
    if (id.startsWith("page:")) {
      const page = await this.getPageById(id.replace(/^page:/, ""));
      if (!page) return [];
      return [{
        id: this.toPageId(page),
        chapterNum: this.stripHtml(page.title?.rendered || "").match(/#\s*([0-9]+)/)?.[1] || "1",
        title: this.cleanReadPageTitle(page.title?.rendered || page.slug),
        language: this.language,
        providerId: this.id
      }];
    }

    const post = await this.getPost(id);
    if (!post) return [];
    const directImages = this.extractImages(post.content?.rendered || "");
    if (directImages.length > 0) {
      return [{
        id: this.toPostId(post),
        chapterNum: this.stripHtml(post.title?.rendered || "").match(/#\s*([0-9]+)/)?.[1] || "1",
        title: this.stripHtml(post.title?.rendered || post.slug),
        language: this.language,
        providerId: this.id
      }];
    }

    const readPage = await this.findReadPage(post).catch(() => null);
    if (!readPage) {
      return [];
    }
    return [{
      id: readPage.id,
      chapterNum: this.stripHtml(post.title?.rendered || "").match(/#\s*([0-9]+)/)?.[1] || "1",
      title: readPage.title,
      language: this.language,
      providerId: this.id
    }];
  }

  async getPages(chapterId: string): Promise<Page[]> {
    try {
      let html = "";
      if (chapterId.startsWith("page:")) {
        const page = await this.getPageById(chapterId.replace(/^page:/, ""));
        html = page?.content?.rendered || "";
      } else {
        const post = await this.getPost(chapterId);
        const readPage = post ? await this.findReadPage(post).catch(() => null) : null;
        if (readPage?.id.startsWith("page:")) {
          const page = await this.getPageById(readPage.id.replace(/^page:/, ""));
          html = page?.content?.rendered || "";
        } else if (readPage?.url) {
          html = await this.fetchHtml(readPage.url);
        } else {
          html = post?.content?.rendered || "";
        }
      }

      return this.extractImages(html).map((url, index) => ({ url, pageNumber: index + 1 }));
    } catch (err) {
      console.warn(`WordPress provider [${this.id}] pages failed:`, err);
      return [];
    }
  }

  async getCatalog(listType: "popular" | "latest"): Promise<SearchResult[]> {
    try {
      const orderby = listType === "latest" ? "date" : "date";
      const posts = await this.fetchJson<WpPost[]>(this.api(`posts?per_page=12&orderby=${orderby}&_embed=1`));
      const readable = await Promise.all(posts.map(async post => ({
        post,
        readable: await this.hasReadablePages(post)
      })));
      return readable.filter(item => item.readable).map(item => this.toSearchResult(item.post));
    } catch {
      return [];
    }
  }
}
