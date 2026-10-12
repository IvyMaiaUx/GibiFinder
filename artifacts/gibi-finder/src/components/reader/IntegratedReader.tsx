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
  Activity,
  List,
  Download,
  Loader2,
  Check,
  AlertCircle,
  Sun,
  Moon,
  Palette,
  Sliders,
  Scan,
  FolderOpen
} from "lucide-react";
import { cn, buildStoreZip, toPdfPageImage, buildImagesPdf, mapWithConcurrency, proxyCoverUrl, proxyPdfUrl } from "@/lib/utils";
import { ReaderDiagnostics, DiagInfo } from "./ReaderDiagnostics";
import { resetReaderStats, logRequest } from "./readerStats";
import { saveReadingState, markChapterCompleted } from "@/lib/user-history";
import { cacheChapterPages, isChapterCachedOffline } from "./offlineCache";
import { ChapterItem, ReaderTheme, PanelBox } from "./readerTypes";
import { parseLocalCbzFile } from "./cbzParser";

const PdfReader = React.lazy(() => import("@/components/results/PdfReader").then(m => ({ default: m.PdfReader })));

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

interface IntegratedReaderProps {
  providerId?: string;
  mangaId?: string;
  chapterId?: string;
  title?: string;
  coverUrl?: string;
  pages?: PageItem[];
  chapters?: ChapterItem[];
  initialPage?: number;
  nextChapter?: { id: string; title?: string; coverUrl?: string; pages?: PageItem[] };
  onPrefetchNextChapter?: (nextChapterId: string) => Promise<void> | void;
  onClose?: () => void;
  onSwitchToLegacy?: () => void;
}

