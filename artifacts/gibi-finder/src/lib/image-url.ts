let stableWidthCache: number | null = null;

/**
 * Calculates a stable target image width once per device session.
 * Uses Math.max(screen.width, screen.height) * devicePixelRatio so that rotating
 * between portrait and landscape DOES NOT change the image URL or invalidate the
 * HTTP/CDN cache or offline downloaded chapters.
 */
export function getStableDeviceTargetWidth(): number {
  if (stableWidthCache !== null) return stableWidthCache;
  if (typeof window === "undefined" || !window.screen) return 1080;

  const dpr = window.devicePixelRatio || 1;
  const maxDim = Math.max(window.screen.width, window.screen.height) * dpr;

  if (maxDim <= 720) {
    stableWidthCache = 720;
  } else if (maxDim <= 1080) {
    stableWidthCache = 1080;
  } else {
    stableWidthCache = 1440;
  }

  return stableWidthCache;
}

/**
 * Appends ?w= ONLY to internal proxy URLs (same origin or configured /api/proxy prefix).
 * External URLs (such as signed CDNs from MangaDex, Bodinho, etc.) pass through completely
 * intact, preventing signature invalidation or unexpected 403 Forbidden errors.
 */
export function getPageImageUrl(url: string, overrideWidth?: number): string {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }

  // Check if it is an internal proxy route
  const isInternalProxy =
    url.startsWith("/api/proxy") ||
    url.startsWith("/api/providers/image") ||
    (typeof window !== "undefined" && url.startsWith(window.location.origin + "/api/proxy"));

  if (!isInternalProxy) {
    // External URLs pass through completely intact
    return url;
  }

  const w = overrideWidth || getStableDeviceTargetWidth();
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    if (parsed.searchParams.has("w")) return url;
    parsed.searchParams.set("w", String(w));
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}
