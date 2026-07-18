import { Router, Request, Response } from "express";
import { logger } from "../lib/logger";
import https from "https";
import http from "http";
import { nextDriveKey } from "../lib/driveKeys";

const router = Router();

interface FetchResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  buffer: Buffer;
}

// Follow redirects and buffer the response. PDFs can be large, so callers
// should only point this at reasonable comic files.
function fetchBuffer(url: string, redirects = 0): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error("too_many_redirects"));
      return;
    }
    const client = url.startsWith("https") ? https : http;
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/pdf,*/*;q=0.8",
    };
    const req = client.get(url, { headers }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchBuffer(res.headers.location, redirects + 1).then(resolve).catch(reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk as Buffer));
      res.on("end", () => {
        resolve({ status: res.statusCode || 200, headers: res.headers, buffer: Buffer.concat(chunks) });
      });
    });
    req.on("error", reject);
  });
}

// GET /api/pdf-proxy?driveId=<id>  or  /api/pdf-proxy?url=<encoded>
// Streams a PDF with permissive CORS so pdf.js can render it client-side.
router.get("/pdf-proxy", async (req: Request, res: Response) => {
  const driveId = (req.query.driveId as string) || "";
  const rawUrl = (req.query.url as string) || "";

  let targetUrl = "";
  if (driveId) {
    const apiKey = nextDriveKey();
    // The Drive API media endpoint reliably returns the raw bytes of a public
    // file; fall back to the public download URL when no key is configured.
    targetUrl = apiKey
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?alt=media&key=${apiKey}`
      : `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}`;
  } else if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        res.status(400).json({ error: "invalid_protocol" });
        return;
      }
      targetUrl = rawUrl;
    } catch {
      res.status(400).json({ error: "invalid_url" });
      return;
    }
  } else {
    res.status(400).json({ error: "missing_target", message: "Informe 'driveId' ou 'url'." });
    return;
  }

  try {
    const result = await fetchBuffer(targetUrl);
    if (result.status >= 400) {
      res.status(result.status).json({ error: "upstream_error", message: `Upstream retornou ${result.status}` });
      return;
    }
    res.set({
      "Content-Type": "application/pdf",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "Access-Control-Allow-Origin": "*",
    });
    res.send(result.buffer);
  } catch (err) {
    logger.error({ err: err }, "PDF proxy error:");
    res.status(502).json({ error: "proxy_failed", message: "Falha ao buscar o PDF." });
  }
});

export default router;
