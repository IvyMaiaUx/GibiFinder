import { PageItem, ReaderMode, ReaderDirection, ReaderLayout, ReaderFit, ReaderTheme } from "./readerTypes";
import { useSpreadNavigation } from "./useSpreadNavigation";
import { useGestureViewport } from "./useGestureViewport";
import { usePagePreload } from "./usePagePreload";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertCircle, RotateCcw } from "lucide-react";

interface ReaderViewportProps {
  pages: PageItem[];
  currentIndex: number;
  mode: ReaderMode;
  direction: ReaderDirection;
  layout: ReaderLayout;
  fit: ReaderFit;
  theme?: ReaderTheme;
  brightness?: number;
  onPageChange: (newIndex: number) => void;
  onToggleChrome: () => void;
}

export function ReaderViewport({
  pages,
  currentIndex,
  mode,
  direction,
  layout,
  fit,
  theme = "black",
  brightness = 100,
  onPageChange,
  onToggleChrome,
}: ReaderViewportProps) {
  const [viewportDims, setViewportDims] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1024,
    height: typeof window !== "undefined" ? window.innerHeight : 768,
  }));

  const [failedPages, setFailedPages] = useState<Record<string, boolean>>({});
  const [zoneFlash, setZoneFlash] = useState<"left" | "right" | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setViewportDims({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  // Shared spread navigation hook (handles Cover alone, wide alone, double layout, LTR/RTL)
  const {
    activeGroup,
    handleNext,
    handlePrev,
  } = useSpreadNavigation({
    pages,
    currentPage: currentIndex,
    mode,
    direction,
    layout,
    viewportWidth: viewportDims.width,
    viewportHeight: viewportDims.height,
    onPageChange,
  });

  const handleTapZone = (zone: "left" | "center" | "right") => {
    if (zone === "center") {
      onToggleChrome();
      return;
    }

    if (direction === "rtl") {
      // In RTL (Manga): Left zone advances, Right zone recedes
      if (zone === "left") {
        setZoneFlash("left");
        setTimeout(() => setZoneFlash(null), 200);
        handleNext();
      } else {
        setZoneFlash("right");
        setTimeout(() => setZoneFlash(null), 200);
        handlePrev();
      }
    } else {
      // In LTR: Left zone recedes, Right zone advances
      if (zone === "left") {
        setZoneFlash("left");
        setTimeout(() => setZoneFlash(null), 200);
        handlePrev();
      } else {
        setZoneFlash("right");
        setTimeout(() => setZoneFlash(null), 200);
        handleNext();
      }
    }
  };

  const { containerRef, contentRef, setPositionToTop } = useGestureViewport({
    onTapZone: handleTapZone,
    onSwipePrev: direction === "rtl" ? handleNext : handlePrev,
    onSwipeNext: direction === "rtl" ? handlePrev : handleNext,
    isWebtoon: mode === "webtoon",
  });

  // When changing pages in fit-width mode, reset pan position to top
  const prevIndexRef = useRef(currentIndex);
  useEffect(() => {
    if (prevIndexRef.current !== currentIndex) {
      prevIndexRef.current = currentIndex;
      if (fit === "fit-width") {
        setPositionToTop();
      }
    }
  }, [currentIndex, fit, setPositionToTop]);

  const handleRetry = (pageId: string) => {
    setFailedPages((prev) => ({ ...prev, [pageId]: false }));
  };

  // Determine CSS class based on Fit Mode
  // Note: in fit-width and original, image might exceed viewport height even at 1x;
  // useGestureViewport allows panning when rendered content > container bounds.
  const getFitClasses = () => {
    switch (fit) {
      case "fit-width":
        return "w-full h-auto object-contain";
      case "fit-height":
        return "h-[92dvh] w-auto max-w-none object-contain";
      case "original":
        return "w-auto h-auto max-w-none max-h-none";
      case "fit-screen":
      default:
        return "max-w-full max-h-[92dvh] object-contain";
    }
  };

  // Phase 2: Asynchronous preloading with img.decode() prioritizing current, +2 ahead, -1 behind
  usePagePreload(pages, currentIndex);

  // Phase 2: Strict list virtualization for Webtoon mode with @tanstack/react-virtual
  const webtoonVirtualizer = useVirtualizer({
    count: mode === "webtoon" ? pages.length : 0,
    getScrollElement: () => containerRef.current,
    estimateSize: (idx) => {
      const p = pages[idx];
      if (p?.width && p?.height && p.width > 0) {
        const estimatedW = Math.min(viewportDims.width, 672); // max-w-2xl ~ 672px
        return Math.round((estimatedW * p.height) / p.width);
      }
      return 600; // default estimated page height in pixels
    },
    overscan: 2, // Keep 2 pages ahead and behind rendered in the DOM window
  });

  // In Webtoon mode, scroll to currentIndex when mounted / loaded
  const hasInitialScrolledRef = useRef(false);
  useEffect(() => {
    if (mode !== "webtoon" || hasInitialScrolledRef.current || !containerRef.current) return;
    if (currentIndex > 0 && pages.length > currentIndex) {
      hasInitialScrolledRef.current = true;
      webtoonVirtualizer.scrollToIndex(currentIndex, { align: "start" });
    } else {
      hasInitialScrolledRef.current = true;
    }
  }, [mode, currentIndex, pages.length, webtoonVirtualizer]);

  // In Webtoon mode, use IntersectionObserver to identify most visible page and update currentPage
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const lastReportedPageRef = useRef(currentIndex);

  useEffect(() => {
    if (mode !== "webtoon") return;
    const container = containerRef.current;
    if (!container) return;

    const visibleRatios = new Map<number, number>();
    let throttleTimeout: number | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const indexAttr = entry.target.getAttribute("data-page-index");
          if (indexAttr !== null) {
            const idx = parseInt(indexAttr, 10);
            if (!isNaN(idx)) {
              if (entry.isIntersecting) {
                visibleRatios.set(idx, entry.intersectionRatio);
              } else {
                visibleRatios.delete(idx);
              }
            }
          }
        });

        if (!throttleTimeout) {
          throttleTimeout = window.setTimeout(() => {
            throttleTimeout = null;
            let bestPage = -1;
            let maxRatio = 0;
            visibleRatios.forEach((ratio, pageIdx) => {
              if (ratio > maxRatio) {
                maxRatio = ratio;
                bestPage = pageIdx;
              }
            });
            if (bestPage >= 0 && bestPage !== lastReportedPageRef.current) {
              lastReportedPageRef.current = bestPage;
              onPageChangeRef.current(bestPage);
            }
          }, 150);
        }
      },
      {
        root: container,
        threshold: [0.1, 0.3, 0.5, 0.7, 0.9],
      }
    );

    const pageElements = container.querySelectorAll("[data-page-index]");
    pageElements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      if (throttleTimeout) window.clearTimeout(throttleTimeout);
    };
  }, [mode, pages.length, containerRef]);

  const getThemeBg = () => {
    switch (theme) {
      case "sepia":
        return "bg-[#f4ecd8] text-[#5b4636]";
      case "light":
        return "bg-[#f5f5f5] text-zinc-900";
      case "dark":
        return "bg-[#18181b] text-zinc-100";
      case "black":
      default:
        return "bg-black text-white";
    }
  };

  return (
    <div
      ref={containerRef}
      style={{ touchAction: mode === "webtoon" ? "pan-y" : "none" }}
      className={`relative w-full h-full flex ${mode === "webtoon" ? "overflow-y-auto" : "items-center justify-center overflow-hidden"} select-none ${getThemeBg()}`}
    >
      {/* Subtle touch zone feedback flash (pointer-events-none) */}
      {zoneFlash && (
        <div
          className={`absolute inset-y-0 ${zoneFlash === "left" ? "left-0" : "right-0"} w-1/3 bg-white/10 pointer-events-none transition-opacity duration-200 z-30`}
        />
      )}

      {/* Main Content viewport container */}
      <div
        ref={contentRef}
        style={{ filter: brightness < 100 ? `brightness(${brightness}%)` : undefined }}
        className={`w-full h-full flex ${
          mode === "webtoon"
            ? "flex-col items-center p-2 sm:p-4"
            : "items-center justify-center p-2 sm:p-6 will-change-transform"
        }`}
      >
        {mode === "webtoon" ? (
          // Webtoon Mode: Virtualized continuous vertical flow
          <div
            className="reader-webtoon-flow w-full max-w-2xl relative"
            style={{ height: `${webtoonVirtualizer.getTotalSize()}px` }}
          >
            {webtoonVirtualizer.getVirtualItems().map((virtualRow) => {
              const idx = virtualRow.index;
              const p = pages[idx];
              const pid = p.id || `page-${idx}`;
              const isFailed = failedPages[pid];
              const ratio = p.width && p.height ? `${p.width} / ${p.height}` : "2 / 3";

              if (isFailed) {
                return (
                  <div
                    key={virtualRow.key}
                    ref={webtoonVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    data-page-index={idx}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                      aspectRatio: ratio,
                    }}
                    className="w-full max-w-xl bg-zinc-900 border-2 border-red-500/40 rounded-lg flex flex-col items-center justify-center p-6 text-center text-white my-2"
                  >
                    <AlertCircle className="w-10 h-10 text-red-400 mb-2" />
                    <p className="font-display text-lg">ERRO AO CARREGAR PÁGINA {idx + 1}</p>
                    <button
                      type="button"
                      onClick={() => handleRetry(pid)}
                      className="mt-3 px-4 py-2 bg-primary font-display text-sm rounded border-2 border-white flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-4 h-4" /> RECARREGAR
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={virtualRow.key}
                  ref={webtoonVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  data-page-index={idx}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                    aspectRatio: ratio,
                  }}
                  className="w-full relative flex items-center justify-center bg-zinc-950 min-h-[300px]"
                >
                  <img
                    src={p.url}
                    alt={`Página ${idx + 1}`}
                    loading="lazy"
                    onError={() => setFailedPages((prev) => ({ ...prev, [pid]: true }))}
                    className="w-full h-auto object-contain pointer-events-none block"
                  />
                </div>
              );
            })}
          </div>
        ) : (
          // Paginated Mode: Single or Double Page Spread
          <div
            className={`reader-spread-wrapper w-full h-full flex items-center justify-center gap-2 sm:gap-4 ${activeGroup.isSpread ? "max-w-7xl" : "max-w-4xl"}`}
          >
            {activeGroup.pages.map((p, idx) => {
              const pid = p.id || `p-${currentIndex}-${idx}`;
              const isFailed = failedPages[pid];
              const ratio = p.width && p.height ? `${p.width} / ${p.height}` : "2 / 3";

              if (isFailed) {
                return (
                  <div
                    key={pid}
                    style={{ aspectRatio: ratio }}
                    className="w-full max-h-[90dvh] bg-zinc-900 border-4 border-red-500 rounded-xl flex flex-col items-center justify-center p-6 text-center text-white"
                  >
                    <AlertCircle className="w-12 h-12 text-red-500 mb-3" />
                    <p className="font-display text-xl">ERRO AO CARREGAR IMAGEM</p>
                    <button
                      type="button"
                      onClick={() => handleRetry(pid)}
                      className="mt-4 px-5 py-2.5 bg-primary text-white font-display text-base border-2 border-white rounded-lg flex items-center gap-2 hover:bg-yellow-400 hover:text-black transition-colors"
                    >
                      <RotateCcw className="w-5 h-5" /> TENTAR NOVAMENTE
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={pid}
                  style={{ aspectRatio: fit === "fit-screen" ? ratio : undefined }}
                  className={`relative flex items-center justify-center bg-zinc-950/40 rounded shadow-2xl shrink min-w-0 ${
                    fit === "fit-screen" ? "max-h-[92dvh] max-w-full overflow-hidden" : ""
                  }`}
                >
                  <img
                    src={p.url}
                    alt={`Página ${pages.indexOf(p) + 1}`}
                    onError={() => setFailedPages((prev) => ({ ...prev, [pid]: true }))}
                    className={`${getFitClasses()} pointer-events-none block`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
