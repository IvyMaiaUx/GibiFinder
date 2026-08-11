import { Router, Request, Response } from "express";
import { logger } from "../lib/logger";
import https from "https";
import http from "http";
import { isPrivateOrInternalHost, resolveAndPinPublicHost, pinnedLookup } from "../lib/urlSafety";

const router = Router();

// Catalog/search grid cards render covers at ~120-200px, but providers'
// coverUrl is routinely full-resolution (MangaDex's .512.jpg, etc.) — a page
// with ~25 cards was downloading several MB of pixels never shown past
// thumbnail size. `?w=` resizes server-side before the bytes ever reach the
// client. Best-effort: if sharp fails for any reason (corrupt/unsupported
// input, native binding missing on some runtime, ...) this falls back to the
// untouched original buffer rather than breaking the image entirely.
const MAX_PROXY_WIDTH = 800; // guards against a caller requesting an absurd/abusive size
async function resizeIfRequested(buffer: Buffer, contentType: string, widthParam: unknown): Promise<{ buffer: Buffer; contentType: string }> {
  const width = Math.min(Math.max(Number(widthParam) || 0, 0), MAX_PROXY_WIDTH);
  if (!width || !contentType.startsWith("image/") || contentType.includes("svg")) {
    return { buffer, contentType };
  }
  try {
    const sharp = (await import("sharp")).default;
    const resized = await sharp(buffer)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return { buffer: resized, contentType: "image/webp" };
  } catch (err) {
    logger.error({ err }, "Image proxy resize failed, serving original");
    return { buffer, contentType };
  }
}

// This route is public and unauthenticated (it exists to proxy hotlink-
// blocked cover images for anyone browsing the site), so every host it's
// about to connect to — the initial target AND each redirect hop, since a
// public URL can 30x to an internal one just as easily as being one
// directly — has to be checked, not just the URL the caller first supplied.
//
// Resolving the hostname text isn't enough on its own (a domain can answer
// with a public IP right up until the moment we actually connect — "DNS
// rebinding"), so this pins the request's connection to the exact address
// resolveAndPinPublicHost validated via a custom `lookup`, instead of
// letting Node re-resolve DNS independently at connect time.
function fetchImage(url: string, headers: any, redirects = 0): Promise<{ status: number; headers: any; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error("too_many_redirects"));
      return;
    }
    const parsed = new URL(url);
    resolveAndPinPublicHost(parsed.hostname).then(pinned => {
      const client = parsed.protocol === "https:" ? https : http;
      const req = client.get(url, {
        headers,
        lookup: pinnedLookup(pinned),
      }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, url).toString();
          fetchImage(nextUrl, headers, redirects + 1).then(resolve).catch(reject);
          return;
        }
        const chunks: any[] = [];
        res.on("error", reject);
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 200,
            headers: res.headers,
            buffer: Buffer.concat(chunks),
          });
        });
      });
      req.on("error", (err) => reject(err));
    }).catch(reject);
  });
}

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

  // Allow any valid HTTP/HTTPS host to be proxied for covers
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    res.status(400).json({ error: "invalid_protocol", message: "Apenas HTTP/HTTPS são permitidos." });
    return;
  }

  if (isPrivateOrInternalHost(targetUrl.hostname)) {
    res.status(400).json({ error: "blocked_private_url", message: "URLs locais ou privadas não podem ser buscadas." });
    return;
  }

  try {
    const isMangaDex = targetUrl.hostname.includes("mangadex");
    const headers = {
      "User-Agent": isMangaDex 
        ? "GibiFinder/1.0" 
        : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7",
      "Referer": `${targetUrl.protocol}//${targetUrl.hostname}/`,
    };

    const result = await fetchImage(targetUrl.toString(), headers);

    if (result.status >= 400) {
      res.status(result.status).json({ error: "upstream_error", message: `Upstream retornou ${result.status}` });
      return;
    }

    const upstreamContentType = result.headers["content-type"] || "image/jpeg";
    const { buffer, contentType } = await resizeIfRequested(result.buffer, upstreamContentType, req.query.w);

    res.set({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "Access-Control-Allow-Origin": "*",
    });
    res.send(buffer);
  } catch (err) {
    logger.error({ err: err }, "Image proxy error:");
    res.status(502).json({ error: "proxy_failed", message: "Falha ao buscar imagem do servidor externo." });
  }
});

export default router;
