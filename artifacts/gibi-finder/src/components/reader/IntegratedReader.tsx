import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { PageItem, ReaderMode, ReaderDirection, ReaderLayout, ReaderFit } from "./readerTypes";
import { ReaderViewport } from "./ReaderViewport";
import { useSpreadNavigation } from "./useSpreadNavigation";
import { MOCK_READER_PAGES } from "./mockReaderData";
import { getReaderPreferences, saveReaderPreferences, getReaderProgress, saveReaderProgress } from "@/lib/storage";
import { getPageImageUrl } from "@/lib/image-url";
import { 
  ChevronLeft, 
  ChevronRight, 
  Columns2, 
  Square, 
  ScrollText, 
  BookOpen, 
  ArrowLeftRight, 
  History,
  X,
  Sparkles,
  Maximize,
  Minimize,
  Maximize2,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ReaderDiagnostics, DiagInfo } from "./ReaderDiagnostics";
import { readerStats, resetReaderStats } from "./readerStats";

interface IntegratedReaderProps {
  mangaId?: string;
  chapterId?: string;
  title?: string;
  pages?: PageItem[];
  initialPage?: number;
  nextChapter?: { id: string; title?: string; coverUrl?: string; pages?: PageItem[] };
  onPrefetchNextChapter?: (nextChapterId: string) => Promise<void> | void;
  onClose?: () => void;
  onSwitchToLegacy?: () => void;
}

