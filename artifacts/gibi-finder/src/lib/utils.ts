import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
 */
export function proxyCoverUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  
  // Clean up outdated hardcoded MangaDex cover references on-the-fly
  for (const [outdatedId, newPlaceholder] of Object.entries(OUTDATED_COVERS_MAP)) {
    if (url.includes(outdatedId)) {
      return newPlaceholder;
    }
  }

  if (url.includes("/api/image-proxy")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return `${BASE}/api/image-proxy?url=${encodeURIComponent(url)}`;
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

export const ADULT_PROVIDER_IDS = ["eightmuses", "hentai-home", "hentai-fox", "hentai2read", "hq-desejo", "insta-hentai", "mega-hentai", "my-manga-comics", "nhentai", "quadrinhos-de-sexo", "quadrinhos-eroticos", "universo-hentai", "hentai-teca", "sombras-de-hentai"];

/** Whether a provider id belongs to the +18 catalog. */
export const isAdultProviderId = (id?: string | null): boolean => !!id && ADULT_PROVIDER_IDS.includes(id);

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const MAX_PX = 1280;
    const QUALITY = 0.78;

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
