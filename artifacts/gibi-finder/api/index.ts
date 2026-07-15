import { createServer } from "node:http";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import cors from "cors";
import { ProviderManager } from "../../api-server/src/providers/ProviderManager";

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

// Health
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// GET /api/providers - List all active providers
app.get("/api/providers", (_req, res) => {
  try {
    const list = ProviderManager.listProviders();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: "failed_to_list_providers", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/providers/search
app.get("/api/providers/search", async (req, res) => {
  const query = req.query.query as string;
  if (!query) {
    res.status(400).json({ error: "missing_query" });
    return;
  }
  try {
    const results = await ProviderManager.search(query);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "search_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/providers/catalog
app.get("/api/providers/catalog", async (req, res) => {
  const listType = (req.query.listType as "popular" | "latest") || "popular";
  try {
    const items = await ProviderManager.getCatalog(listType);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: "catalog_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/providers/details
app.get("/api/providers/details", async (req, res) => {
  const providerId = req.query.providerId as string;
  const id = req.query.id as string;
  if (!providerId || !id) {
    res.status(400).json({ error: "missing_params" });
    return;
  }
  try {
    const details = await ProviderManager.getDetails(providerId, id);
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: "details_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/providers/chapters
app.get("/api/providers/chapters", async (req, res) => {
  const providerId = req.query.providerId as string;
  const id = req.query.id as string;
  if (!providerId || !id) {
    res.status(400).json({ error: "missing_params" });
    return;
  }
  try {
    const chapters = await ProviderManager.getChapters(providerId, id);
    res.json(chapters);
  } catch (err) {
    res.status(500).json({ error: "chapters_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/providers/pages
app.get("/api/providers/pages", async (req, res) => {
  const providerId = req.query.providerId as string;
  const chapterId = req.query.chapterId as string;
  if (!providerId || !chapterId) {
    res.status(400).json({ error: "missing_params" });
    return;
  }
  try {
    const pages = await ProviderManager.getPages(providerId, chapterId);
    res.json(pages);
  } catch (err) {
    res.status(500).json({ error: "pages_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/providers/toggle
app.post("/api/providers/toggle", (req, res) => {
  const { providerId, active } = req.body;
  if (!providerId || active === undefined) {
    res.status(400).json({ error: "missing_params" });
    return;
  }
  try {
    ProviderManager.toggleProvider(providerId, !!active);
    res.json({ success: true, providerId, active: !!active });
  } catch (err) {
    res.status(500).json({ error: "toggle_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/image-proxy
const ALLOWED_HOSTS = [
  "uploads.mangadex.org",
  "cmdxd98sb0x3yprd.mangadex.network",
  "og.mangadex.org",
  "comicextra.se",
  "www.comicextra.se",
  "mangafire.to",
  "cdn.mangafire.to",
  "mangaplus.shueisha.co.jp",
  "d2dq7ifhe7bu0f.cloudfront.net",
  "s1.mangaplus.shueisha.co.jp",
  "s2.mangaplus.shueisha.co.jp",
  "s3.mangaplus.shueisha.co.jp",
  "cdn.mangaplus.shueisha.co.jp",
];

app.get("/api/image-proxy", async (req, res) => {
  const rawUrl = req.query.url as string;
  if (!rawUrl) {
    res.status(400).json({ error: "missing_url" });
    return;
  }
  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: "invalid_url" });
    return;
  }
  if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
    res.status(403).json({ error: "forbidden_host" });
    return;
  }
  try {
    const response = await fetch(targetUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GibiFinder/1.0)",
        Accept: "image/webp,image/avif,image/jpeg,image/png,image/*,*/*",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      res.status(response.status).json({ error: "upstream_error" });
      return;
    }
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();
    res.set({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "Access-Control-Allow-Origin": "*",
    });
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("Image proxy error:", err);
    res.status(502).json({ error: "proxy_failed" });
  }
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    (app as any)(req, res, (err: any) => {
      if (err) reject(err);
      else resolve(undefined);
    });
  });
}
