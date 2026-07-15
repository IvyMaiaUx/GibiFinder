import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

/**
 * Returns the cover URL routed through our image proxy to bypass
 * hotlinking/CORS restrictions from external CDNs (MangaDex, ComicExtra, etc.)
 */
export function proxyCoverUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    // Only proxy external URLs (http/https)
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return `${BASE}/api/image-proxy?url=${encodeURIComponent(url)}`;
    }
  } catch {
    // Not a valid URL — return as-is
  }
  return url;
}

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
