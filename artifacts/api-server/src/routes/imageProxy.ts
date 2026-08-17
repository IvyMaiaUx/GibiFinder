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

// Reads just the dimensions out of a file's own header, without decoding the
// pixels — needed so MAX_INPUT_PIXELS can reject an oversized image *before*
// paying for a full decode, not after. A decompression-bomb PNG in
// particular can be a tiny download that unpacks to gigabytes of pixels, so
// checking post-decode (as Jimp's own dimensions would require) defeats the
// point of the guard. Covers the formats Jimp decodes by default (bmp, gif,
// jpeg, png, tiff); an unrecognized signature returns undefined and falls
// through to the post-decode check below as a fallback.
function peekDimensions(buffer: Buffer): { width: number; height: number } | undefined {
  // PNG: 8-byte signature, then the IHDR chunk's length+type (8 bytes) and
  // width/height (4 bytes each, big-endian).
  if (buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  // GIF: "GIF87a"/"GIF89a" signature, then width/height as little-endian uint16.
  if (buffer.length >= 10 && (buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a")) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  // BMP: "BM" signature, width/height as little-endian int32 at offset 18/22.
  if (buffer.length >= 26 && buffer.toString("ascii", 0, 2) === "BM") {
    return { width: buffer.readInt32LE(18), height: Math.abs(buffer.readInt32LE(22)) };
  }
  // JPEG: walk the marker segments for a SOFn (start of frame) marker, which
  // carries the decoded dimensions — everything before it (APPn, COM, etc.)
  // is metadata we can skip over via each segment's own declared length.
  if (buffer.length >= 4 && buffer.readUInt16BE(0) === 0xffd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      // SOF0-SOF15, excluding DHT/JPG/DAC (0xc4/0xc8/0xcc), which aren't frame markers.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }
  return undefined;
}

// Note: Jimp only decodes bmp/gif/jpeg/png/tiff by default — no WebP/AVIF
// (those need extra WASM format plugins this route deliberately doesn't
// pull in, to avoid trading one deploy-packaging risk for another right
// after escaping sharp's). A WebP/AVIF-sourced cover throws inside the try
// below and falls back to serving the original untouched, same as any other
// decode failure — correctness is preserved, only the optimization is
// skipped for that request.
async function resizeIfRequested(buffer: Buffer, contentType: string, widthParam: unknown): Promise<{ buffer: Buffer; contentType: string }> {
  const width = Math.min(Math.max(Number(widthParam) || 0, 0), MAX_PROXY_WIDTH);
  if (!width || !contentType.startsWith("image/") || contentType.includes("svg")) {
    return { buffer, contentType };
  }
  try {
    const knownDimensions = peekDimensions(buffer);
    if (knownDimensions && knownDimensions.width * knownDimensions.height > MAX_INPUT_PIXELS) {
      return { buffer, contentType };
    }
    const { Jimp } = await import("jimp");
    const image = await Jimp.fromBuffer(buffer);
    // Fallback for signatures peekDimensions doesn't recognize — decode
    // already happened by this point, but this still stops an oversized
    // image from being resized/re-encoded (the more expensive operation).
    if (!knownDimensions && image.width * image.height > MAX_INPUT_PIXELS) {
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

/**
 * One retry for a *transient* upstream failure, and only for those.
 *
 * Some hosts answer the same cover URL inconsistently under repeated hits —
 * archive.org in particular alternates between 200 and a reset/timeout, which
 * arrived here as a 502 and, in the UI, as a permanent "capa indisponível":
 * SafeImage gives up on a cover for good once its attempts fail, so a blip
 * lasting one request cost the cover for the whole visit.
 *
 * Deliberately narrow. A 4xx is the upstream's settled answer (hotlink block,
 * dead URL) and retrying only doubles the load for the same reply, so those
 * pass straight through. A 5xx or a connection error is the kind that goes
 * away on its own. The pause is there because retrying instantly usually just
 * catches the far end in the same bad moment.
 *
 * The second attempt gets its own, shorter budget rather than a fresh 15s:
 * the function is capped at 30s (vercel.json), so two full-length attempts
 * back to back could be killed mid-response and turn a recoverable blip into
 * a hard failure — the opposite of the point.
 */
const RETRY_TIMEOUT_MS = 8_000;

async function fetchOnceRetried(url: string, headers: any): Promise<{ status: number; headers: any; buffer: Buffer }> {
  // Called after the pause, so the budget starts from that moment.
  const retry = () => fetchImage(url, headers, 0, Date.now() + RETRY_TIMEOUT_MS);
  try {
    const first = await fetchImage(url, headers);
    if (first.status < 500) return first;
    logger.info({ url, status: first.status }, "image proxy: upstream 5xx, retrying once");
    await new Promise(r => setTimeout(r, 250));
    return await retry();
  } catch (err) {
    logger.info({ url, err }, "image proxy: upstream error, retrying once");
    await new Promise(r => setTimeout(r, 250));
    return await retry();
  }
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

    const result = await fetchOnceRetried(targetUrl.toString(), headers);

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
