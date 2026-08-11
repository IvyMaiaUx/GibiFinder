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
// client. Best-effort: if the resize fails for any reason (corrupt/
// unsupported input, ...) this falls back to the untouched original buffer
// rather than breaking the image entirely.
//
// Uses Jimp (pure JavaScript, zero native binaries) rather than sharp: sharp
// is a libvips native binding that esbuild can only `external`-ize, not
// bundle, which left it up to Vercel's dependency tracing to find and ship
// the platform binary alongside the function — it never did, so the resize
// silently no-op'd in production. Jimp has no binary to trace or miss; it
// bundles straight into api/app.mjs like any other dependency.
const MAX_PROXY_WIDTH = 800; // guards against a caller requesting an absurd/abusive size
// Defense in depth beyond Jimp's own decoding — this route is public/
// unauthenticated, so a cover URL pointing at a deliberately oversized/
// decompression-bomb image shouldn't get to spend real CPU/memory decoding
// it just because it was requested with a small `?w=`.
const MAX_INPUT_PIXELS = 40_000_000; // ~40MP, generous for any real cover art
async function resizeIfRequested(buffer: Buffer, contentType: string, widthParam: unknown): Promise<{ buffer: Buffer; contentType: string }> {
  const width = Math.min(Math.max(Number(widthParam) || 0, 0), MAX_PROXY_WIDTH);
  if (!width || !contentType.startsWith("image/") || contentType.includes("svg")) {
    return { buffer, contentType };
  }
  try {
    const { Jimp } = await import("jimp");
    const image = await Jimp.fromBuffer(buffer);
    if (image.width * image.height > MAX_INPUT_PIXELS) {
      return { buffer, contentType };
    }
    // Jimp has no `withoutEnlargement` option, so this is checked by hand —
    // upscaling would waste CPU and produce a larger, blurrier file than the
    // original for no benefit.
    if (image.width > width) {
      image.resize({ w: width });
    }
    const resized = await image.getBuffer("image/jpeg", { quality: 82 });
    return { buffer: resized, contentType: "image/jpeg" };
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
// Public/unauthenticated, so an upstream host that streams forever or a
// response body that keeps growing (either maliciously or a genuinely huge
// file at a hotlinked URL) shouldn't be able to tie up a function instance
// or balloon its memory indefinitely — bounded the same way redirects
// already are above.
const MAX_UPSTREAM_BYTES = 15 * 1024 * 1024; // 15MB — generous for any real cover, well under abuse scale
const UPSTREAM_TIMEOUT_MS = 15_000;

// `deadline` is one absolute wall-clock budget shared across the whole
// redirect chain (and DNS resolution, which has no timeout of its own) —
// passed through on recursive calls so a redirect hop can't reset the clock
// and stretch the real worst case past UPSTREAM_TIMEOUT_MS.
function fetchImage(url: string, headers: any, redirects = 0, deadline?: number): Promise<{ status: number; headers: any; buffer: Buffer }> {
  const overallDeadline = deadline ?? Date.now() + UPSTREAM_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error("too_many_redirects"));
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error("invalid_redirect_url"));
      return;
    }
    resolveAndPinPublicHost(parsed.hostname).then(pinned => {
      const remaining = overallDeadline - Date.now();
      if (remaining <= 0) {
        reject(new Error("upstream_timeout"));
        return;
      }
      const client = parsed.protocol === "https:" ? https : http;
      const req = client.get(url, {
        headers,
        lookup: pinnedLookup(pinned),
      }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); // drain/release this response's socket before following the next hop
          let nextUrl: string;
          try {
            nextUrl = new URL(res.headers.location, url).toString();
          } catch {
            reject(new Error("invalid_redirect_location"));
            return;
          }
          fetchImage(nextUrl, headers, redirects + 1, overallDeadline).then(resolve).catch(reject);
          return;
        }
        const chunks: any[] = [];
        let total = 0;
        res.on("error", reject);
        res.on("data", (chunk) => {
          total += chunk.length;
          if (total > MAX_UPSTREAM_BYTES) {
            res.destroy();
            reject(new Error("upstream_too_large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode || 200,
            headers: res.headers,
            buffer: Buffer.concat(chunks),
          });
        });
      });
      req.setTimeout(remaining, () => req.destroy(new Error("upstream_timeout")));
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