export function IntegratedReader({
  mangaId = "demo",
  chapterId = "ch1",
  title = "Leitor Integrado",
  pages: initialPages,
  initialPage = 0,
  nextChapter,
  onPrefetchNextChapter,
  onClose,
  onSwitchToLegacy,
}: IntegratedReaderProps) {
  const isDev = import.meta.env.DEV;

  // Read initial page from ?p= deep link query param
  const getInitialPageFromUrl = () => {
    if (typeof window === "undefined") return initialPage;
    const p = new URLSearchParams(window.location.search).get("p");
    if (p) {
      const parsed = parseInt(p, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed - 1;
    }
    return initialPage;
  };

  // Mock should ONLY be enabled if isDev AND user explicitly toggles it on
  const [useMock, setUseMock] = useState(false);
  const rawPages = useMemo(() => {
    if (isDev && useMock) return MOCK_READER_PAGES;
    return initialPages || [];
  }, [isDev, useMock, initialPages]);

  // Apply stable breakpoint image URLs memoized to prevent reallocations
  const activePages = useMemo(() => {
    return rawPages.map((p) => ({
      ...p,
      url: getPageImageUrl(p.url),
    }));
  }, [rawPages]);

  const [isReady, setIsReady] = useState(false);
  const [currentPage, setCurrentPage] = useState(getInitialPageFromUrl);
  const [mode, setMode] = useState<ReaderMode>("paginated");
  const [direction, setDirection] = useState<ReaderDirection>("ltr");
  const [layout, setLayout] = useState<ReaderLayout>("auto");
  const [fit, setFit] = useState<ReaderFit>("fit-screen");
  const [chromeVisible, setChromeVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Phase 2: Prefetch next chapter when reading progress reaches >= 80%
  const hasPrefetchedNextChapterRef = useRef(false);
  useEffect(() => {
    if (!activePages || activePages.length === 0) return;
    const progressRatio = (currentPage + 1) / activePages.length;
    if (progressRatio >= 0.8 && !hasPrefetchedNextChapterRef.current) {
      hasPrefetchedNextChapterRef.current = true;
      if (nextChapter?.id && onPrefetchNextChapter) {
        onPrefetchNextChapter(nextChapter.id);
      }
      // Silently prefetch the cover of the next chapter if provided
      if (nextChapter?.coverUrl) {
        const coverImg = new Image();
        coverImg.src = getPageImageUrl(nextChapter.coverUrl);
        if ("decode" in coverImg) coverImg.decode().catch(() => {});
      }
    }
  }, [currentPage, activePages, nextChapter, onPrefetchNextChapter]);

  // Check if Fullscreen API is supported on current browser (e.g. absent on iPhone Safari)
  const isFullscreenSupported = useMemo(() => {
    if (typeof document === "undefined") return false;
    const doc = document as any;
    return !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
  }, []);

  // Restore saved preferences & chapter progress from IndexedDB before rendering viewport
  useEffect(() => {
    let cancelled = false;
    async function loadStoredState() {
      if (mangaId) {
        const [prefs, progress] = await Promise.all([
          getReaderPreferences(mangaId),
          chapterId ? getReaderProgress(mangaId, chapterId) : null,
        ]);
        if (!cancelled && prefs) {
          if (prefs.mode) setMode(prefs.mode);
          if (prefs.direction) setDirection(prefs.direction);
          if (prefs.layout) setLayout(prefs.layout);
          if (prefs.fit) setFit(prefs.fit);

          const pParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("p") : null;
          if (!pParam) {
            if (typeof progress === "number" && progress >= 0) {
              setCurrentPage(progress);
            }
          }
        }
      }
      if (!cancelled) {
        setIsReady(true);
      }
    }
    loadStoredState();
    return () => { cancelled = true; };
  }, [mangaId, chapterId]);

  // Sync ?p= deep link via history.replaceState and persist chapter progress to IndexedDB
  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("p", String(newPage + 1));
      window.history.replaceState(null, "", url.toString());
    }
    if (mangaId && chapterId) {
      saveReaderProgress(mangaId, chapterId, newPage);
    }
  }, [mangaId, chapterId]);

  // Spread navigation hook for Keyboard shortcuts
  const [viewportDims, setViewportDims] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1024,
    height: typeof window !== "undefined" ? window.innerHeight : 768,
  }));

  useEffect(() => {
    const handleResize = () => setViewportDims({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  const {
    handleNext: navHandleNext,
    handlePrev: navHandlePrev,
  } = useSpreadNavigation({
    pages: activePages,
    currentPage,
    mode,
    direction,
    layout,
    viewportWidth: viewportDims.width,
    viewportHeight: viewportDims.height,
    onPageChange: handlePageChange,
  });

  // Save setting changes to IndexedDB
  const updateMode = (newMode: ReaderMode) => {
    setMode(newMode);
    if (mangaId) saveReaderPreferences(mangaId, { mode: newMode });
  };

  const updateDirection = (newDir: ReaderDirection) => {
    setDirection(newDir);
    if (mangaId) saveReaderPreferences(mangaId, { direction: newDir });
  };

  const updateLayout = (newLayout: ReaderLayout) => {
    setLayout(newLayout);
    if (mangaId) saveReaderPreferences(mangaId, { layout: newLayout });
  };

  const updateFit = (newFit: ReaderFit) => {
    setFit(newFit);
    if (mangaId) saveReaderPreferences(mangaId, { fit: newFit });
  };

  // Clamp current page
  useEffect(() => {
    if (currentPage >= activePages.length && activePages.length > 0) {
      handlePageChange(Math.max(0, activePages.length - 1));
    }
  }, [activePages.length, currentPage, handlePageChange]);

  const toggleChrome = () => setChromeVisible((v) => !v);

  // Fullscreen state sync with browser events
  useEffect(() => {
    const onFullscreenChange = () => {
      const doc = document as any;
      setIsFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, []);

  // Toggle Fullscreen with webkit Safari fallback
  const toggleFullscreen = () => {
    if (typeof document === "undefined") return;
    const doc = document as any;
    const elem = containerRef.current as any;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      if (elem?.requestFullscreen) {
        elem.requestFullscreen().catch(() => {});
      } else if (elem?.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      }
    } else {
      if (doc.exitFullscreen) {
        doc.exitFullscreen().catch(() => {});
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      }
    }
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an interactive form control
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      // Ignore shortcuts if modifier keys (Ctrl/Cmd/Alt) are pressed
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const isRtl = direction === "rtl";

      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          if (mode === "paginated") {
            e.preventDefault();
            if (isRtl) {
              navHandleNext();
            } else {
              navHandlePrev();
            }
          }
          break;

        case "ArrowRight":
        case "d":
        case "D":
          if (mode === "paginated") {
            e.preventDefault();
            if (isRtl) {
              navHandlePrev();
            } else {
              navHandleNext();
            }
          }
          break;

        case " ": // Space
          if (mode === "paginated") {
            e.preventDefault();
            navHandleNext();
          }
          // In webtoon, allow default space behavior (native page scroll)
          break;

        case "f":
        case "F":
          e.preventDefault();
          if (isFullscreenSupported) {
            toggleFullscreen();
          }
          break;

        case "Escape":
          const doc = document as any;
          if (doc.fullscreenElement || doc.webkitFullscreenElement) {
            if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
            else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
          } else if (onClose) {
            onClose();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, direction, navHandleNext, navHandlePrev, isFullscreenSupported, onClose]);

  if (!isReady) {
    return (
      <div className="relative w-full h-[100dvh] bg-black flex items-center justify-center text-zinc-500 font-display text-sm tracking-widest">
        CARREGANDO LEITOR...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[100dvh] bg-black text-white overflow-hidden flex flex-col select-none"
    >
      {/* Top Bar Chrome */}
      <header
        className={cn(
          "absolute top-0 inset-x-0 z-40 bg-black/90 backdrop-blur-md border-b-2 border-white/20 transition-transform duration-300 flex items-center justify-between px-4 py-3",
          !chromeVisible && "-translate-y-full pointer-events-none"
        )}
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white touch-target-44"
              title="Voltar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="font-display text-lg sm:text-xl truncate text-white leading-tight">
              {title}
            </h2>
            <p className="font-sans text-xs text-zinc-400 font-bold truncate">
              {mode === "webtoon" ? "Modo Webtoon (Vertical)" : `Página ${currentPage + 1} de ${activePages.length}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mock toggle for testing — ONLY SHOWN IN DEV ENVIRONMENT */}
          {isDev && (
            <button
              type="button"
              onClick={() => setUseMock((v) => !v)}
              className={cn(
                "px-2.5 py-1.5 rounded-md font-display text-xs border border-white/20 flex items-center gap-1 transition-colors touch-target-44",
                useMock ? "bg-amber-400 text-black font-black" : "bg-zinc-800 text-zinc-300"
              )}
              title="Alternar páginas de teste (Mock visível apenas em DEV)"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{useMock ? "MOCK ATIVO" : "MOCK"}</span>
            </button>
          )}

          {/* Fullscreen toggle (rendered only if API is supported by the browser) */}
          {isFullscreenSupported && (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white touch-target-44"
              title="Tela cheia (F)"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          )}

          {/* Diagnostics HUD toggle (Phase 2) */}
          <button
            type="button"
            onClick={() => setDiagOpen((v) => !v)}
            className={cn(
              "p-1.5 rounded-lg border border-white/20 text-white touch-target-44 transition-colors",
              diagOpen ? "bg-emerald-600 text-white border-emerald-400" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            )}
            title="Diagnóstico e Telemetria (HUD)"
          >
            <Activity className="w-4 h-4" />
          </button>

          {/* Switch to Legacy reader */}
          {onSwitchToLegacy && (
            <button
              type="button"
              onClick={onSwitchToLegacy}
              className="px-2.5 py-1.5 rounded-md font-display text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/20 flex items-center gap-1 touch-target-44"
              title="Alternar para o Leitor Legado"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">LEITOR LEGADO</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Viewport */}
      <main className="flex-1 w-full h-full relative">
        {activePages.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-zinc-400">
            <BookOpen className="w-12 h-12 mb-3 text-zinc-600 animate-pulse" />
            <p className="font-display text-lg text-white">NENHUMA PÁGINA CARREGADA</p>
            <p className="font-sans text-xs text-zinc-400 max-w-sm mt-1">
              Aguardando páginas do provedor ou capítulo selecionado.
            </p>
            {isDev && (
              <button
                type="button"
                onClick={() => setUseMock(true)}
                className="mt-4 px-4 py-2 bg-amber-400 text-black font-display text-xs rounded border border-white flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" /> ATIVAR MOCK DE TESTE
              </button>
            )}
          </div>
        ) : (
          <ReaderViewport
            pages={activePages}
            currentIndex={currentPage}
            mode={mode}
            direction={direction}
            layout={layout}
            fit={fit}
            onPageChange={handlePageChange}
            onToggleChrome={toggleChrome}
          />
        )}
      </main>

      {/* Bottom Bar Chrome */}
      <footer
        className={cn(
          "absolute bottom-0 inset-x-0 z-40 bg-black/90 backdrop-blur-md border-t-2 border-white/20 transition-transform duration-300 px-4 py-3",
          !chromeVisible && "translate-y-full pointer-events-none"
        )}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="max-w-3xl mx-auto flex flex-col gap-2">
          {/* Scrubber slider for paginated mode */}
          {mode === "paginated" && activePages.length > 1 && (
            <div className="flex items-center gap-3">
              <span className="font-display text-xs text-zinc-400 w-8 text-right">
                {currentPage + 1}
              </span>
              <input
                type="range"
                min={0}
                max={activePages.length - 1}
                value={currentPage}
                onChange={(e) => handlePageChange(Number(e.target.value))}
                className="flex-1 accent-primary h-2 bg-zinc-800 rounded-lg cursor-pointer"
              />
              <span className="font-display text-xs text-zinc-400 w-8">
                {activePages.length}
              </span>
            </div>
          )}

          {/* Quick Toolbar Toggles */}
          <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar pt-1">
            {/* Mode: Paginated vs Webtoon */}
            <div className="flex items-center bg-zinc-900 border border-white/20 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => updateMode("paginated")}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-display flex items-center gap-1 transition-colors touch-target-44",
                  mode === "paginated" ? "bg-primary text-white" : "text-zinc-400 hover:text-white"
                )}
              >
                <BookOpen className="w-3.5 h-3.5" /> Paginado
              </button>
              <button
                type="button"
                onClick={() => updateMode("webtoon")}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-display flex items-center gap-1 transition-colors touch-target-44",
                  mode === "webtoon" ? "bg-primary text-white" : "text-zinc-400 hover:text-white"
                )}
              >
                <ScrollText className="w-3.5 h-3.5" /> Webtoon
              </button>
            </div>

            {/* Fit mode selector */}
            <div className="flex items-center bg-zinc-900 border border-white/20 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => {
                  const modes: ReaderFit[] = ["fit-screen", "fit-width", "fit-height", "original"];
                  const nextFit = modes[(modes.indexOf(fit) + 1) % modes.length];
                  updateFit(nextFit);
                }}
                className="px-2.5 py-1 rounded text-xs font-display flex items-center gap-1 text-zinc-300 hover:text-white touch-target-44"
                title="Ajuste de imagem: Tela / Largura / Altura / Original"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="capitalize">{fit.replace("fit-", "")}</span>
              </button>
            </div>

            {/* Layout and Direction (only in Paginated) */}
            {mode === "paginated" && (
              <div className="flex items-center gap-1.5">
                {/* Direction: LTR vs RTL */}
                <button
                  type="button"
                  onClick={() => updateDirection(direction === "ltr" ? "rtl" : "ltr")}
                  className="px-2.5 py-1 rounded bg-zinc-900 border border-white/20 text-xs font-display flex items-center gap-1 hover:bg-zinc-800 transition-colors touch-target-44"
                  title="Sentido de leitura: LTR (Ocidental) / RTL (Mangá)"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>{direction.toUpperCase()}</span>
                </button>

                {/* Layout: Auto / Single / Double */}
                <button
                  type="button"
                  onClick={() => {
                    updateLayout(layout === "auto" ? "double" : layout === "double" ? "single" : "auto");
                  }}
                  className="px-2.5 py-1 rounded bg-zinc-900 border border-white/20 text-xs font-display flex items-center gap-1 hover:bg-zinc-800 transition-colors touch-target-44"
                  title="Layout: Automático / Duplo / Página Única"
                >
                  {layout === "single" ? (
                    <Square className="w-3.5 h-3.5" />
                  ) : (
                    <Columns2 className="w-3.5 h-3.5" />
                  )}
                  <span className="capitalize">{layout}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </footer>

      {/* Diagnostics HUD Panel (Phase 2) */}
      <ReaderDiagnostics
        open={diagOpen}
        onClose={() => setDiagOpen(false)}
        diag={{
          mode,
          direction,
          fit,
          theme: "black",
          zoom: 1,
          page: currentPage + 1,
          total: activePages.length,
          chapterNum: chapterId,
          rendered: activePages.length > 0 ? (mode === "webtoon" ? 4 : 2) : 0,
          virtualized: activePages.length,
          preload: 3,
          scrollVirtualized: mode === "webtoon",
          doublePage: layout,
          spreadDetected: false,
          split: "none",
          splitActive: false,
          viewport: `${viewportDims.width}x${viewportDims.height}`,
          aspect: Math.round((viewportDims.width / (viewportDims.height || 1)) * 100) / 100,
          orientation: viewportDims.width > viewportDims.height ? "landscape" : "portrait",
          resume: true,
          perWork: true,
          immersion: "normal",
          fullscreen: isFullscreen,
          cursorHidden: false,
        }}
        onReloadChapter={() => window.location.reload()}
        onClearCache={() => resetReaderStats()}
        onTestProvider={() => {}}
      />
    </div>
  );
}
