import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Runs `fn` over `items` with at most `limit` in flight at once, preserving
 *  input order in the result array. Used for chapter downloads, where firing
 *  every page's fetch/decode/re-encode at once can spike memory or blow past
 *  a source's rate limit on a long chapter. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Builds a minimal, valid ZIP archive (STORE method — no compression) from a
 * list of files already in memory. Good enough for a .cbz: comic page images
 * are already compressed (jpeg/webp/png), so re-compressing them would just
 * cost CPU for no size benefit — real CBZ tools store-only for the same
 * reason. Hand-rolled instead of a library (e.g. JSZip) so this doesn't add
 * an npm dependency that can't be verified without running the build here.
 */
export function buildStoreZip(files: { name: string; data: Uint8Array }[]): Blob {
  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0, true);
    local.setUint16(8, 0, true); // compression method: 0 = store
    local.setUint16(10, 0, true);
    local.setUint16(12, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    localParts.push(local.buffer, nameBytes as any, file.data as any);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, 0, true);
    central.setUint16(14, 0, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, 0, true);
    central.setUint32(42, offset, true);
    centralParts.push(central.buffer, nameBytes);

    offset += 30 + nameBytes.length + size;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + (part as ArrayBuffer | Uint8Array).byteLength, 0);
  const centralOffset = offset;

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralOffset, true);
  end.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, end.buffer], { type: "application/zip" });
}

/**
 * Reads a JPEG's own component count straight from its Start Of Frame
 * marker: 1 = grayscale, 3 = YCbCr/RGB, 4 = CMYK. Manga scans are very
 * commonly grayscale JPEGs, so a PDF that always claims /DeviceRGB for a
 * passed-through JPEG would disagree with the actual decoded sample count
 * and misrender (or get rejected by stricter viewers). Falls back to 3 if
 * the stream is malformed or no SOF segment is found.
 */
function jpegComponentCount(bytes: Uint8Array): number {
  let i = 2; // skip the SOI marker (0xFFD8)
  while (i < bytes.length - 1) {
    if (bytes[i] !== 0xFF) { i++; continue; }
    const marker = bytes[i + 1];
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
      i += 2;
      continue;
    }
    if (marker === 0xD9 || i + 3 >= bytes.length) break; // EOI or truncated
    const segLength = (bytes[i + 2] << 8) | bytes[i + 3];
    // SOF0-SOF15, excluding DHT (0xC4), JPG (0xC8) and DAC (0xCC) which
    // share the marker range but aren't frame headers.
    const isSOF = marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
    if (isSOF) {
      // Segment payload: length(2, already consumed) + precision(1) + height(2) + width(2) + numComponents(1)
      const numComponentsOffset = i + 2 + 2 + 1 + 2 + 2;
      return numComponentsOffset < bytes.length ? bytes[numComponentsOffset] : 3;
    }
    i += 2 + segLength;
  }
  return 3;
}

const PDF_COLOR_SPACE_BY_COMPONENTS: Record<number, string> = { 1: "DeviceGray", 3: "DeviceRGB", 4: "DeviceCMYK" };

/**
 * Re-encodes an arbitrary image blob as a JPEG ready to embed in a PDF via
 * DCTDecode (see buildImagesPdf below), returning its pixel dimensions and
 * PDF color space too. Already-JPEG sources are passed through untouched to
 * avoid a pointless (lossy) re-encode — their real color space is read from
 * the JPEG's own SOF marker. Everything else (webp/png/gif/avif) gets
 * canvas-decoded and re-exported as JPEG (canvas always emits 3-component
 * YCbCr/RGB), since PDF can't embed those formats directly without a
 * raw-bitmap path we don't have here.
 */
export async function toPdfPageImage(blob: Blob, contentType: string): Promise<{ width: number; height: number; bytes: Uint8Array; colorSpace: string }> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  try {
    if (contentType === "image/jpeg" || contentType === "image/jpg") {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const colorSpace = PDF_COLOR_SPACE_BY_COMPONENTS[jpegComponentCount(bytes)] || "DeviceRGB";
      return { width, height, bytes, colorSpace };
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    ctx.drawImage(bitmap, 0, 0);
    const jpegBlob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("canvas.toBlob failed"))), "image/jpeg", 0.92);
    });
    return { width, height, bytes: new Uint8Array(await jpegBlob.arrayBuffer()), colorSpace: "DeviceRGB" };
  } finally {
    bitmap.close();
  }
}