export function IntegratedReader({
  providerId,
  mangaId = "demo",
  chapterId: initialChapterId,
  title = "Leitor Integrado",
  coverUrl,
  pages: initialPages,
  chapters: propChapters,
  initialPage = 0,
  nextChapter,
  onPrefetchNextChapter,
  onClose,
  onSwitchToLegacy,
}: IntegratedReaderProps) {
  const isDev = import.meta.env.DEV;

  // Chapters list state
  const [chapters, setChapters] = useState<ChapterItem[]>(propChapters || []);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<ChapterItem | null>(null);

  // Pages state
  const [pages, setPages] = useState<PageItem[]>(initialPages || []);
  const [loadingPages, setLoadingPages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active chapter ID
  const currentChapterId = selectedChapter?.id || initialChapterId || "ch1";

  // Drawer / UI toggles
  const [chapterListOpen, setChapterListOpen] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number; format: string } | null>(null);
  const [isOfflineCached, setIsOfflineCached] = useState(false);

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
    return pages.length > 0 ? pages : (initialPages || []);
  }, [isDev, useMock, pages, initialPages]);

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
  const [theme, setTheme] = useState<ReaderTheme>("black");
  const [brightness, setBrightness] = useState<number>(100);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<boolean>(false);
  const [panelIndex, setPanelIndex] = useState<number>(0);
  const [pagePanels, setPagePanels] = useState<PanelBox[]>([]);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase 6: Handle local .cbz / .zip file upload
  const handleLocalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingPages(true);
    setError(null);
    try {
      const result = await parseLocalCbzFile(file);
      setPages(result.pages);
      setSelectedChapter({
        id: "local-cbz",
        chapterNum: "1",
        title: result.title,
      });
      setCurrentPage(0);
      setPanelIndex(0);
    } catch (err: any) {
      console.error("Erro ao abrir arquivo CBZ:", err);
      setError(err?.message || "Não foi possível ler o arquivo .cbz");
    } finally {
      setLoadingPages(false);
      if (e.target) e.target.value = "";
    }
  };

  // Phase 4.1: Screen Wake Lock API — keep screen awake while reader is active
  useEffect(() => {
    let wakeLockSentinel: any = null;
    let released = false;

    async function requestWakeLock() {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
        try {
          wakeLockSentinel = await (navigator as any).wakeLock.request("screen");
        } catch (err) {
          // May fail if low battery or tab is in background
        }
      }
    }

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !released) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockSentinel && typeof wakeLockSentinel.release === "function") {
        wakeLockSentinel.release().catch(() => {});
      }
    };
  }, []);

  // Phase 3.1: Fetch chapters from real provider if providerId and mangaId are present
  useEffect(() => {
    if (propChapters && propChapters.length > 0) {
      setChapters(propChapters);
      return;
    }
    if (!providerId || !mangaId || mangaId === "demo") return;

    let cancelled = false;
    async function fetchChapters() {
      setLoadingChapters(true);
      try {
        const res = await fetch(`${BASE}/api/providers/chapters?providerId=${providerId}&id=${encodeURIComponent(mangaId)}`);
        if (!res.ok) throw new Error("Falha ao carregar capítulos");
        const data = await res.json() as ChapterItem[];
        if (!cancelled) {
          setChapters(data);
          if (data.length > 0) {
            const current = initialChapterId 
              ? data.find(c => c.id === initialChapterId) || data[0]
              : data[0];
            setSelectedChapter(current);
          }
        }
      } catch (err) {
        console.error("Erro ao buscar capítulos:", err);
      } finally {
        if (!cancelled) setLoadingChapters(false);
      }
    }
    fetchChapters();
    return () => { cancelled = true; };
  }, [providerId, mangaId, propChapters, initialChapterId]);

  // Phase 3.2: Fetch pages when selectedChapter changes
  const loadChapterPages = useCallback(async (targetChapter: ChapterItem) => {
    if (!providerId || !targetChapter.id) return;
    setLoadingPages(true);
    setError(null);
    try {
      const url = `${BASE}/api/providers/pages?providerId=${providerId}&chapterId=${encodeURIComponent(targetChapter.id)}`;
      const t0 = performance.now();
      const res = await fetch(url);
      const ms = Math.round(performance.now() - t0);
      logRequest({ url, kind: "pages", ms, status: res.status, at: Date.now() });
      if (!res.ok) throw new Error("Erro ao carregar páginas do capítulo");
      const data = await res.json() as { url: string; pageNumber?: number }[];
      if (!data || data.length === 0) {
        throw new Error("Nenhuma página retornada para este capítulo");
      }
      const mappedPages: PageItem[] = data.map((p, idx) => ({
        id: `p-${idx + 1}`,
        url: p.url
      }));
      setPages(mappedPages);
      
      // Check offline status
      isChapterCachedOffline(providerId, mangaId, targetChapter.id).then(setIsOfflineCached);
    } catch (err: any) {
      console.error("Falha ao carregar páginas:", err);
      setError(err?.message || "Não foi possível carregar as páginas do capítulo.");
    } finally {
      setLoadingPages(false);
    }
  }, [providerId, mangaId]);

  useEffect(() => {
    if (selectedChapter) {
      loadChapterPages(selectedChapter);
    }
  }, [selectedChapter, loadChapterPages]);

  // Switch to another chapter cleanly: reset page & query params
  const handleSelectChapter = (ch: ChapterItem) => {
    if (ch.id === selectedChapter?.id) {
      setChapterListOpen(false);
      return;
    }
    setSelectedChapter(ch);
    setCurrentPage(0);
    setIsReady(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("p");
      window.history.replaceState(null, "", url.toString());
    }
    setChapterListOpen(false);
  };

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
      if (nextChapter?.coverUrl) {
        const coverImg = new Image();
        coverImg.src = getPageImageUrl(nextChapter.coverUrl);
        if ("decode" in coverImg) coverImg.decode().catch(() => {});
      }
    }
  }, [currentPage, activePages, nextChapter, onPrefetchNextChapter]);

  // Check if Fullscreen API is supported on current browser
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
          currentChapterId ? getReaderProgress(mangaId, currentChapterId) : null,
        ]);
        if (!cancelled && prefs) {
          if (prefs.mode) setMode(prefs.mode);
          if (prefs.direction) setDirection(prefs.direction);
          if (prefs.layout) setLayout(prefs.layout);
          if (prefs.fit) setFit(prefs.fit);
          if (prefs.theme) setTheme(prefs.theme);

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
  }, [mangaId, currentChapterId]);

  // Sync ?p= deep link and persist chapter progress to IndexedDB and Reading History
  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("p", String(newPage + 1));
      window.history.replaceState(null, "", url.toString());
    }
    if (mangaId && currentChapterId) {
      saveReaderProgress(mangaId, currentChapterId, newPage);

      // Phase 3: Save reading history sync
      const progressKey = `${providerId || "local"}-${mangaId}`;
      saveReadingState(
        progressKey,
        {
          chapterId: currentChapterId,
          chapterNum: selectedChapter?.chapterNum || "1",
          pageNumber: newPage + 1,
          totalPages: activePages.length,
          title,
          coverUrl,
          providerId,
          mangaId,
          readerMode: mode === "webtoon" ? "scroll" : "page",
          updatedAt: new Date().toISOString()
        },
        {
          id: `${mangaId}-${currentChapterId}`,
          title,
          coverUrl,
          chapterId: currentChapterId,
          chapterNum: selectedChapter?.chapterNum || "1",
          chapterTitle: selectedChapter?.title,
          providerId: providerId || "local",
          mangaId,
          pageNumber: newPage + 1,
          timestamp: Date.now()
        }
      );

      // Check if last page reached: mark completed
      if (newPage + 1 >= activePages.length && activePages.length > 0) {
        markChapterCompleted({
          providerId: providerId || "local",
          mangaId,
          title,
          coverUrl,
          chapterId: currentChapterId,
          chapterNum: selectedChapter?.chapterNum || "1",
          completedAt: new Date().toISOString()
        });
      }
    }
  }, [mangaId, currentChapterId, providerId, selectedChapter, title, coverUrl, activePages.length, mode]);

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

  const updateTheme = (newTheme: ReaderTheme) => {
    setTheme(newTheme);
    if (mangaId) saveReaderPreferences(mangaId, { theme: newTheme });
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

  // Download chapter as CBZ or PDF
  const handleDownload = async (format: "cbz" | "pdf") => {
    if (downloadProgress || activePages.length === 0) return;
    setDownloadProgress({ done: 0, total: activePages.length, format });

    const safeTitle = (title || "capitulo").replace(/[\\/:*?"<>|]+/g, "_").trim();
    const chapterLabel = selectedChapter?.chapterNum ? `_cap${selectedChapter.chapterNum}` : "";
    const padLength = String(activePages.length).length;

    try {
      const fetchOne = async (page: { url: string }, index: number) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
          const fetchUrl = proxyCoverUrl(page.url) || page.url;
          const res = await fetch(fetchUrl, { signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const contentType = res.headers.get("content-type") || "image/jpeg";
          const blob = await res.blob();
          setDownloadProgress((prev) => prev ? { ...prev, done: prev.done + 1 } : null);
          return { index, blob, contentType };
        } catch (e) {
          console.error(`Erro ao baixar página ${index + 1}:`, e);
          setDownloadProgress((prev) => prev ? { ...prev, done: prev.done + 1 } : null);
          return null;
        } finally {
          clearTimeout(timeout);
        }
      };

      const fetched = await mapWithConcurrency(activePages, 4, fetchOne);
      const valid = fetched.filter((f): f is { index: number; blob: Blob; contentType: string } => f !== null);
      valid.sort((a, b) => a.index - b.index);

      if (valid.length === 0) {
        alert("Não foi possível baixar nenhuma página do capítulo.");
        return;
      }

      if (format === "cbz") {
        const withBytes = await mapWithConcurrency(valid, 4, async ({ index, blob, contentType }) => ({
          name: `${String(index + 1).padStart(padLength, "0")}.${CONTENT_TYPE_EXT[contentType] || "jpg"}`,
          data: new Uint8Array(await blob.arrayBuffer()),
        }));
        const zipBlob = buildStoreZip(withBytes);
        const objUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = `${safeTitle}${chapterLabel}.cbz`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
      } else {
        const images = await mapWithConcurrency(valid, 4, (f) => toPdfPageImage(f.blob, f.contentType));
        const pdfBlob = buildImagesPdf(images);
        const objUrl = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = `${safeTitle}${chapterLabel}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
      }
    } catch (err) {
      console.error(`Erro ao gerar ${format}:`, err);
      alert(`Falha ao gerar o arquivo .${format}`);
    } finally {
      setDownloadProgress(null);
      setDownloadModalOpen(false);
    }
  };

  // Phase 3: Cache chapter for offline reading
  const handleSaveOffline = async () => {
    if (!providerId || !selectedChapter || activePages.length === 0) return;
    setDownloadProgress({ done: 0, total: activePages.length, format: "offline" });
    try {
      await cacheChapterPages(
        providerId,
        mangaId,
        selectedChapter.id,
        selectedChapter.chapterNum,
        title,
        activePages,
        (done, total) => {
          setDownloadProgress({ done, total, format: "offline" });
        }
      );
      setIsOfflineCached(true);
    } catch (err) {
      console.error("Erro ao salvar offline:", err);
    } finally {
      setDownloadProgress(null);
    }
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const isRtl = direction === "rtl";

      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          if (mode === "paginated") {
            e.preventDefault();
            if (isRtl) navHandleNext();
            else navHandlePrev();
          }
          break;

        case "ArrowRight":
        case "d":
        case "D":
          if (mode === "paginated") {
            e.preventDefault();
            if (isRtl) navHandlePrev();
            else navHandleNext();
          }
          break;

        case " ":
          if (mode === "paginated") {
            e.preventDefault();
            navHandleNext();
          }
          break;

        case "f":
        case "F":
          e.preventDefault();
          if (isFullscreenSupported) toggleFullscreen();
          break;

        case "Escape":
          const doc = document as any;
          if (doc.fullscreenElement || doc.webkitFullscreenElement) {
            if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
            else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
          } else if (chapterListOpen) {
            setChapterListOpen(false);
          } else if (onClose) {
            onClose();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, direction, navHandleNext, navHandlePrev, isFullscreenSupported, onClose, chapterListOpen]);

  if (!isReady && !loadingPages) {
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
            <div className="flex items-center gap-2">
              <p className="font-sans text-xs text-zinc-400 font-bold truncate">
                {selectedChapter?.chapterNum ? `Capítulo ${selectedChapter.chapterNum}` : "Capítulo"}
                {mode === "webtoon" ? " · Webtoon" : ` · Página ${currentPage + 1} de ${activePages.length}`}
              </p>
              {isOfflineCached && (
                <span className="text-[10px] font-display bg-emerald-950 text-emerald-400 border border-emerald-600 px-1.5 py-0.2 rounded">
                  OFFLINE
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Chapter Drawer Toggle */}
          {chapters.length > 0 && (
            <button
              type="button"
              onClick={() => setChapterListOpen((v) => !v)}
              className="px-2.5 py-1.5 rounded-md font-display text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/20 flex items-center gap-1.5 touch-target-44"
              title="Lista de Capítulos"
            >
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">CAPÍTULOS</span>
            </button>
          )}

          {/* Download Button */}
          {activePages.length > 0 && (
            <button
              type="button"
              onClick={() => setDownloadModalOpen(true)}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white border border-white/20 touch-target-44"
              title="Baixar Capítulo (CBZ / PDF)"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          {/* Open Local CBZ file button (Phase 6) */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".cbz,.zip"
            onChange={handleLocalFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white border border-white/20 touch-target-44"
            title="Abrir arquivo local .CBZ / .ZIP"
          >
            <FolderOpen className="w-4 h-4" />
          </button>

          {/* Mock toggle for testing — DEV ONLY */}
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

          {/* Guided View / Panel Reading toggle (Phase 5) */}
          {mode === "paginated" && (
            <button
              type="button"
              onClick={() => {
                setPanelMode((v) => !v);
                setPanelIndex(0);
              }}
              className={cn(
                "p-1.5 rounded-lg border border-white/20 text-white touch-target-44 transition-colors",
                panelMode ? "bg-primary text-black border-yellow-300 font-bold" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              )}
              title="Leitura Quadro a Quadro (Guided View)"
            >
              <Scan className="w-4 h-4" />
            </button>
          )}

          {/* Theme & Display Settings toggle */}
          <button
            type="button"
            onClick={() => setThemeModalOpen(true)}
            className={cn(
              "p-1.5 rounded-lg border border-white/20 text-white touch-target-44 transition-colors",
              themeModalOpen ? "bg-amber-500 text-black border-amber-300" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            )}
            title="Ajuste de Tema e Brilho"
          >
            <Palette className="w-4 h-4" />
          </button>

          {/* Fullscreen toggle */}
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

          {/* Diagnostics HUD toggle */}
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
        {loadingPages ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-zinc-400">
            <Loader2 className="w-10 h-10 mb-3 text-primary animate-spin" />
            <p className="font-display text-lg text-white">CARREGANDO CAPÍTULO...</p>
            <p className="font-sans text-xs text-zinc-400 max-w-sm mt-1">
              Buscando páginas do provedor oficial.
            </p>
          </div>
        ) : error ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-zinc-400">
            <AlertCircle className="w-12 h-12 mb-3 text-red-500" />
            <p className="font-display text-lg text-white">FALHA AO ABRIR CAPÍTULO</p>
            <p className="font-sans text-xs text-red-400 max-w-sm mt-1">{error}</p>
            {chapters.length > 0 && (
              <button
                type="button"
                onClick={() => setChapterListOpen(true)}
                className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-display text-xs rounded border border-white/20"
              >
                ESCOLHER OUTRO CAPÍTULO
              </button>
            )}
          </div>
        ) : activePages.length > 0 && activePages[0]?.url?.startsWith("pdf:") ? (
          <React.Suspense
            fallback={
              <div className="w-full h-full flex items-center justify-center text-white">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
              </div>
            }
          >
            <PdfReader
              fileUrl={proxyPdfUrl(activePages[0].url.slice(4))}
              rawUrl={activePages[0].url.slice(4)}
              title={title}
              coverUrl={coverUrl}
              progressKey={mangaId || title}
              providerId={providerId || "curated"}
              mangaId={mangaId}
              chapterId={currentChapterId}
              chapterNum={selectedChapter?.chapterNum || "1"}
              initialPage={currentPage}
              readerMode={mode === "webtoon" ? "scroll" : "page"}
              onClose={() => {
                if (onClose) onClose();
                else if (onSwitchToLegacy) onSwitchToLegacy();
              }}
            />
          </React.Suspense>
        ) : activePages.length === 0 ? (
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
            theme={theme}
            brightness={brightness}
            panelMode={panelMode}
            panelIndex={panelIndex}
            onPanelsDetected={(panels) => setPagePanels(panels)}
            onPageChange={(idx) => {
              setPanelIndex(0);
              handlePageChange(idx);
            }}
            onToggleChrome={toggleChrome}
          />
        )}
      </main>
      {/* Chapters Drawer / Modal */}
      {chapterListOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end animate-in fade-in">
          <div className="w-full max-w-md h-full bg-zinc-950 border-l border-white/20 flex flex-col p-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-display text-lg text-white">CAPÍTULOS ({chapters.length})</h3>
              <button
                type="button"
                onClick={() => setChapterListOpen(false)}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2 space-y-1">
              {loadingChapters ? (
                <div className="p-8 text-center text-zinc-500 font-display text-xs">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                  CARREGANDO CAPÍTULOS...
                </div>
              ) : chapters.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => handleSelectChapter(ch)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg flex items-center justify-between transition-colors border",
                    ch.id === selectedChapter?.id
                      ? "bg-primary/20 border-primary text-white"
                      : "bg-zinc-900/60 border-white/5 hover:bg-zinc-850 text-zinc-300"
                  )}
                >
                  <div>
                    <div className="font-display text-sm">
                      Capítulo {ch.chapterNum} {ch.title ? `· ${ch.title}` : ""}
                    </div>
                    {ch.language && (
                      <span className="text-[10px] text-zinc-500 font-sans uppercase">
                        Idioma: {ch.language}
                      </span>
                    )}
                  </div>
                  {ch.id === selectedChapter?.id && (
                    <Check className="w-4 h-4 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Download / Offline Modal */}
      {downloadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-950 border border-white/20 rounded-xl p-5 comic-shadow">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-display text-lg text-white">BAIXAR CAPÍTULO</h3>
              <button
                type="button"
                onClick={() => setDownloadModalOpen(false)}
                disabled={!!downloadProgress}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {downloadProgress ? (
              <div className="py-6 text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                <p className="font-display text-sm text-white">
                  {downloadProgress.format === "offline" ? "SALVANDO OFFLINE..." : `GERANDO .${downloadProgress.format.toUpperCase()}...`}
                </p>
                <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${Math.round((downloadProgress.done / downloadProgress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-400 font-sans">
                  {downloadProgress.done} de {downloadProgress.total} páginas
                </p>
              </div>
            ) : (
              <div className="py-4 space-y-2.5">
                <button
                  type="button"
                  onClick={() => handleDownload("cbz")}
                  className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 font-display text-xs text-white flex items-center justify-between"
                >
                  <span>Baixar em .CBZ (Padrão de Quadrinhos)</span>
                  <Download className="w-4 h-4 text-primary" />
                </button>

                <button
                  type="button"
                  onClick={() => handleDownload("pdf")}
                  className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 font-display text-xs text-white flex items-center justify-between"
                >
                  <span>Baixar em .PDF</span>
                  <Download className="w-4 h-4 text-primary" />
                </button>

                <button
                  type="button"
                  onClick={handleSaveOffline}
                  className="w-full py-2.5 px-4 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-600/40 font-display text-xs text-emerald-300 flex items-center justify-between"
                >
                  <span>Salvar para Leitura Offline (Cache Local)</span>
                  <Check className="w-4 h-4 text-emerald-400" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Theme and Brightness Adjustment Modal */}
      {themeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-950 border border-white/20 rounded-xl p-5 comic-shadow space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-display text-lg text-white">TEMA E BRILHO</h3>
              <button
                type="button"
                onClick={() => setThemeModalOpen(false)}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Themes Selector */}
            <div className="space-y-2">
              <label className="text-xs font-display text-zinc-400 tracking-wider">COR DE FUNDO</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "black", label: "Preto AMOLED", bg: "bg-black border-zinc-700 text-white" },
                  { id: "dark", label: "Escuro", bg: "bg-zinc-900 border-zinc-700 text-white" },
                  { id: "sepia", label: "Sépia", bg: "bg-[#f4ecd8] border-[#dfd4bc] text-[#5b4636]" },
                  { id: "light", label: "Claro", bg: "bg-zinc-100 border-zinc-300 text-zinc-900" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => updateTheme(t.id as ReaderTheme)}
                    className={cn(
                      "p-2.5 rounded-lg border text-xs font-display flex items-center justify-between transition-transform active:scale-95",
                      t.bg,
                      theme === t.id && "ring-2 ring-primary border-primary font-bold"
                    )}
                  >
                    <span>{t.label}</span>
                    {theme === t.id && <Check className="w-3.5 h-3.5 text-primary" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Brightness Adjustment Slider */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between">
                <label className="text-xs font-display text-zinc-400 tracking-wider flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  BRILHO DO LEITOR
                </label>
                <span className="text-xs font-mono text-zinc-400">{brightness}%</span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="w-full accent-primary h-2 bg-zinc-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Diagnostics HUD Panel (Phase 2) */}
      <ReaderDiagnostics
        open={diagOpen}
        onClose={() => setDiagOpen(false)}
        diag={{
          mode,
          direction,
          fit,
          theme: theme || "black",
          zoom: panelMode ? 1.5 : 1,
          page: currentPage + 1,
          total: activePages.length,
          chapterNum: selectedChapter?.chapterNum || currentChapterId,
          rendered: activePages.length > 0 ? (mode === "webtoon" ? 4 : 2) : 0,
          virtualized: activePages.length,
          preload: 3,
          scrollVirtualized: mode === "webtoon",
          doublePage: layout,
          spreadDetected: false,
          split: panelMode ? "guided" : "none",
          splitActive: panelMode,
          viewport: `${viewportDims.width}x${viewportDims.height}`,
          aspect: Math.round((viewportDims.width / (viewportDims.height || 1)) * 100) / 100,
          orientation: viewportDims.width > viewportDims.height ? "landscape" : "portrait",
          resume: true,
          perWork: true,
          immersion: "normal",
          fullscreen: isFullscreen,
          cursorHidden: false,
        }}
        onReloadChapter={() => selectedChapter && loadChapterPages(selectedChapter)}
        onClearCache={() => resetReaderStats()}
        onTestProvider={() => {}}
      />
    </div>
  );
}
