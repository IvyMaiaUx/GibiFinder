import { Router, Request, Response } from "express";

const router = Router();

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
  "animesbr.lat",
  "www.animesbr.lat",
  "images.unsplash.com",
];

// GET /api/image-proxy?url=<encoded_url>
// Proxies cover images from external CDNs that block hotlinking.
router.get("/image-proxy", async (req: Request, res: Response) => {
  const rawUrl = req.query.url as string;

  if (!rawUrl) {
    res.status(400).json({ error: "missing_url", message: "O parâmetro 'url' é obrigatório." });
    return;
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: "invalid_url", message: "URL inválida." });
    return;
  }

  // Only allow requests to known CDN hosts
  if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
    res.status(403).json({ error: "forbidden_host", message: "Host não autorizado para proxy." });
    return;
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      headers: {
        // Don't send Referer so CDNs don't block the request
        "User-Agent": "Mozilla/5.0 (compatible; GibiFinder/1.0)",
        Accept: "image/webp,image/avif,image/jpeg,image/png,image/*,*/*",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      res.status(response.status).json({ error: "upstream_error", message: `Upstream retornou ${response.status}` });
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
    res.status(502).json({ error: "proxy_failed", message: "Falha ao buscar imagem do servidor externo." });
  }
});

export default router;