/**
 * Builds a minimal PDF (1.4) with one page per image, each page sized to
 * match the image's pixel dimensions and embedding the JPEG directly via
 * the DCTDecode filter — no re-compression, no PDF library. Hand-rolled for
 * the same reason as buildStoreZip: a new npm dependency (e.g. pdf-lib)
 * can't be verified here without running pnpm install / the build.
 */
export function buildImagesPdf(pages: { width: number; height: number; bytes: Uint8Array; colorSpace: string }[]): Blob {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const offsets: number[] = [0]; // index 0 is the free-list head, never used
  let pos = 0;

  const write = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    parts.push(bytes as any);
    pos += bytes.length;
  };
  const beginObj = (num: number) => {
    offsets[num] = pos;
    write(`${num} 0 obj\n`);
  };

  write("%PDF-1.4\n");
  write(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A])); // binary marker comment line

  const objectsPerPage = 3; // page, content stream, image XObject
  const pageObjNum = (i: number) => 3 + i * objectsPerPage;
  const contentObjNum = (i: number) => 4 + i * objectsPerPage;
  const imageObjNum = (i: number) => 5 + i * objectsPerPage;

  // 1: Catalog
  beginObj(1);
  write(`<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);

  // 2: Pages (kids filled in after page objects are known — numbers are
  // deterministic from index, so we can write this before the loop).
  const kids = pages.map((_, i) => `${pageObjNum(i)} 0 R`).join(" ");
  beginObj(2);
  write(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);

  pages.forEach((page, i) => {
    const content = `q\n${page.width} 0 0 ${page.height} 0 0 cm\n/Im0 Do\nQ\n`;
    const contentBytes = encoder.encode(content);

    beginObj(pageObjNum(i));
    write(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] ` +
      `/Resources << /XObject << /Im0 ${imageObjNum(i)} 0 R >> >> /Contents ${contentObjNum(i)} 0 R >>\nendobj\n`
    );

    beginObj(contentObjNum(i));
    write(`<< /Length ${contentBytes.length} >>\nstream\n`);
    write(contentBytes);
    write(`\nendstream\nendobj\n`);

    beginObj(imageObjNum(i));
    write(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
      `/ColorSpace /${page.colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`
    );
    write(page.bytes);
    write(`\nendstream\nendobj\n`);
  });

  const xrefOffset = pos;
  const totalObjects = 2 + pages.length * objectsPerPage + 1; // +1 for object 0
  write(`xref\n0 ${totalObjects}\n0000000000 65535 f \n`);
  for (let n = 1; n < totalObjects; n++) {
    write(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  }
  write(`trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(parts, { type: "application/pdf" });
}

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const OUTDATED_COVERS_MAP: Record<string, string> = {
  "a1c7c1b4-1c69-42b7-849b-730623d6a6a0": "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=256&fit=crop",
  "c52b2ce3-7ee1-4373-8d0c-f9c821aa9a60": "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=256&fit=crop",
  "f81c9a18-97c9-4674-8b65-e9df2586940d": "https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?w=256&fit=crop",
  "a77742b1-d5d4-4df8-af5a-cd63f46ee61d": "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop",
  "2de67eb0-802c-4735-86f7-b08eafcfdb9f": "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=256&fit=crop",
  "c2fe8896-1c7c-47eb-987d-8cd6e537e2db": "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=256&fit=crop",
  "8d89e13d-74d3-488b-a3d8-d652932cb5e9": "https://images.unsplash.com/photo-1501183007986-d0d080b147f9?w=256&fit=crop",
  "df1e2a56-805d-4537-b4d4-28b9fb6f5922": "https://images.unsplash.com/photo-1534972195531-d756b9bda9f2?w=256&fit=crop",
  "98cf292c-fcdb-4eb9-a2ff-11c713b190f8": "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=256&fit=crop",
  "c40f69a5-aaaf-452c-9824-345388e36e65": "https://images.unsplash.com/photo-1580477667995-2b94f01c9516?w=256&fit=crop",
  "12d0959f-d31e-4be0-b9df-7517efeb9863": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=256&fit=crop",
  "2d8c361e-1510-4ed3-a006-a67f975877c8": "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=256&fit=crop",
  "c476722d-3c22-482a-bc91-9e767499709c": "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=256&fit=crop",
  "321e4285-d6dd-41b9-980f-48e4040fdad7": "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=256&fit=crop",
  "30279c67-cb45-424a-aa7e-e3cfeb98ce59": "https://images.unsplash.com/photo-1501183007986-d0d080b147f9?w=256&fit=crop",
  "4876307b-8cee-4905-a6c3-1422790a3566": "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=256&fit=crop",
  "6f2a6db7-bda8-4ab6-8f24-6997424a8735": "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=256&fit=crop",
  "803e0312-7da1-4ed4-b2cc-37e4cfd58850": "https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?w=256&fit=crop",
  "ae39c517-9226-47d8-9172-2c0f1d0c97cb": "https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop",
  "a6e9a6df-a8b2-4d2d-944a-d68a995779c1": "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=256&fit=crop",
  "292e382b-689e-473d-9e63-718227b68a27": "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=256&fit=crop",
  "b0b721ff-c388-4486-aa0f-c83bb490e5fc": "https://images.unsplash.com/photo-1580477667995-2b94f01c9516?w=256&fit=crop",
  "bb3f6ab6-6160-4ca8-98de-4da94fe0190b": "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=256&fit=crop",
  "e0046de8-e21d-4bc6-a979-b1d54b8109bf": "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=256&fit=crop"
};

/**
 * Returns the cover URL routed through our image proxy to bypass
 * hotlinking/CORS restrictions from external CDNs (MangaDex, ComicExtra, etc.)
 * `width`, when given, asks the proxy to resize+re-encode server-side (e.g.
 * catalog grid cards render covers at ~120-200px — no reason to ship a
 * provider's full-resolution art for that) — see api-server's imageProxy.ts.
 */
export function proxyCoverUrl(url: string | undefined | null, width?: number): string | undefined {
  if (!url) return undefined;

  // Clean up outdated hardcoded MangaDex cover references on-the-fly
  for (const [outdatedId, newPlaceholder] of Object.entries(OUTDATED_COVERS_MAP)) {
    if (url.includes(outdatedId)) {
      return newPlaceholder;
    }
  }

  // Already proxied — e.g. a persisted admin-override cover URL, which
  // SafeImage/CatalogCard still pass through here with a width. Returning it
  // untouched (the old behavior) meant those covers silently never got
  // resized; update/clear the `w` param instead of just passing it along.
  // Parsed instead of a substring check: `url` here is provider-supplied
  // (or admin-entered) and a loose `.includes("/api/image-proxy")` would
  // false-positive on any URL that merely contains that text somewhere in
  // its query string, not just our own proxy endpoint.
  let existingProxyUrl: URL | undefined;
  try {
    existingProxyUrl = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  } catch {
    existingProxyUrl = undefined;
  }
  if (existingProxyUrl?.pathname === "/api/image-proxy") {
    // Rebuild on the original string's own base (relative or absolute,
    // whichever `url` was) rather than the resolved URL, so an absolute
    // admin-entered proxy URL doesn't get silently rewritten to relative.
    const [base] = url.split("?");
    const params = existingProxyUrl.searchParams;
    if (width) params.set("w", String(width));
    else params.delete("w");
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      const proxied = `${BASE}/api/image-proxy?url=${encodeURIComponent(url)}`;
      return width ? `${proxied}&w=${width}` : proxied;
    }
  } catch {
    // Not a valid URL — return as-is
  }
  return url;
}

/**
 * Routes a PDF (Google Drive file or direct .pdf URL) through our PDF proxy so
 * pdf.js can fetch the bytes client-side despite CORS.
 */
export function proxyPdfUrl(rawUrl: string): string {
  const driveMatch = rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    return `${BASE}/api/pdf-proxy?driveId=${encodeURIComponent(driveMatch[1])}`;
  }
  return `${BASE}/api/pdf-proxy?url=${encodeURIComponent(rawUrl)}`;
}

/** Builds a Google Drive inline-preview URL for the iframe fallback. */
export function drivePreviewUrl(rawUrl: string): string | null {
  const driveMatch = rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  }
  return null;
}

// Rough check to skip translating text that already looks Portuguese.
export function looksPortuguese(text: string): boolean {
  if (/[ãõçáâàéêíóôú] /.test(text) || /[ãõç]/.test(text)) return true;
  return /\b(que|não|uma|com|para|dos|das|também|é|são|história|editora|edição)\b/i.test(text);
}

const hashStr = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/**
 * Translate a synopsis to Portuguese via the backend (Gemini), cached in
 * localStorage. Returns the original text on failure or if it already looks PT.
 */
export async function translateToPt(text: string | undefined | null): Promise<string> {
  const clean = (text || "").trim();
  if (clean.length < 20 || looksPortuguese(clean)) return clean;
  const cacheKey = `gibi-finder:tr:${hashStr(clean)}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch { /* ignore */ }
  try {
    const res = await fetch(`${BASE}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean }),
    });
    if (!res.ok) return clean;
    const data = await res.json() as { text?: string };
    const out = data.text || clean;
    try { localStorage.setItem(cacheKey, out); } catch { /* ignore */ }
    return out;
  } catch {
    return clean;
  }
}

/**
 * Drops junk descriptions (page navigation, pure credits blocks, placeholders)
 * that some providers return, so we can fall back to an AI-generated synopsis.
 */
export function cleanSynopsis(text?: string | null): string {
  const t = (text || "").trim();
  if (t.length < 15) return "";
  const junk = /ler online|edi[çc][aã]o (anterior|pr[oó]xima)|pr[oó]xima edi[çc][aã]o|↑|◄|►|▲|voltar ao topo|\btopo\b|carregado via|dispon[ií]vel no portal|nenhuma (descri|sinopse)|importad[ao] (de|da)|\bdownloads?\b/i;
  if (junk.test(t)) return "";
  if (/^\s*(escritor|autor|arte por|desenho|roteiro|data de venda)\s*:/i.test(t)) return "";
  return t;
}

/** Fetches an AI-generated pt-BR synopsis for a title (cached in localStorage). */
export async function getGeneratedSynopsis(title: string): Promise<string> {
  const t = (title || "").trim();
  if (!t) return "";
  const cacheKey = `gibi-finder:syn:${hashStr(t.toLowerCase())}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch { /* ignore */ }
  try {
    const res = await fetch(`${BASE}/api/synopsis?title=${encodeURIComponent(t)}`);
    if (!res.ok) return "";
    const data = await res.json() as { text?: string };
    const out = (data.text || "").trim();
    if (out) { try { localStorage.setItem(cacheKey, out); } catch { /* ignore */ } }
    return out;
  } catch {
    return "";
  }
}

// "tankouhentai" (no hyphen) is a duplicate custom-provider registration of
// the same site as "tankou-hentai" — see Explore.tsx's ADULT_PROVIDERS for
// the verified leak this caused when it was missing here.
export const ADULT_PROVIDER_IDS = ["eightmuses", "hentai-home", "hentai-fox", "hentai2read", "hq-desejo", "insta-hentai", "mega-hentai", "mega-hq", "meu-hentai", "my-manga-comics", "nhentai", "quadrinhos-de-sexo", "quadrinhos-eroticos", "universo-hentai", "hentai-teca", "sombras-de-hentai", "superhentais", "hentaidatia", "muitohentai", "tankou-hentai", "tankouhentai"];

/** Whether a provider id belongs to the +18 catalog. */
export const isAdultProviderId = (id?: string | null): boolean => !!id && ADULT_PROVIDER_IDS.includes(id);

// Defaults (1280px/0.78) match the "busca por imagem" upload flow, which
// needs enough detail left for the AI to actually identify the comic.
// Callers with a smaller/lower-stakes use (e.g. a profile avatar, which
// only ever renders at a few dozen px and gets stored as a DB column
// rather than sent to a model) can pass a much smaller maxPx to keep the
// resulting data URI small.
export function fileToBase64(file: File, maxPx = 1280, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const MAX_PX = maxPx;
    const QUALITY = quality;

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_PX || height > MAX_PX) {
        if (width >= height) { height = Math.round(height * MAX_PX / width); width = MAX_PX; }
        else { width = Math.round(width * MAX_PX / height); height = MAX_PX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas context unavailable")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", QUALITY));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    };

    img.src = url;
  });
}

export function formatComicDate(dateStr?: string) {
  if (!dateStr) return "Data Desconhecida";
  // Try to format if it's a valid date, otherwise return as is
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
  } catch {
    return dateStr;
  }
}
