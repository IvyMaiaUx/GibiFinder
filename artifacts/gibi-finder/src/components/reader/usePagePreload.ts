import { useEffect, useRef } from "react";
import { PageItem } from "./readerTypes";
import { bumpStat } from "./readerStats";

// In-memory set of decoded / ready image URLs
const decodedUrlsCache = new Set<string>();

/**
 * Preloads and decodes images asynchronously using img.decode(),
 * prioritizing the current visible pages, followed by 2 ahead and 1 behind.
 */
export function usePagePreload(pages: PageItem[], currentIndex: number) {
  const activeJobsRef = useRef<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    if (!pages || pages.length === 0) return;

    // Calculate priority window: current page, then 2 ahead, then 1 behind
    const targets: number[] = [];
    if (currentIndex >= 0 && currentIndex < pages.length) targets.push(currentIndex);
    if (currentIndex + 1 < pages.length) targets.push(currentIndex + 1);
    if (currentIndex + 2 < pages.length) targets.push(currentIndex + 2);
    if (currentIndex - 1 >= 0) targets.push(currentIndex - 1);

    const urlsToPreload = targets.map((idx) => pages[idx]?.url).filter(Boolean);

    urlsToPreload.forEach((url) => {
      if (decodedUrlsCache.has(url) || activeJobsRef.current.has(url)) {
        return;
      }

      const img = new Image();
      activeJobsRef.current.set(url, img);
      img.src = url;

      if ("decode" in img && typeof img.decode === "function") {
        img
          .decode()
          .then(() => {
            decodedUrlsCache.add(url);
            bumpStat("loaded");
            activeJobsRef.current.delete(url);
          })
          .catch(() => {
            // Decoding error or aborted; remove from active jobs so it can retry if needed
            activeJobsRef.current.delete(url);
          });
      } else {
        img.onload = () => {
          decodedUrlsCache.add(url);
          bumpStat("loaded");
          activeJobsRef.current.delete(url);
        };
        img.onerror = () => {
          activeJobsRef.current.delete(url);
        };
      }
    });

    // Clean up jobs that fell far outside the window (> 4 pages away)
    const activeJobs = activeJobsRef.current;
    activeJobs.forEach((img, url) => {
      if (!urlsToPreload.includes(url)) {
        img.src = "";
        activeJobs.delete(url);
      }
    });
  }, [pages, currentIndex]);

  return {
    isPreloaded: (url: string) => decodedUrlsCache.has(url),
  };
}
