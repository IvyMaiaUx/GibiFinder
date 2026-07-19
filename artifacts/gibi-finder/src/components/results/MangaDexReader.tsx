import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  Search, 
  X, 
  ExternalLink, 
  Layers, 
  FileText,
  AlertCircle,
  Globe,
  Database,
  Play,
  Info,
  ZoomIn,
  ZoomOut,
  ChevronsLeft,
  ChevronsRight,
  Settings,
  Scissors,
  Minimize2
} from "lucide-react";
import { cn, proxyPdfUrl, proxyCoverUrl } from "@/lib/utils";
import { SafeImage } from "@/components/ui/SafeImage";
import { useReaderZoom } from "@/components/reader/useReaderZoom";
import { useReaderSettings, readerThemeVars } from "@/components/reader/useReaderSettings";
import { ReaderSettingsPanel } from "@/components/reader/ReaderSettingsPanel";
import { ReaderDiagnostics, type DiagInfo } from "@/components/reader/ReaderDiagnostics";
import { logRequest } from "@/components/reader/readerStats";
import { useAuth } from "@/hooks/use-auth";
import { getLocalProgress, saveReadingState, markChapterCompleted } from "@/lib/user-history";
import { markSourceEmpty, markSourceHasChapters } from "@/lib/empty-sources";

interface MangaDexReaderProps {
  mangaTitle: string;
  coverUrl?: string;
  description?: string;
  initialProviderId?: string;
  initialMangaId?: string;
}

interface UnifiedSearchResult {
  id: string;
  title: string;
  coverUrl?: string;
  description?: string;
  rating?: number;
  sources: {
    providerId: string;
    id: string; // ID original no provedor
    title: string;
  }[];
}

interface Chapter {
  id: string;
  chapterNum: string;
  title: string;
  language: string;
  providerId: string;
}

interface Page {
  url: string;
  pageNumber: number;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Lazy-loaded so pdf.js (~1MB) is only fetched when a PDF chapter is opened.
const PdfReader = lazy(() => import("@/components/results/PdfReader").then(m => ({ default: m.PdfReader })));

export function MangaDexReader({ mangaTitle, coverUrl, description, initialProviderId, initialMangaId }: MangaDexReaderProps) {
  const { user } = useAuth();
  // Tab/Source Navigation
  const [activeTab, setActiveTab] = useState<"aggregator" | "external">("aggregator");
  
  // Aggregator / Multi-Provider States
  const [query, setQuery] = useState(mangaTitle || "");
  const [searching, setSearching] = useState(false);
  const [unifiedResults, setUnifiedResults] = useState<UnifiedSearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<UnifiedSearchResult | null>(null);
  
  const [selectedSource, setSelectedSource] = useState<{ providerId: string; id: string; title: string } | null>(null);
  const [loadingChapters, setLoadingChapters] = useState(false);

  // Fullscreen States & Handlers
  const readerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Virtualization: measured height of each page (keeps off-window spacers the
  // right size so scroll position never jumps).
  const pageHeightsRef = useRef<Record<number, number>>({});
  // Smart double-page: aspect ratio (w/h) of each page, learned on load, so we can
  // detect spreads/covers/panoramas and pair only genuine portrait pages.
  const pageAspectRef = useRef<Record<number, number>>({});
  const pageDimsRef = useRef<Record<number, { w: number; h: number }>>({});
  const lastFetchMsRef = useRef<number | null>(null);
  const [aspectVersion, setAspectVersion] = useState(0);
  const recordAspect = (idx: number, img: HTMLImageElement) => {
    const a = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0;
    if (a) pageDimsRef.current[idx] = { w: img.naturalWidth, h: img.naturalHeight };
    if (a && Math.abs((pageAspectRef.current[idx] ?? 0) - a) > 0.01) {
      pageAspectRef.current[idx] = a;
      setAspectVersion(v => v + 1);
    }
  };
  // Preloader: pages fetched ahead for the next chapter, keyed by chapter id, so
  // advancing is instant and no loading spinner shows.
  const prefetchedPagesRef = useRef<Record<string, Page[]>>({});
  // Swipe tracking for page mode.
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  // Guards the intersection observer from clobbering the saved page while we
  // are auto-scrolling back to it on resume.
  const resumingRef = useRef(false);
  // When resuming into cascade mode, holds the page index we must land on. It
  // also forces every image up to that page to load eagerly so the layout
  // heights are correct before we scroll.
  const [resumeTargetPage, setResumeTargetPage] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // CSS-only immersive mode (hide the chrome). The reader is already a full-screen
  // fixed overlay, so we deliberately avoid the native Fullscreen API: on mobile it
  // exits on scroll/overscroll and locks orientation, which caused repeated bugs.
  // Chrome visibility is `!isFullscreen`; toggleChrome (declared below) flips it.
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [langFilter, setLangFilter] = useState<"pt" | "en" | "all">("all");
  
  const [loadingPages, setLoadingPages] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [showReader, setShowReader] = useState(false);
  const [readerMode, setReaderMode] = useState<"page" | "scroll">("scroll");
  const [error, setError] = useState<string | null>(null);
  // Split-spread: which page indices are split (persisted per work+chapter) and
  // which half is currently shown (0 = first in reading order, 1 = second).
  const [splitSet, setSplitSet] = useState<Set<number>>(new Set());
  const [splitSide, setSplitSide] = useState<0 | 1>(0);

  // Reader preferences (global + per-work overrides) — Phase 4, Priority 1.
  const workId = selectedResult?.id || mangaTitle || undefined;
  const { settings, update: updateSettings, hasWorkOverride } = useReaderSettings(workId);
  const [showSettings, setShowSettings] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  // Immersion level (clean / cinema / immersion) + activity tracking for the
  // auto-hiding cursor and the discrete cinema indicator.
  const immersion = settings.immersion;
  const [uiActive, setUiActive] = useState(true);
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Full chrome (top/bottom bars) shows only in the clean level; cinema/immersion
  // hide it entirely. The cursor hides during inactivity in cinema/immersion.
  const chromeVisible = immersion === "clean" ? !isFullscreen : false;
  const cursorHidden = immersion !== "clean" && !uiActive;

  // Activity tracking (cinema/immersion): reveal cursor + discrete indicator on
  // movement/tap, hide after 2s (desktop) / 3s (touch).
  useEffect(() => {
    if (!showReader || immersion === "clean") { setUiActive(true); return; }
    const coarse = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
    const hideMs = coarse ? 3000 : 2000;
    const poke = () => {
      setUiActive(true);
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      activityTimerRef.current = setTimeout(() => setUiActive(false), hideMs);
    };
    poke();
    window.addEventListener("mousemove", poke);
    window.addEventListener("touchstart", poke, { passive: true });
    window.addEventListener("keydown", poke);
    return () => {
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      window.removeEventListener("mousemove", poke);
      window.removeEventListener("touchstart", poke);
      window.removeEventListener("keydown", poke);
    };
  }, [showReader, immersion]);

  // Native fullscreen must be triggered by a real user gesture — the browser
  // blocks requestFullscreen() called from an effect. So this is invoked from the
  // gesture paths (I / F shortcuts, panel selection), never from the effect below.
  const requestReaderFullscreen = useCallback(() => {
    const el = readerRef.current;
    const coarse = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
    if (!coarse && el?.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => { /* ignore */ });
    }
  }, []);

  // Tie native fullscreen (F key / Immersion, desktop only) to the chrome-hidden
  // state so entering fullscreen hides the header/bars and exiting shows them.
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Immersion (level 3): block image drag / context menu; exit fullscreen on leave.
  useEffect(() => {
    if (!showReader || immersion !== "immersion") return;
    const el = readerRef.current;
    const stopDrag = (e: Event) => e.preventDefault();
    const stopCtx = (e: Event) => { if (settings.blockContextMenu) e.preventDefault(); };
    el?.addEventListener("dragstart", stopDrag);
    el?.addEventListener("contextmenu", stopCtx);
    return () => {
      el?.removeEventListener("dragstart", stopDrag);
      el?.removeEventListener("contextmenu", stopCtx);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { /* ignore */ });
    };
  }, [showReader, immersion, settings.blockContextMenu]);

  // Ctrl+Shift+D toggles the engineering diagnostics overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setShowDiag(v => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // In-reader zoom (pinch + double-tap) — extracted into a reusable hook (Phase 1),
  // now driven by the user's zoom settings.
  const { zoom, setZoom } = useReaderZoom(scrollContainerRef, {
    enabled: showReader,
    // When "remember zoom" is on, keep a stable key so zoom persists across pages.
    resetKey: settings.rememberZoom ? "keep" : `${selectedChapter?.id}-${readerMode}`,
    max: settings.maxZoom,
    doubleTap: settings.doubleTapZoom,
  });

  // Lock the page body while the reader is open so only the reader's own
  // container scrolls (steadier on iOS, where body scroll reveals Safari's bar).
  useEffect(() => {
    if (!showReader) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [showReader]);

  // Auto-hide the interface: whenever the chrome (header/bottom bar) is showing,
  // fade it out after a few seconds so the reading area is unobstructed. A tap
  // brings it back. `isFullscreen === true` means chrome hidden (immersive).
  useEffect(() => {
    if (!showReader || isFullscreen || !settings.autoHideMs || immersion !== "clean") return;
    const t = setTimeout(() => setIsFullscreen(true), settings.autoHideMs);
    return () => clearTimeout(t);
  }, [showReader, isFullscreen, settings.autoHideMs, immersion]);

  const toggleChrome = useCallback(() => setIsFullscreen(prev => !prev), []);

  // Track whether the screen is big enough for side-by-side pages (tablets/desktop).
  const [isLargeScreen, setIsLargeScreen] = useState(
    typeof window !== "undefined" && window.innerWidth >= 820,
  );
  useEffect(() => {
    const onResize = () => setIsLargeScreen(window.innerWidth >= 820);
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [lastReadProgress, setLastReadProgress] = useState<any>(null);
  const [showInfo, setShowInfo] = useState(false);

  const initialSource = initialProviderId && initialMangaId
    ? { providerId: initialProviderId, id: initialMangaId, title: mangaTitle }
    : null;



  // Search across all providers on the backend
  const searchAggregator = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    setUnifiedResults([]);
    setSelectedResult(null);
    setSelectedSource(null);
    setChapters([]);
    setSelectedChapter(null);

    try {
      const url = `${BASE}/api/providers/search?query=${encodeURIComponent(searchQuery)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erro ao consultar agregador");
      const data = await res.json() as UnifiedSearchResult[];
      
      setUnifiedResults(data);
      if (data.length === 1) {
        setSelectedResult(data[0]);
      } else if (data.length > 1) {
        // Let the user select from the list
        setSelectedResult(null);
      } else {
        setError("Nenhuma obra encontrada nos provedores habilitados.");
      }
    } catch (err) {
      console.error(err);
      setError("Falha ao buscar nos provedores. Tente novamente mais tarde.");
    } finally {
      setSearching(false);
    }
  };

  // Load chapters from selected provider source
  const loadChapters = async (source: { providerId: string; id: string; title: string }) => {
    setSelectedSource(source);
    setLoadingChapters(true);
    setChapters([]);
    setSelectedChapter(null);
    setError(null);

    try {
      const url = `${BASE}/api/providers/chapters?providerId=${source.providerId}&id=${encodeURIComponent(source.id)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erro ao carregar capítulos da fonte");
      const data = await res.json() as Chapter[];
      if (data.length === 0) {
        setError(`A fonte ${source.providerId.toUpperCase()} nao retornou capitulos legiveis para esta obra.`);
        markSourceEmpty(source.providerId, source.id);
      } else {
        markSourceHasChapters(source.providerId, source.id);
      }
      setChapters(data);

      // Auto-set language filter based on provider language
      if (source.providerId === "comicextra") {
        setLangFilter("en");
      } else {
        setLangFilter("all");
      }
    } catch (err) {
      console.error(err);
      setError(`Falha ao carregar capítulos do provedor ${source.providerId.toUpperCase()}.`);
    } finally {
      setLoadingChapters(false);
    }
  };

  // Fetch chapter pages from provider
  const readChapter = async (chapter: Chapter, resumePage?: number) => {
    // Advancing to a later chapter means the previous one was finished — mark it
    // as read so "Já Lidos" reflects sequential reading even without hitting the
    // very last page.
    if (showReader && selectedChapter && selectedChapter.id !== chapter.id) {
      const prevNum = parseFloat(selectedChapter.chapterNum);
      const nextNum = parseFloat(chapter.chapterNum);
      if (!isNaN(prevNum) && !isNaN(nextNum) && nextNum > prevNum) {
        markChapterCompleted({
          providerId: selectedSource?.providerId || selectedChapter.providerId,
          mangaId: selectedSource?.id || selectedResult?.id || mangaTitle,
          title: selectedResult?.title || mangaTitle,
          coverUrl: coverUrl || selectedResult?.coverUrl,
          chapterId: selectedChapter.id,
          chapterNum: selectedChapter.chapterNum,
          completedAt: new Date().toISOString()
        }, user?.id);
      }
    }
    setSelectedChapter(chapter);
    setLoadingPages(true);
    // Note: keep the previous pages mounted while the next chapter loads — clearing
    // them here unmounts the reader modal (pages.length === 0), which drops native
    // fullscreen when switching chapters.
    setError(null);

    // Fresh chapter → drop the previous chapter's measured page heights.
    pageHeightsRef.current = {};

    try {
      // Use pages already prefetched for this chapter (instant, no spinner).
      let data = prefetchedPagesRef.current[chapter.id];
      if (!data) {
        const url = `${BASE}/api/providers/pages?providerId=${chapter.providerId}&chapterId=${encodeURIComponent(chapter.id)}`;
        const t0 = performance.now();
        const res = await fetch(url);
        const ms = Math.round(performance.now() - t0);
        lastFetchMsRef.current = ms;
        logRequest({ url, kind: "pages", ms, status: res.status, at: Date.now() });
        if (!res.ok) throw new Error("Erro ao carregar páginas do capítulo");
        data = await res.json() as Page[];
      }

      if (data.length === 0) {
        throw new Error("Nenhuma pagina retornada pelo provedor");
      }

      const progressKey = selectedResult?.id || mangaTitle;
      const savedProgress = getLocalProgress()[progressKey];
      let startPage = resumePage ?? 0;
      if (resumePage === undefined && savedProgress?.chapterId === chapter.id) {
        startPage = Math.max(0, (savedProgress.pageNumber || 1) - 1);
        if (savedProgress.readerMode) {
          setReaderMode(savedProgress.readerMode);
        }
      }

      setCurrentPage(startPage);
      setPages(data);
      setShowReader(true);

      // PDF chapters are handled by <PdfReader>, which manages its own resume;
      // skip the image-reader scroll machinery for them.
      const isPdf = data[0]?.url?.startsWith("pdf:");
      if (!isPdf && startPage > 0) {
        resumingRef.current = true;
        setResumeTargetPage(startPage);
      } else {
        resumingRef.current = false;
        setResumeTargetPage(null);
      }
    } catch (err) {
      console.error(err);
      setError("Falha ao abrir o leitor para este capitulo. A fonte pode ter bloqueado as imagens ou mudado o formato das paginas.");
    } finally {
      setLoadingPages(false);
    }
  };

  const getEmbedUrl = (pageUrl?: string): string | null => {
    if (!pageUrl) return null;
    if (pageUrl.startsWith("embed:")) return pageUrl.slice(6);
    if (/\.pdf(\?|$)/i.test(pageUrl) || /drive\.google\.com\/file/i.test(pageUrl) || /pubhtml5\.com/i.test(pageUrl)) {
      return pageUrl;
    }
    return null;
  };

  // Only pages explicitly marked "external:" open the "abrir fonte" screen.
  // Raw image URLs from providers (https://.../page.jpg) must render as images,
  // NOT be mistaken for external links.
  const isExternalLink = (pageUrl?: string) =>
    !!pageUrl && pageUrl.startsWith("external:");

  const externalHref = (pageUrl?: string) =>
    pageUrl?.startsWith("external:") ? pageUrl.slice("external:".length) : pageUrl;

  const autoResumeReader = async (source: { providerId: string; id: string; title: string }, prog: any) => {
    setSelectedSource(source);
    setLoadingChapters(true);
    setChapters([]);
    setSelectedChapter(null);
    setError(null);

    try {
      const url = `${BASE}/api/providers/chapters?providerId=${source.providerId}&id=${encodeURIComponent(source.id)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erro ao carregar capítulos da fonte");
      const data = await res.json() as Chapter[];
      setChapters(data);

      // Find the chapter to resume: match exact ID first, or match chapter number AND language!
      const targetChapter = data.find(ch => 
        ch.id === prog.chapterId || 
        (ch.chapterNum === prog.chapterNum && ch.language === (prog.language || "pt"))
      );

      if (targetChapter) {
        setSelectedChapter(targetChapter);
        
        // Auto set filter and state language for display
        if (targetChapter.language === "pt" || targetChapter.language === "pt-br") {
          setLangFilter("pt");
        } else if (targetChapter.language === "en") {
          setLangFilter("en");
        } else {
          setLangFilter("all");
        }

        setLoadingPages(true);
        setPages([]);
        
        // Set the page index (pageNumber is 1-indexed, currentPage is 0-indexed)
        const pageIdx = (prog.pageNumber || 1) - 1;
        setCurrentPage(pageIdx);
        if (prog.readerMode) {
          setReaderMode(prog.readerMode);
        }

        const pagesUrl = `${BASE}/api/providers/pages?providerId=${targetChapter.providerId}&chapterId=${encodeURIComponent(targetChapter.id)}`;
        const pagesRes = await fetch(pagesUrl);
        if (!pagesRes.ok) throw new Error();
        const pagesData = await pagesRes.json() as Page[];

        setPages(pagesData);
        setShowReader(true);
        // Open windowed (header + chapter selector visible) rather than immersive.

        // Drive the resume-scroll effect so cascade mode lands on the saved page
        // instead of opening at the top.
        if (pageIdx > 0) {
          resumingRef.current = true;
          setResumeTargetPage(pageIdx);
        } else {
          resumingRef.current = false;
          setResumeTargetPage(null);
        }

        try {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete("resume");
          window.history.replaceState({}, "", newUrl.toString());
        } catch {}
      } else {
        // Fallback: If exact chapter not found, set default lang filter
        if (source.providerId === "comicextra") {
          setLangFilter("en");
        } else {
          setLangFilter("all");
        }
      }
    } catch (err) {
      console.error("Auto resume failed:", err);
      setError("Falha ao resumir a leitura automaticamente. Escolha o capítulo abaixo manualmente.");
    } finally {
      setLoadingChapters(false);
      setLoadingPages(false);
    }
  };

  // Search on mount, or open the exact provider source when the detail URL has one.
  useEffect(() => {
    if (initialSource) {
      setSelectedResult({
        id: `${initialSource.providerId}-${initialSource.id}`,
        title: mangaTitle,
        coverUrl,
        description,
        sources: [initialSource]
      });
      loadChapters(initialSource);
      return;
    }

    if (mangaTitle) {
      searchAggregator(mangaTitle);
    }
  }, [mangaTitle, initialProviderId, initialMangaId]);

  // Load progress on mount/change
  useEffect(() => {
    try {
      const allProgress = getLocalProgress();
      const searchParams = new URLSearchParams(window.location.search);
      const isResume = searchParams.get("resume") === "true";
      const pId = searchParams.get("providerId") || "";
      const mId = searchParams.get("id") || "";
      
      let prog = Object.values(allProgress).find(
        (p: any) => p && p.mangaId === mId && p.providerId === pId
      ) as any;

      if (!prog) {
        const lookupKey = selectedResult?.id || mId || mangaTitle;
        prog = allProgress[lookupKey];
      }
      
      if (prog) {
        setLastReadProgress(prog);
        
        // Auto resume reading if URL flag is set
        if (isResume && !showReader) {
          const activeSource = {
            providerId: prog.providerId || pId || "mangadex",
            id: prog.mangaId || mId,
            title: prog.title || mangaTitle
          };
          autoResumeReader(activeSource, prog);
        }
      } else {
        setLastReadProgress(null);
      }
    } catch {}
  }, [selectedResult, mangaTitle]);

  useEffect(() => {
    // PDF chapters persist their own progress inside <PdfReader>.
    if (showReader && selectedChapter && pages.length > 0 && !pages[0]?.url?.startsWith("pdf:")) {
      try {
        const progressKey = selectedResult?.id || mangaTitle;
        const progress = {
          chapterId: selectedChapter.id,
          chapterNum: selectedChapter.chapterNum,
          pageNumber: currentPage + 1,
          totalPages: pages.length,
          title: selectedResult?.title || mangaTitle,
          coverUrl: selectedResult?.coverUrl,
          providerId: selectedSource?.providerId || selectedChapter.providerId,
          mangaId: selectedSource?.id || selectedResult?.id || mangaTitle,
          language: selectedChapter.language,
          readerMode,
          updatedAt: new Date().toISOString()
        };

        const newEntry = {
          id: `${selectedSource?.providerId || selectedChapter.providerId}-${selectedSource?.id || mangaTitle}-${selectedChapter.id}`,
          title: selectedResult?.title || mangaTitle,
          coverUrl: selectedResult?.coverUrl,
          chapterId: selectedChapter.id,
          chapterNum: selectedChapter.chapterNum,
          chapterTitle: selectedChapter.title,
          providerId: selectedSource?.providerId || selectedChapter.providerId,
          mangaId: selectedSource?.id || selectedResult?.id || mangaTitle,
          language: selectedChapter.language,
          pageNumber: currentPage + 1,
          timestamp: Date.now()
        };

        saveReadingState(progressKey, progress, newEntry, user?.id);

        if (pages.length > 0 && currentPage >= pages.length - 1) {
          markChapterCompleted({
            providerId: selectedSource?.providerId || selectedChapter.providerId,
            mangaId: selectedSource?.id || selectedResult?.id || mangaTitle,
            title: selectedResult?.title || mangaTitle,
            coverUrl: selectedResult?.coverUrl,
            chapterId: selectedChapter.id,
            chapterNum: selectedChapter.chapterNum,
            completedAt: new Date().toISOString()
          }, user?.id);
        }
      } catch (e) {
        console.error("Failed to save progress:", e);
      }
    }
  }, [currentPage, selectedChapter, showReader, pages, selectedResult, mangaTitle, selectedSource, user?.id, readerMode]);

  // Resume: after the reader opens, scroll back to the saved page. Images load
  // asynchronously and grow the layout, so we re-align on every frame until the
  // target's position stabilizes, then hand control back to the observer. The
  // resume aborts the moment the user scrolls or presses a key.
  useEffect(() => {
    const target = resumeTargetPage;
    if (!showReader || pages.length === 0 || target == null || target <= 0) {
      return;
    }

    // Page mode keeps the saved index directly — no scrolling needed.
    if (readerMode !== "scroll") {
      resumingRef.current = false;
      setResumeTargetPage(null);
      return;
    }

    const container = scrollContainerRef.current;
    let cancelled = false;
    let rafId = 0;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let stableCount = 0;
    let lastTop = -1;
    const maxAttempts = 40;

    const finish = () => {
      if (cancelled) return;
      cancelled = true;
      cleanupListeners();
      resumingRef.current = false;
      setResumeTargetPage(null);
    };

    const align = () => {
      if (cancelled) return;
      const el = pageRefs.current[target];
      if (el && container) {
        el.scrollIntoView({ behavior: "auto", block: "start" });
        const top = el.offsetTop;
        stableCount = Math.abs(top - lastTop) < 2 ? stableCount + 1 : 0;
        lastTop = top;
      }
      attempts += 1;
      if (stableCount >= 3 || attempts >= maxAttempts) {
        finish();
        return;
      }
      rafId = requestAnimationFrame(() => { timerId = setTimeout(align, 120); });
    };

    const onUserInteract = () => finish();
    const cleanupListeners = () => {
      container?.removeEventListener("wheel", onUserInteract);
      container?.removeEventListener("touchstart", onUserInteract);
      window.removeEventListener("keydown", onUserInteract);
    };
    container?.addEventListener("wheel", onUserInteract, { passive: true });
    container?.addEventListener("touchstart", onUserInteract, { passive: true });
    window.addEventListener("keydown", onUserInteract);

    rafId = requestAnimationFrame(() => { timerId = setTimeout(align, 60); });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (timerId) clearTimeout(timerId);
      cleanupListeners();
    };
  }, [showReader, pages.length, selectedChapter?.id, readerMode, resumeTargetPage]);

  // Track the current page while scrolling in cascade mode. A scroll-position
  // scan (instead of an IntersectionObserver) is used so it stays correct even
  // for pages taller than the viewport, whose visible ratio never crosses a
  // fixed threshold.
  useEffect(() => {
    if (readerMode !== "scroll" || !showReader || pages.length === 0) return;
    if (pages[0]?.url?.startsWith("pdf:")) return; // PDF chapters track their own page
    const container = scrollContainerRef.current;
    if (!container) return;

    let raf = 0;

    const computeCurrent = () => {
      raf = 0;
      // Don't let scroll tracking overwrite the saved page during a resume.
      if (resumingRef.current) return;
      // "Current" = the last page whose top has passed a marker line 30% down
      // the viewport. Pages render in order, so we can stop at the first one
      // still below the marker.
      const marker = container.getBoundingClientRect().top + container.clientHeight * 0.3;
      let bestIdx = -1;
      for (let i = 0; i < pageRefs.current.length; i++) {
        const el = pageRefs.current[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        // Ignore pages that haven't laid out yet (images still loading, height ~0),
        // otherwise they all stack at the top and the last one gets picked —
        // which would falsely mark the chapter as fully read on open.
        if (rect.height < 40) continue;
        if (rect.top <= marker) bestIdx = i;
        else break;
      }
      if (bestIdx < 0) return; // nothing loaded yet — keep the current page
      setCurrentPage(prev => (prev === bestIdx ? prev : bestIdx));
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(computeCurrent);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    computeCurrent();

    return () => {
      container.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [readerMode, showReader, pages.length, selectedChapter?.id]);

  // Filtered chapters for display
  const filteredChapters = chapters.filter(ch => {
    if (langFilter === "all") return true;
    if (langFilter === "pt") return ch.language === "pt" || ch.language === "pt-br";
    if (langFilter === "en") return ch.language === "en";
    return true;
  });

  // Calculate next and previous chapters in sequence
  const currentChapterIndex = filteredChapters.findIndex(ch => ch.id === selectedChapter?.id);
  const nextChapter = currentChapterIndex > -1 && currentChapterIndex < filteredChapters.length - 1 ? filteredChapters[currentChapterIndex + 1] : null;
  const prevChapter = currentChapterIndex > 0 ? filteredChapters[currentChapterIndex - 1] : null;

  // Virtualization window for cascade mode: only pages within this range mount
  // their <img> (decode + memory); the rest render as height-reserved spacers so
  // the scroll position and page tracking stay correct with no reflow/flicker.
  const V_BEHIND = settings.memorySaver ? 2 : 4;
  const V_AHEAD = settings.memorySaver ? Math.min(settings.preloadAhead, 4) : settings.preloadAhead;
  const vWinStart = Math.max(0, currentPage - V_BEHIND);
  const vWinEnd = Math.min(pages.length - 1, currentPage + V_AHEAD);
  const vMeasured = Object.values(pageHeightsRef.current);
  const vEstHeight = vMeasured.length
    ? Math.round(vMeasured.reduce((a, b) => a + b, 0) / vMeasured.length)
    : Math.round((scrollContainerRef.current?.clientWidth || 700) * 1.4);

  // ---- Smart double-page (page mode, big screens, not zoomed) ----
  // A page counts as a "spread" (panorama / wide scan / cover) when it is wider
  // than tall; those are shown solo, and only genuine portrait pages get paired.
  const doubleActive = readerMode === "page" && settings.doublePage !== "never" && isLargeScreen && zoom === 1;
  const isWidePage = useCallback(
    (idx: number) => (pageAspectRef.current[idx] ?? 0) > 1.15,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aspectVersion],
  );
  const spreads = useMemo<number[][] | null>(() => {
    if (!doubleActive || pages.length === 0) return null;
    const groups: number[][] = [];
    let i = 0;
    while (i < pages.length) {
      if (i === 0) { groups.push([0]); i = 1; continue; }           // cover solo
      if (isWidePage(i)) { groups.push([i]); i += 1; continue; }    // spread solo
      if (i + 1 < pages.length && !isWidePage(i + 1)) { groups.push([i, i + 1]); i += 2; }
      else { groups.push([i]); i += 1; }
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doubleActive, pages.length, isWidePage, settings.doublePage]);
  const currentGroup = spreads ? (spreads.find(g => g.includes(currentPage)) ?? [currentPage]) : null;
  const rtl = settings.direction === "rtl";

  // ---- Auto-fit (page mode) ----
  // Phones always fit width (no horizontal bars); larger screens respect the
  // setting. "auto" fits whole for landscape/spreads, width for portrait/tall.
  const fitFor = (idx: number): "width" | "height" | "whole" => {
    if (!isLargeScreen) return "width";
    if (settings.fitMode !== "auto") return settings.fitMode;
    const a = pageAspectRef.current[idx] ?? 0.68;
    return a > 1.15 ? "whole" : "width";
  };
  const fitClass = (fit: "width" | "height" | "whole") =>
    fit === "width"
      ? "w-full h-auto"
      : fit === "height"
        ? "h-[90dvh] w-auto max-w-full object-contain"
        : "max-h-[90dvh] max-w-full object-contain"; // whole page

  // Keep the current page aligned to the start of its spread so the scrubber and
  // navigation stay consistent when double-page turns on or regroups.
  useEffect(() => {
    if (doubleActive && currentGroup && currentPage !== currentGroup[0]) {
      setCurrentPage(currentGroup[0]);
    }
  }, [doubleActive, currentGroup, currentPage]);

  // ---- Split-spread (manual) ----
  // Renders two virtual pages (A/B) from the SAME <img> via a CSS crop — no new
  // files, no second image. Persisted per work + chapter.
  const splitKey = selectedChapter ? `gibi-finder:reader-split:${workId || ""}:${selectedChapter.id}` : null;
  useEffect(() => {
    if (!splitKey) { setSplitSet(new Set()); setSplitSide(0); return; }
    try {
      const raw = localStorage.getItem(splitKey);
      setSplitSet(new Set(raw ? (JSON.parse(raw) as number[]) : []));
    } catch { setSplitSet(new Set()); }
    setSplitSide(0);
  }, [splitKey]);
  const isSplitActive = (idx: number) => settings.splitMode !== "off" && splitSet.has(idx);
  const toggleSplit = (idx: number) => {
    setSplitSet(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      try { if (splitKey) localStorage.setItem(splitKey, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
    setSplitSide(0);
  };

  // Preloader: once near the end of the chapter, prefetch the next chapter's page
  // list and warm its first images so advancing never shows a loading spinner.
  useEffect(() => {
    if (!showReader || pages.length === 0 || !nextChapter) return;
    if (currentPage < pages.length - 3) return;
    if (prefetchedPagesRef.current[nextChapter.id]) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/providers/pages?providerId=${nextChapter.providerId}&chapterId=${encodeURIComponent(nextChapter.id)}`);
        if (!res.ok || cancelled) return;
        const data = await res.json() as Page[];
        if (cancelled || data.length === 0) return;
        prefetchedPagesRef.current[nextChapter.id] = data;
        // Warm the first images (skip pdf/embed/external markers).
        for (const pg of data.slice(0, 4)) {
          if (pg.url && /^https?:/i.test(pg.url)) {
            const proxied = proxyCoverUrl(pg.url);
            if (proxied) {
              const img = new Image();
              img.src = proxied;
            }
          }
        }
      } catch { /* best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [showReader, currentPage, pages.length, nextChapter]);

  // Page mode: warm the neighbouring pages so turning is instant — no flash/jitter
  // from a page loading from scratch.
  useEffect(() => {
    if (!showReader || readerMode !== "page" || pages.length === 0) return;
    for (const i of [currentPage + 1, currentPage + 2, currentPage - 1]) {
      const url = pages[i]?.url;
      if (url && /^https?:/i.test(url)) {
        const proxied = proxyCoverUrl(url);
        if (proxied) { const img = new Image(); img.src = proxied; }
      }
    }
  }, [showReader, readerMode, currentPage, pages]);

  // Page navigation shared by keyboard, swipe and the bottom bar. In double-page
  // mode it advances a whole spread at a time.
  const goToNextPage = useCallback(() => {
    if (readerMode === "page") {
      // Split-spread: first half -> second half before moving on.
      if (isSplitActive(currentPage) && splitSide === 0) { setSplitSide(1); return; }
      const land = (idx: number) => { setCurrentPage(idx); setSplitSide(0); };
      if (spreads) {
        const gi = spreads.findIndex(g => g.includes(currentPage));
        const next = gi > -1 ? spreads[gi + 1] : null;
        if (next) land(next[0]);
        else if (nextChapter) readChapter(nextChapter);
      } else if (currentPage < pages.length - 1) land(currentPage + 1);
      else if (nextChapter) readChapter(nextChapter);
    } else {
      scrollContainerRef.current?.scrollBy({ top: scrollContainerRef.current.clientHeight * 0.9, behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerMode, currentPage, pages.length, nextChapter, spreads, splitSide, splitSet, settings.splitMode]);

  const goToPrevPage = useCallback(() => {
    if (readerMode === "page") {
      // Split-spread: second half -> first half before moving on.
      if (isSplitActive(currentPage) && splitSide === 1) { setSplitSide(0); return; }
      // Landing on a split page from the previous one shows its LAST half.
      const land = (idx: number) => { setCurrentPage(idx); setSplitSide(isSplitActive(idx) ? 1 : 0); };
      if (spreads) {
        const gi = spreads.findIndex(g => g.includes(currentPage));
        const prev = gi > 0 ? spreads[gi - 1] : null;
        if (prev) land(prev[0]);
        else if (prevChapter) readChapter(prevChapter);
      } else if (currentPage > 0) land(currentPage - 1);
      else if (prevChapter) readChapter(prevChapter);
    } else {
      scrollContainerRef.current?.scrollBy({ top: -scrollContainerRef.current.clientHeight * 0.9, behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerMode, currentPage, prevChapter, spreads, splitSide, splitSet, settings.splitMode]);

  // Keyboard shortcuts: ← → ↑ ↓ Space Home End Esc.
  useEffect(() => {
    if (!showReader || pages.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const container = scrollContainerRef.current;
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault(); (rtl ? goToPrevPage : goToNextPage)(); break;
        case "ArrowLeft":
          e.preventDefault(); (rtl ? goToNextPage : goToPrevPage)(); break;
        case "ArrowDown":
        case " ":
          e.preventDefault(); goToNextPage(); break;
        case "ArrowUp":
          e.preventDefault(); goToPrevPage(); break;
        case "Home":
          e.preventDefault();
          if (readerMode === "page") setCurrentPage(0);
          else container?.scrollTo({ top: 0, behavior: "smooth" });
          break;
        case "End":
          e.preventDefault();
          if (readerMode === "page") setCurrentPage(pages.length - 1);
          else container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
          break;
        case "h": case "H":
          e.preventDefault();
          if (immersion === "clean") setIsFullscreen(v => !v);
          else setUiActive(a => !a);
          break;
        case "c": case "C":
          e.preventDefault();
          updateSettings({ immersion: immersion === "cinema" ? "clean" : "cinema" }, workId ? "work" : "global");
          break;
        case "i": case "I": {
          e.preventDefault();
          const enabling = immersion !== "immersion";
          updateSettings({ immersion: enabling ? "immersion" : "clean" }, workId ? "work" : "global");
          if (enabling) requestReaderFullscreen(); // real user gesture
          break;
        }
        case "f": case "F": {
          e.preventDefault();
          const el = readerRef.current;
          if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
          else el?.requestFullscreen?.().catch(() => {});
          break;
        }
        case "Escape":
          setShowReader(false); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showReader, pages.length, readerMode, goToNextPage, goToPrevPage, rtl, immersion, workId, updateSettings, requestReaderFullscreen]);

  // Jump to a page from the bottom scrubber.
  const goToPage = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, pages.length - 1));
    setCurrentPage(clamped);
    setSplitSide(0);
    if (readerMode === "scroll") {
      resumingRef.current = true;
      pageRefs.current[clamped]?.scrollIntoView({ behavior: "auto", block: "start" });
      window.setTimeout(() => { resumingRef.current = false; }, 200);
    }
  }, [pages.length, readerMode]);

  return (
    <div className="bg-white border-4 border-black p-6 rounded-xl comic-shadow relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 opacity-10 bg-[radial-gradient(black_1px,transparent_1px)] [background-size:8px_8px] pointer-events-none" />

      {/* Selector Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b-4 border-black pb-4">
        <div className="flex items-center gap-2">
          <Database className="w-8 h-8 text-primary" strokeWidth={3} />
          <h3 className="font-display text-2xl tracking-wide uppercase text-black">
            Leitor Agregador Multiprovedor
          </h3>
        </div>

        {/* Tab Selector */}
        <div className="flex border-4 border-black rounded-lg overflow-hidden bg-muted/20">
          <button
            onClick={() => { setActiveTab("aggregator"); setError(null); }}
            className={cn(
              "px-3 py-1.5 font-display text-sm flex items-center gap-1 border-r-2 border-black",
              activeTab === "aggregator" ? "bg-secondary text-black" : "bg-white text-gray-500 hover:bg-muted/50"
            )}
          >
            <Globe className="w-4 h-4" /> PROVEDORES ONLINE
          </button>
          <button
            onClick={() => { setActiveTab("external"); setError(null); }}
            className={cn(
              "px-3 py-1.5 font-display text-sm flex items-center gap-1",
              activeTab === "external" ? "bg-secondary text-black" : "bg-white text-gray-500 hover:bg-muted/50"
            )}
          >
            <ExternalLink className="w-4 h-4" /> LINKS EXTERNOS
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-4 border-black text-black font-bold p-3 mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-primary shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ==================== TAB 1: AGGREGATOR ==================== */}
      {activeTab === "aggregator" && (
        <div className="space-y-6">
          <p className="font-sans font-bold text-gray-600 text-sm">
            Pesquise um título e o Gibi Finder consultará fontes de mangás e HQs em tempo real de forma unificada. Nenhuma imagem é hospedada por nós.
          </p>

          {/* Search bar */}
          <div className="flex gap-2">
            <input 
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquise por Naruto, Spider-Man, Batman, One Piece..."
              className="flex-1 border-4 border-black px-4 py-2 font-sans font-bold text-black focus:outline-none focus:ring-4 focus:ring-secondary rounded-none"
              onKeyDown={(e) => e.key === "Enter" && searchAggregator(query)}
            />
            <button
              onClick={() => searchAggregator(query)}
              disabled={searching}
              className="bg-secondary text-black font-display text-lg px-6 py-2 border-4 border-black hover:bg-yellow-400 transition-colors flex items-center gap-2"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" strokeWidth={3} />}
              PESQUISAR
            </button>
          </div>

          {/* Result groups */}
          {unifiedResults.length > 1 && !selectedResult && (
            <div>
              <span className="font-display text-sm text-gray-500 uppercase block mb-2">Títulos Encontrados:</span>
              <div className="grid grid-cols-1 gap-2">
                {unifiedResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedResult(r)}
                    className="flex items-center gap-3 p-3 border-2 border-black hover:bg-muted/30 text-left font-sans font-bold transition-colors bg-white"
                  >
                    {r.coverUrl ? (
                      <SafeImage src={r.coverUrl} alt={r.title} className="w-10 h-14 object-cover border border-black shrink-0" />
                    ) : (
                      <div className="w-10 h-14 bg-muted border border-black shrink-0 flex items-center justify-center">?</div>
                    )}
                    <div>
                      <h4 className="font-display text-lg leading-tight text-black">{r.title}</h4>
                      <p className="text-xs text-gray-500 mt-1">Disponível em {r.sources.length} provedores</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected group detail card */}
          {selectedResult && (
            <div className="border-4 border-black p-4 bg-muted/10 relative comic-shadow-sm">
              <div className="flex flex-col sm:flex-row gap-4">
                {selectedResult.coverUrl && (
                  <SafeImage
                    src={selectedResult.coverUrl}
                    alt={selectedResult.title}
                    className="w-24 h-36 object-cover border-4 border-black shrink-0 mx-auto sm:mx-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h4 className="font-display text-2xl leading-tight text-black">{selectedResult.title}</h4>
                    <button 
                      onClick={() => setSelectedResult(null)}
                      className="text-gray-400 hover:text-black"
                      title="Voltar para busca"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 mt-2 line-clamp-3 font-semibold font-sans">
                    {selectedResult.description || "Nenhuma descrição fornecida."}
                  </p>

                  {/* Sources selection */}
                  <div className="mt-4 pt-3 border-t-2 border-dashed border-black/20">
                    <span className="font-display text-xs text-gray-500 uppercase block mb-2">Selecione uma fonte de leitura:</span>
                    <div className="flex flex-wrap gap-2">
                      {selectedResult.sources.map((src) => (
                        <button
                          key={`${src.providerId}-${src.id}`}
                          onClick={() => loadChapters(src)}
                          className={cn(
                            "px-3 py-1.5 font-display text-xs border-2 border-black transition-all flex items-center gap-1.5",
                            selectedSource?.providerId === src.providerId && selectedSource?.id === src.id
                              ? "bg-primary text-white comic-shadow-2xs translate-y-[-1px]"
                              : "bg-white text-black hover:bg-muted"
                          )}
                        >
                          <Play className="w-3 h-3 fill-current shrink-0" />
                          {src.providerId.toUpperCase()} ({src.title})
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Reading progress banner */}
          {lastReadProgress && (
            <div className="bg-secondary/20 border-4 border-black p-4 mb-4 flex flex-col sm:flex-row items-center justify-between gap-3 comic-shadow-xs">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg text-black">📖 VOCÊ PAROU AQUI:</span>
                <span className="font-sans font-extrabold text-sm text-gray-800">
                  Capítulo {lastReadProgress.chapterNum} (Página {lastReadProgress.pageNumber})
                </span>
              </div>
              <button
                onClick={async () => {
                  if (!selectedSource || selectedSource.providerId !== lastReadProgress.providerId) {
                    const targetSource = selectedResult?.sources.find(
                      s => s.providerId === lastReadProgress.providerId
                    ) || { providerId: lastReadProgress.providerId, id: lastReadProgress.mangaId, title: lastReadProgress.title };
                    await loadChapters(targetSource);
                  }
                  const targetChapter = {
                    id: lastReadProgress.chapterId,
                    chapterNum: lastReadProgress.chapterNum,
                    title: `Capítulo ${lastReadProgress.chapterNum}`,
                    language: "all",
                    providerId: lastReadProgress.providerId
                  };
                  await readChapter(targetChapter);
                }}
                className="bg-primary text-white font-display text-xs px-4 py-2 border-2 border-black hover:bg-yellow-400 hover:text-black transition-colors"
              >
                CONTINUAR LENDO
              </button>
            </div>
          )}

          {/* Chapters of selected source */}
          {selectedSource && (
            <div className="pt-2 border-t-4 border-dashed border-black/25">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <span className="font-display text-sm text-gray-500 uppercase">
                  Capítulos em {selectedSource.providerId.toUpperCase()}:
                </span>
                
                {/* Languages Filter */}
                <div className="flex border-2 border-black rounded overflow-hidden text-xs font-sans font-bold">
                  <button 
                    onClick={() => setLangFilter("all")}
                    className={cn("px-2.5 py-1 border-r border-black", langFilter === "all" ? "bg-secondary text-black" : "bg-white text-gray-500")}
                  >
                    TODOS
                  </button>
                  <button 
                    onClick={() => setLangFilter("pt")}
                    className={cn("px-2.5 py-1 border-r border-black", langFilter === "pt" ? "bg-secondary text-black" : "bg-white text-gray-500")}
                  >
                    PT-BR 🇧🇷
                  </button>
                  <button 
                    onClick={() => setLangFilter("en")}
                    className={cn("px-2.5 py-1", langFilter === "en" ? "bg-secondary text-black" : "bg-white text-gray-500")}
                  >
                    EN 🇺🇸
                  </button>
                </div>
              </div>

              {loadingChapters ? (
                <div className="py-8 flex items-center justify-center gap-2 font-display text-lg text-black">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  CARREGANDO CAPÍTULOS...
                </div>
              ) : filteredChapters.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-2 border-4 border-black p-3 bg-white">
                  {filteredChapters.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => readChapter(ch)}
                      disabled={loadingPages}
                      className="p-2 border-2 border-black text-center font-sans font-bold text-sm bg-muted/20 hover:bg-secondary/40 transition-colors truncate text-black flex justify-between items-center gap-1"
                      title={ch.title}
                    >
                      <span className="truncate">Cap. {ch.chapterNum}</span>
                      <span className="text-2xs font-extrabold uppercase bg-black/10 px-1 rounded shrink-0">
                        {ch.language.toUpperCase()}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center font-sans font-bold text-gray-400 border-2 border-dashed border-black/20">
                  Nenhum capítulo disponível para os filtros selecionados.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 2: EXTERNAL SEARCH (Ads styled) ==================== */}
      {activeTab === "external" && (
        <div className="space-y-6">
          <p className="font-sans font-bold text-gray-600 text-sm">
            Não encontrou o que procurava em nossos provedores internos? Encontre a obra desejada buscando diretamente nestes indexadores externos:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <a
              href="https://pubhtml5.com/wydw/aero/Turma_da_M%C3%B4nica_Jovem_II_-_Edi%C3%A7%C3%A3o_01/"
              target="_blank"
              rel="noreferrer"
              className="relative p-6 border-4 border-black bg-green-100 hover:bg-green-200 transition-all comic-shadow-sm flex flex-col justify-between group"
            >
              <div>
                <span className="absolute top-2 right-2 bg-secondary text-black text-2xs font-display px-2 py-0.5 border-2 border-black -rotate-2">NACIONAL</span>
                <h4 className="font-display text-xl text-black tracking-wide">TURMA DA MÔNICA JOVEM II</h4>
                <p className="font-sans text-xs font-bold text-gray-700 mt-2">
                  Edição 01 no PubHTML5 — leitor flipbook online.
                </p>
              </div>
              <span className="mt-4 font-display text-sm text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                LER NO PUBHTML5 <ChevronRight className="w-4 h-4" />
              </span>
            </a>

            <a
              href="https://verboaria.com.br/wp-content/uploads/2020/04/Cebolinha-107.pdf"
              target="_blank"
              rel="noreferrer"
              className="relative p-6 border-4 border-black bg-lime-100 hover:bg-lime-200 transition-all comic-shadow-sm flex flex-col justify-between group"
            >
              <div>
                <h4 className="font-display text-xl text-black tracking-wide">CEBOLINHA #107 (PDF)</h4>
                <p className="font-sans text-xs font-bold text-gray-700 mt-2">
                  PDF direto da Verboaria para leitura ou download.
                </p>
              </div>
              <span className="mt-4 font-display text-sm text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                ABRIR PDF <ChevronRight className="w-4 h-4" />
              </span>
            </a>

            <a
              href="https://sites.google.com/educacao.quintana.sp.gov.br/biblioteca-virtual/hist%C3%B3rias-em-quadrinhos"
              target="_blank"
              rel="noreferrer"
              className="relative p-6 border-4 border-black bg-purple-100 hover:bg-purple-200 transition-all comic-shadow-sm flex flex-col justify-between group"
            >
              <div>
                <h4 className="font-display text-xl text-black tracking-wide">BIBLIOTECA QUINTANA</h4>
                <p className="font-sans text-xs font-bold text-gray-700 mt-2">
                  HQs em quadrinhos da educação de Quintana/SP (Google Sites).
                </p>
              </div>
              <span className="mt-4 font-display text-sm text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                ABRIR CATÁLOGO <ChevronRight className="w-4 h-4" />
              </span>
            </a>

            <a
              href="https://drive.google.com/drive/folders/1Etdsik4rGHDhNv5g4_8J_DDTuuvvlunN"
              target="_blank"
              rel="noreferrer"
              className="relative p-6 border-4 border-black bg-sky-100 hover:bg-sky-200 transition-all comic-shadow-sm flex flex-col justify-between group"
            >
              <div>
                <h4 className="font-display text-xl text-black tracking-wide">BIBLIOTECA GOOGLE DRIVE</h4>
                <p className="font-sans text-xs font-bold text-gray-700 mt-2">
                  Pasta compartilhada com PDFs de quadrinhos.
                </p>
              </div>
              <span className="mt-4 font-display text-sm text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                ABRIR PASTA <ChevronRight className="w-4 h-4" />
              </span>
            </a>

            <a
              href="https://liveuel-my.sharepoint.com/:f:/g/personal/desireebt_1310_live_uel_br/Eg-xTek0aHVGmknAwok3WNsBn5MY46O7QX862ZwlntLPJg?e=NTwbC6"
              target="_blank"
              rel="noreferrer"
              className="relative p-6 border-4 border-black bg-indigo-100 hover:bg-indigo-200 transition-all comic-shadow-sm flex flex-col justify-between group sm:col-span-2"
            >
              <div>
                <span className="absolute top-2 right-2 bg-primary text-white text-2xs font-display px-2 py-0.5 border-2 border-black rotate-2">UEL</span>
                <h4 className="font-display text-xl text-black tracking-wide">BIBLIOTECA SHAREPOINT UEL</h4>
                <p className="font-sans text-xs font-bold text-gray-700 mt-2">
                  Acervo compartilhado no SharePoint da Universidade Estadual de Londrina.
                </p>
              </div>
              <span className="mt-4 font-display text-sm text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                ABRIR SHAREPOINT <ChevronRight className="w-4 h-4" />
              </span>
            </a>
            
            {/* Retro Ad Box 1: Google */}
            <a 
              href={`https://www.google.com/search?q=${encodeURIComponent(query + " ler online hq gibi pdf")}`}
              target="_blank" 
              rel="noreferrer"
              className="relative p-6 border-4 border-black bg-yellow-100 hover:bg-yellow-200 transition-all comic-shadow-sm flex flex-col justify-between group"
            >
              <div>
                <span className="absolute top-2 right-2 bg-primary text-white text-2xs font-display px-2 py-0.5 border-2 border-black rotate-3">POPULAR</span>
                <h4 className="font-display text-xl text-black tracking-wide">BUSCA NO GOOGLE</h4>
                <p className="font-sans text-xs font-bold text-gray-700 mt-2">
                  Procure PDFs compartilhados, drives públicos ou sites alternativos de leitura para: "{query}"
                </p>
              </div>
              <span className="mt-4 font-display text-sm text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                BUSCAR AGORA <ChevronRight className="w-4 h-4" />
              </span>
            </a>

            {/* Retro Ad Box 2: HQ Livre */}
            <a 
              href={`https://www.google.com/search?q=${encodeURIComponent(query + " site:hqlivre.net")}`}
              target="_blank" 
              rel="noreferrer"
              className="relative p-6 border-4 border-black bg-red-100 hover:bg-red-200 transition-all comic-shadow-sm flex flex-col justify-between group"
            >
              <div>
                <h4 className="font-display text-xl text-black tracking-wide">BUSCA NO HQ LIVRE</h4>
                <p className="font-sans text-xs font-bold text-gray-700 mt-2">
                  Maior acervo de HQs americanas e europeias de super-heróis em português.
                </p>
              </div>
              <span className="mt-4 font-display text-sm text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                ABRIR BUSCA <ChevronRight className="w-4 h-4" />
              </span>
            </a>

            {/* Retro Ad Box 3: ReadComicOnline */}
            <a 
              href={`https://readcomiconline.li/Search/Comic?keyword=${encodeURIComponent(query)}`}
              target="_blank" 
              rel="noreferrer"
              className="relative p-6 border-4 border-black bg-blue-100 hover:bg-blue-200 transition-all comic-shadow-sm flex flex-col justify-between group"
            >
              <div>
                <span className="absolute top-2 right-2 bg-secondary text-black text-2xs font-display px-2 py-0.5 border-2 border-black -rotate-3">USA / EN</span>
                <h4 className="font-display text-xl text-black tracking-wide">READCOMICONLINE</h4>
                <p className="font-sans text-xs font-bold text-gray-700 mt-2">
                  Maior repositório mundial de HQs americanas digitalizadas em inglês.
                </p>
              </div>
              <span className="mt-4 font-display text-sm text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                BUSCAR NO PORTAL <ChevronRight className="w-4 h-4" />
              </span>
            </a>

            {/* Retro Ad Box: Bakai (hentai +18) */}
            <a
              href={`https://bakai.org/?s=${encodeURIComponent(query)}`}
              target="_blank"
              rel="noreferrer"
              className="relative p-6 border-4 border-black bg-rose-100 hover:bg-rose-200 transition-all comic-shadow-sm flex flex-col justify-between group"
            >
              <div>
                <span className="absolute top-2 right-2 bg-primary text-white text-2xs font-display px-2 py-0.5 border-2 border-black rotate-3">+18</span>
                <h4 className="font-display text-xl text-black tracking-wide">BAKAI</h4>
                <p className="font-sans text-xs font-bold text-gray-700 mt-2">
                  Acervo de hentai/doujinshi em português. Busca por "{query}".
                </p>
              </div>
              <span className="mt-4 font-display text-sm text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                BUSCAR NO BAKAI <ChevronRight className="w-4 h-4" />
              </span>
            </a>

            {/* Retro Ad Box: MegaHentai (hentai +18) */}
            <a
              href={`https://megahentai.biz/?s=${encodeURIComponent(query)}`}
              target="_blank"
              rel="noreferrer"
              className="relative p-6 border-4 border-black bg-pink-100 hover:bg-pink-200 transition-all comic-shadow-sm flex flex-col justify-between group"
            >
              <div>
                <span className="absolute top-2 right-2 bg-primary text-white text-2xs font-display px-2 py-0.5 border-2 border-black -rotate-2">+18</span>
                <h4 className="font-display text-xl text-black tracking-wide">MEGAHENTAI</h4>
                <p className="font-sans text-xs font-bold text-gray-700 mt-2">
                  Hentai legendado/sem censura em português. Busca por "{query}".
                </p>
              </div>
              <span className="mt-4 font-display text-sm text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                BUSCAR NO MEGAHENTAI <ChevronRight className="w-4 h-4" />
              </span>
            </a>

            {/* Retro Ad Box 4: MangaDex Site */}
            <a 
              href={`https://mangadex.org/search?q=${encodeURIComponent(query)}`}
              target="_blank" 
              rel="noreferrer"
              className="relative p-6 border-4 border-black bg-emerald-100 hover:bg-emerald-200 transition-all comic-shadow-sm flex flex-col justify-between group"
            >
              <div>
                <h4 className="font-display text-xl text-black tracking-wide">PORTAL MANGADEX</h4>
                <p className="font-sans text-xs font-bold text-gray-700 mt-2">
                  Acesse diretamente o site do MangaDex para ver comentários e artes de fãs.
                </p>
              </div>
              <span className="mt-4 font-display text-sm text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                IR PARA O SITE <ChevronRight className="w-4 h-4" />
              </span>
            </a>

          </div>
        </div>
      )}

      {/* ==================== PDF READER (pdf.js) ==================== */}
      {showReader && pages.length > 0 && selectedChapter && pages[0]?.url?.startsWith("pdf:") && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center text-white">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </div>
        }>
          <PdfReader
            fileUrl={proxyPdfUrl(pages[0].url.slice(4))}
            rawUrl={pages[0].url.slice(4)}
            title={selectedResult?.title || mangaTitle}
            coverUrl={coverUrl || selectedResult?.coverUrl}
            progressKey={selectedResult?.id || mangaTitle}
            providerId={selectedSource?.providerId || selectedChapter.providerId}
            mangaId={selectedSource?.id || selectedResult?.id || mangaTitle}
            chapterId={selectedChapter.id}
            chapterNum={selectedChapter.chapterNum}
            initialPage={currentPage}
            readerMode={readerMode}
            userId={user?.id}
            onClose={() => setShowReader(false)}
          />
        </Suspense>
      )}

      {/* ==================== COMMON READER MODAL OVERLAY (images/iframe) ==================== */}
      {showReader && pages.length > 0 && selectedChapter && !pages[0]?.url?.startsWith("pdf:") && (
        <div ref={readerRef} data-reader-theme={settings.theme} className="fixed inset-0 z-[100] flex flex-col select-none" style={{ ...readerThemeVars(settings), WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none", cursor: cursorHidden ? "none" : undefined }}>
          {/* Header controls */}
          {chromeVisible && (
            <div className="border-b-2 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none animate-in fade-in slide-in-from-top duration-200" style={{ background: "var(--rd-surface)", color: "var(--rd-text)", borderColor: "var(--rd-border)", backdropFilter: "blur(8px)" }}>
              {/* Left Column: Title & Thumbnail */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                {(coverUrl || selectedResult?.coverUrl) && (
                  <SafeImage
                    src={coverUrl || selectedResult?.coverUrl}
                    alt={mangaTitle}
                    className="w-8 h-11 sm:w-10 sm:h-14 object-cover border border-white/40 shrink-0 rounded"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-primary text-white font-display text-3xs sm:text-2xs px-1.5 py-0.5 border border-white transform -rotate-1 hidden xxs:inline-block shrink-0 uppercase">
                      {selectedChapter.providerId}
                    </span>
                    <h4 className="font-display text-sm sm:text-base md:text-xl leading-tight truncate text-[color:var(--rd-text)]" title={selectedResult?.title || mangaTitle}>
                      {selectedResult?.title || mangaTitle}
                    </h4>
                  </div>
                  <p className="font-sans text-3xs sm:text-xs font-bold mt-0.5 text-[color:var(--rd-muted)]">
                    Capítulo {selectedChapter.chapterNum} · {currentPage + 1} / {pages.length}
                  </p>
                </div>
              </div>

              {/* Right Column: Controls */}
              <div className="flex items-center justify-between sm:justify-end gap-2.5 sm:gap-4 shrink-0 border-t border-white/10 pt-2.5 sm:pt-0 sm:border-t-0">
                
                {/* Chapter Selector */}
                <div className="flex items-center gap-1 bg-zinc-900 border-2 border-white/20 p-0.5 rounded text-white text-xs font-sans font-bold">
                  <button
                    disabled={!prevChapter}
                    onClick={() => prevChapter && readChapter(prevChapter)}
                    className="text-gray-400 hover:text-white disabled:opacity-20 transition-colors p-1"
                    title="Capítulo Anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  
                  {filteredChapters.length > 0 ? (
                    <select
                      value={selectedChapter?.id}
                      onChange={(e) => {
                        const targetCh = filteredChapters.find(ch => ch.id === e.target.value);
                        if (targetCh) readChapter(targetCh);
                      }}
                      className="bg-black text-white font-sans text-2xs sm:text-xs font-bold border border-white/25 px-1 py-0.5 rounded outline-none cursor-pointer max-w-[80px] xs:max-w-[120px] sm:max-w-[140px] truncate"
                    >
                      {filteredChapters.map(ch => (
                        <option key={ch.id} value={ch.id}>
                          Cap. {ch.chapterNum}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-sans text-2xs sm:text-xs font-bold text-gray-400 px-1">Cap. {selectedChapter?.chapterNum}</span>
                  )}
                  
                  <button
                    disabled={!nextChapter}
                    onClick={() => nextChapter && readChapter(nextChapter)}
                    className="text-gray-400 hover:text-white disabled:opacity-20 transition-colors p-1"
                    title="Próximo Capítulo"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-3">
                  {/* Layout Switcher — only meaningful for image chapters, not
                      single-document PDF/embeds where both modes look identical. */}
                  {!getEmbedUrl(pages[currentPage]?.url) && !isExternalLink(pages[currentPage]?.url) && (
                    <div className="flex border-2 border-white/20 rounded overflow-hidden">
                      <button
                        onClick={() => setReaderMode("scroll")}
                        className={cn(
                          "px-2 sm:px-3 py-1 font-sans font-bold text-2xs sm:text-xs flex items-center gap-1",
                          readerMode === "scroll" ? "bg-white text-black" : "bg-black text-white"
                        )}
                        title="Modo Cascata"
                      >
                        <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden xs:inline">Cascata</span>
                      </button>
                      <button
                        onClick={() => setReaderMode("page")}
                        className={cn(
                          "px-2 sm:px-3 py-1 font-sans font-bold text-2xs sm:text-xs flex items-center gap-1",
                          readerMode === "page" ? "bg-white text-black" : "bg-black text-white"
                        )}
                        title="Modo Página"
                      >
                        <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden xs:inline">Página</span>
                      </button>
                    </div>
                  )}

                  {/* Synopsis Info Button */}
                  {(description || selectedResult?.description) && (
                    <button
                      onClick={() => setShowInfo(prev => !prev)}
                      className="bg-zinc-800 border-2 border-white/20 p-1.5 sm:p-2 text-white rounded hover:bg-zinc-700 transition-colors flex items-center gap-1 font-sans font-bold text-2xs sm:text-xs"
                      title="Ver Sinopse"
                    >
                      <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-secondary" strokeWidth={3} />
                      <span className="hidden md:inline">SINOPSE</span>
                    </button>
                  )}

                  {/* Settings Button */}
                  <button
                    onClick={() => setShowSettings(true)}
                    className="bg-zinc-800 border-2 border-white/20 p-1.5 sm:p-2 text-white rounded hover:bg-zinc-700 transition-colors"
                    title="Configurações do leitor"
                  >
                    <Settings className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.5} />
                  </button>

                  {/* Close Button (in the header, next to the chapter selector) */}
                  <button
                    onClick={() => setShowReader(false)}
                    className="bg-primary hover:bg-red-600 text-white p-1.5 sm:p-2 border-2 border-white rounded transition-colors"
                    title="Fechar Leitor"
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
                  </button>

                </div>
              </div>
            </div>
          )}

          {/* Reader Body */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-auto overscroll-contain flex justify-center p-0 sm:p-4"
            // Promote to its own GPU layer + reserve scrollbar space so passing a
            // page doesn't repaint-jitter (iOS) or shift horizontally (desktop).
            style={{ transform: "translateZ(0)", scrollbarGutter: "stable" }}
          >
            {getEmbedUrl(pages[currentPage]?.url) ? (
              <div className="w-full max-w-5xl h-full min-h-[70vh] border-4 border-white/20 bg-zinc-900 rounded-lg overflow-hidden">
                <iframe
                  src={getEmbedUrl(pages[currentPage]?.url) || ""}
                  className="w-full h-full min-h-[70vh] border-0"
                  allow="autoplay"
                  title={selectedResult?.title || mangaTitle}
                />
              </div>
            ) : isExternalLink(pages[currentPage]?.url) ? (
              <div className="max-w-lg w-full bg-white border-4 border-black p-8 text-center text-black rounded-xl comic-shadow self-center">
                <h4 className="font-display text-2xl uppercase mb-3">Somente download</h4>
                <p className="font-sans font-bold text-sm text-gray-600 mb-6">
                  Este número não tem leitura online na fonte — só o arquivo para baixar. Clique abaixo para abrir o download.
                </p>
                <a
                  href={externalHref(pages[currentPage]?.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 bg-primary text-white font-display px-6 py-3 border-2 border-black hover:bg-yellow-400 hover:text-black transition-colors"
                >
                  BAIXAR / ABRIR FONTE <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ) : readerMode === "scroll" ? (
              /* Continuous Scroll Mode */
              <div className="max-w-2xl w-full space-y-1 sm:space-y-4 flex flex-col items-center" style={{ zoom }}>
                {pages.map((p, idx) => {
                  // Virtualized: only pages in the active window mount their image.
                  const inWindow = idx >= vWinStart && idx <= vWinEnd;
                  return (
                    <div
                      key={idx}
                      ref={(el) => { pageRefs.current[idx] = el; }}
                      onClick={toggleChrome}
                      className="relative w-full border-0 sm:border-4 border-white/10 bg-zinc-900"
                    >
                      {inWindow ? (
                        <>
                          <SafeImage
                            src={p.url}
                            alt={`Página ${p.pageNumber}`}
                            className="w-full h-auto select-none pointer-events-none"
                            // In-window pages load eagerly (the window is the preloader),
                            // so the next pages are ready before the reader reaches them.
                            onLoad={(e) => {
                              const h = pageRefs.current[idx]?.offsetHeight;
                              if (h && h > 40) pageHeightsRef.current[idx] = h;
                              recordAspect(idx, e.currentTarget as HTMLImageElement);
                            }}
                          />
                          {settings.showPageNumber && (
                            <div className="absolute bottom-2 right-2 bg-black/60 text-white font-sans text-xs px-2 py-1">
                              Pág. {p.pageNumber}
                            </div>
                          )}
                        </>
                      ) : (
                        // Height-reserved placeholder keeps scroll position stable.
                        <div style={{ height: pageHeightsRef.current[idx] ?? vEstHeight }} aria-hidden="true" />
                      )}
                    </div>
                  );
                })}
                
                {/* Next/Prev Chapter Navigation at the bottom of cascade */}
                <div className="w-full pt-8 pb-4 border-t-2 border-dashed border-white/20 flex flex-col sm:flex-row justify-between items-center gap-4">
                  {prevChapter ? (
                    <button
                      onClick={() => readChapter(prevChapter)}
                      className="w-full sm:w-auto bg-zinc-800 hover:bg-zinc-700 text-white border border-white/20 px-6 py-2.5 rounded font-sans font-bold text-sm flex items-center justify-center gap-2 transition-all"
                    >
                      <ChevronLeft className="w-4 h-4" /> ANTERIOR: CAP. {prevChapter.chapterNum}
                    </button>
                  ) : <div />}
                  
                  {nextChapter ? (
                    <button
                      onClick={() => readChapter(nextChapter)}
                      className="w-full sm:w-auto bg-primary hover:bg-yellow-500 text-white border border-white/20 px-8 py-3 rounded font-display text-base flex items-center justify-center gap-2 transition-all hover:scale-105 shadow-[0_0_15px_rgba(253,224,71,0.2)] animate-pulse"
                    >
                      SEGUINTE: CAP. {nextChapter.chapterNum} <ChevronRight className="w-5 h-5" />
                    </button>
                  ) : (
                    <div className="text-gray-400 font-sans font-bold text-sm">
                      Fim da obra no provedor selecionado.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Page by Page Mode (single or smart double-page) */
              <div className={cn("w-full h-full flex flex-col justify-between items-center gap-4", doubleActive ? "max-w-6xl" : "max-w-xl")}>
                <div
                  className={cn(
                    "flex-1 flex justify-center w-full gap-0.5 relative group cursor-pointer",
                    // Width-fit tall pages align to the top so they scroll cleanly;
                    // height/whole fits are centred in the viewport.
                    !doubleActive && fitFor(currentPage) === "width" ? "items-start" : "items-center",
                  )}
                  onClick={(e) => {
                    // Three tap zones. Physical side → logical page depends on the
                    // reading direction: LTR left = previous / RTL left = next.
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    if (x < rect.width * 0.33) (rtl ? goToNextPage : goToPrevPage)();
                    else if (x > rect.width * 0.67) (rtl ? goToPrevPage : goToNextPage)();
                    else toggleChrome();
                  }}
                  onTouchStart={(e) => {
                    swipeStartRef.current = e.touches.length === 1
                      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
                      : null;
                  }}
                  onTouchEnd={(e) => {
                    const s = swipeStartRef.current;
                    swipeStartRef.current = null;
                    if (!s || zoom !== 1) return; // when zoomed, let the user pan
                    const t = e.changedTouches[0];
                    const dx = t.clientX - s.x;
                    const dy = t.clientY - s.y;
                    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                      // Swipe left: next in LTR, previous in RTL (and vice-versa).
                      if (dx < 0) (rtl ? goToPrevPage : goToNextPage)();
                      else (rtl ? goToNextPage : goToPrevPage)();
                    }
                  }}
                >
                  {isSplitActive(currentPage) ? (
                    // Split-spread: two virtual pages from the SAME image via a CSS
                    // crop (translateX on a 2x-wide image inside an overflow box).
                    (() => {
                      const A = pageAspectRef.current[currentPage] || 1.4;
                      const showLeft = rtl ? splitSide === 1 : splitSide === 0;
                      return (
                        <div className="relative overflow-hidden border-4 border-white/20" style={{ height: "88vh", width: `min(96vw, calc(88vh * ${A / 2}))` }}>
                          <SafeImage
                            src={pages[currentPage]?.url}
                            alt={`Página ${pages[currentPage]?.pageNumber} (${showLeft ? "esquerda" : "direita"})`}
                            className="absolute top-0 left-0 h-full max-w-none select-none pointer-events-none"
                            style={{ transform: `translateX(${showLeft ? "0%" : "-50%"})`, transformOrigin: "left top", zoom }}
                            onLoad={(e) => recordAspect(currentPage, e.currentTarget as HTMLImageElement)}
                          />
                        </div>
                      );
                    })()
                  ) : (
                    (doubleActive && currentGroup
                      ? (rtl ? [...currentGroup].reverse() : currentGroup)
                      : [currentPage]
                    ).map((pi) => (
                      <SafeImage
                        key={pi}
                        src={pages[pi]?.url}
                        alt={`Página ${pages[pi]?.pageNumber}`}
                        className={cn(
                          "border-4 border-white/20 select-none pointer-events-none",
                          doubleActive && currentGroup && currentGroup.length === 2
                            ? "max-h-[88vh] max-w-[50%] object-contain" // double: keep proportion, no stretch
                            : fitClass(fitFor(pi)),
                        )}
                        style={{ zoom }}
                        onLoad={(e) => recordAspect(pi, e.currentTarget as HTMLImageElement)}
                      />
                    ))
                  )}

                  {/* Left Edge Overlay Hint */}
                  <div className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-black/20 to-transparent opacity-0 group-hover:opacity-100 flex items-center pl-2 transition-opacity">
                    <ChevronLeft className="w-12 h-12 text-white drop-shadow-md" />
                  </div>
                  {/* Right Edge Overlay Hint */}
                  <div className="absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-black/20 to-transparent opacity-0 group-hover:opacity-100 flex items-center justify-end pr-2 transition-opacity">
                    <ChevronRight className="w-12 h-12 text-white drop-shadow-md" />
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Thin reading-progress bar at the very top (chrome-independent). */}
          {settings.showProgress && !getEmbedUrl(pages[currentPage]?.url) && !isExternalLink(pages[currentPage]?.url) && pages.length > 1 && (
            <div className={cn("fixed top-0 inset-x-0 z-[111] h-1 flex", rtl && "justify-end")} style={{ background: "var(--rd-control)" }}>
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${((currentPage + 1) / pages.length) * 100}%` }}
              />
            </div>
          )}

          {/* Split-spread action — only for wide (panorama) pages in page mode. */}
          {chromeVisible && readerMode === "page" && settings.splitMode !== "off" && isWidePage(currentPage) && (
            <button
              onClick={() => toggleSplit(currentPage)}
              className="fixed top-16 left-1/2 -translate-x-1/2 z-[112] flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-2xs font-sans font-bold backdrop-blur-sm animate-in fade-in slide-in-from-top duration-200"
              style={{ background: "var(--rd-surface)", color: "var(--rd-text)", borderColor: "var(--rd-border)" }}
            >
              <Scissors className="w-3.5 h-3.5" strokeWidth={2.5} />
              {isSplitActive(currentPage) ? "Juntar página" : "Dividir página"}
            </button>
          )}

          {/* Cinema/Immersion escape hatch — appears on activity so the reader can
              always leave the immersive levels (chrome is hidden there). */}
          {immersion !== "clean" && uiActive && (
            <div className="fixed top-4 right-4 z-[113] flex gap-2 animate-in fade-in duration-200">
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-full border backdrop-blur-sm"
                style={{ background: "var(--rd-surface)", color: "var(--rd-text)", borderColor: "var(--rd-border)" }}
                title="Configurações"
              >
                <Settings className="w-4 h-4" strokeWidth={2.5} />
              </button>
              <button
                onClick={() => updateSettings({ immersion: "clean" }, workId ? "work" : "global")}
                className="p-2 rounded-full border backdrop-blur-sm"
                style={{ background: "var(--rd-surface)", color: "var(--rd-text)", borderColor: "var(--rd-border)" }}
                title="Sair da imersão"
              >
                <Minimize2 className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
          )}

          {/* Cinema: extremely discrete page indicator that fades with inactivity. */}
          {immersion === "cinema" && !getEmbedUrl(pages[currentPage]?.url) && !isExternalLink(pages[currentPage]?.url) && (
            <div
              className={cn("fixed bottom-4 left-1/2 -translate-x-1/2 z-[112] px-3 py-1 rounded-full text-2xs font-sans font-bold pointer-events-none transition-opacity duration-300", uiActive ? "opacity-60" : "opacity-0")}
              style={{ background: "var(--rd-surface)", color: "var(--rd-text)" }}
            >
              Página {currentPage + 1} • Cap. {selectedChapter?.chapterNum}
            </div>
          )}

          {/* Bottom bar (chrome) — page scrubber + chapter nav + zoom. Part of the
              auto-hiding interface; a tap on the reading area brings it back. */}
          {settings.showBottomBar && chromeVisible && !getEmbedUrl(pages[currentPage]?.url) && !isExternalLink(pages[currentPage]?.url) && (
            <div className="fixed bottom-0 inset-x-0 z-[110] backdrop-blur-sm border-t-2 px-3 sm:px-5 py-2.5 flex items-center gap-2 sm:gap-3 select-none animate-in fade-in slide-in-from-bottom duration-200" style={{ background: "var(--rd-surface)", color: "var(--rd-text)", borderColor: "var(--rd-border)" }}>
              <button
                onClick={() => prevChapter && readChapter(prevChapter)}
                disabled={!prevChapter}
                className="opacity-70 hover:opacity-100 disabled:opacity-20 shrink-0 p-1"
                title="Capítulo anterior"
              >
                <ChevronsLeft className="w-5 h-5" strokeWidth={3} />
              </button>
              <span className="font-sans font-bold text-2xs sm:text-xs tabular-nums w-7 sm:w-8 text-right shrink-0">{currentPage + 1}</span>
              <input
                type="range"
                dir={rtl ? "rtl" : "ltr"}
                min={0}
                max={Math.max(0, pages.length - 1)}
                value={currentPage}
                onChange={(e) => goToPage(Number(e.target.value))}
                className="flex-1 h-1.5 accent-primary cursor-pointer"
                aria-label="Navegar pelas páginas"
              />
              <span className="opacity-50 font-sans font-bold text-2xs sm:text-xs tabular-nums w-7 sm:w-8 shrink-0">{pages.length}</span>
              {!pages[currentPage]?.url?.startsWith("pdf:") && (
                <div className="hidden xs:flex items-center gap-0.5 shrink-0 border-l pl-2 ml-1" style={{ borderColor: "var(--rd-border)" }}>
                  <button onClick={() => setZoom(z => Math.max(1, +(z - 0.5).toFixed(2)))} disabled={zoom <= 1} className="opacity-70 hover:opacity-100 disabled:opacity-20 p-1" title="Menos zoom"><ZoomOut className="w-4 h-4" strokeWidth={3} /></button>
                  <button onClick={() => setZoom(1)} className="text-3xs font-bold tabular-nums w-9 text-center" title="Restaurar zoom">{Math.round(zoom * 100)}%</button>
                  <button onClick={() => setZoom(z => Math.min(4, +(z + 0.5).toFixed(2)))} disabled={zoom >= 4} className="opacity-70 hover:opacity-100 disabled:opacity-20 p-1" title="Mais zoom"><ZoomIn className="w-4 h-4" strokeWidth={3} /></button>
                </div>
              )}
              <button
                onClick={() => nextChapter && readChapter(nextChapter)}
                disabled={!nextChapter}
                className="opacity-70 hover:opacity-100 disabled:opacity-20 shrink-0 p-1"
                title="Próximo capítulo"
              >
                <ChevronsRight className="w-5 h-5" strokeWidth={3} />
              </button>
            </div>
          )}

          {/* Synopsis Popup Modal */}
          {showInfo && (
            <div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center p-4" onClick={() => setShowInfo(false)}>
              <div className="bg-white border-4 border-black p-6 rounded-xl max-w-lg w-full comic-shadow relative text-black animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={() => setShowInfo(false)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-black transition-colors"
                >
                  <X className="w-5 h-5" strokeWidth={3} />
                </button>
                <h4 className="font-display text-2xl mb-4 uppercase text-primary">Sinopse</h4>
                <p className="font-sans font-bold text-gray-700 text-sm max-h-[300px] overflow-y-auto pr-2 leading-relaxed whitespace-pre-line">
                  {description || selectedResult?.description || "Nenhuma sinopse disponível."}
                </p>
              </div>
            </div>
          )}

          {/* Reader settings drawer */}
          <ReaderSettingsPanel
            open={showSettings}
            onClose={() => setShowSettings(false)}
            workId={workId}
            workTitle={selectedResult?.title || mangaTitle}
            readingMode={readerMode}
            onSetReadingMode={setReaderMode}
            onEnterImmersion={requestReaderFullscreen}
          />

          {/* Engineering diagnostics (Ctrl+Shift+D) */}
          <ReaderDiagnostics
            open={showDiag}
            onClose={() => setShowDiag(false)}
            diag={((): DiagInfo => {
              const winSize = Math.min(pages.length, vWinEnd - vWinStart + 1);
              const shownInPage = currentGroup?.length ?? 1;
              const aspect = pageAspectRef.current[currentPage] ?? 0;
              return {
                mode: readerMode,
                direction: settings.direction,
                fit: settings.fitMode,
                theme: settings.theme,
                zoom,
                page: currentPage + 1,
                total: pages.length,
                chapterNum: selectedChapter?.chapterNum,
                provider: selectedSource?.providerId || selectedChapter?.providerId,
                engine: selectedSource?.providerId || selectedChapter?.providerId,
                pageUrl: pages[currentPage]?.url,
                rendered: readerMode === "scroll" ? winSize : shownInPage,
                virtualized: Math.max(0, pages.length - (readerMode === "scroll" ? winSize : shownInPage)),
                preload: V_AHEAD,
                scrollVirtualized: readerMode === "scroll",
                doublePage: settings.doublePage,
                spreadDetected: aspect > 1.15,
                split: settings.splitMode,
                splitActive: isSplitActive(currentPage),
                viewport: isSplitActive(currentPage) ? ((rtl ? splitSide === 1 : splitSide === 0) ? "Esquerda" : "Direita") : "—",
                aspect,
                orientation: aspect > 1.15 ? "Paisagem" : "Retrato",
                resume: !!lastReadProgress,
                perWork: hasWorkOverride,
                immersion: settings.immersion,
                fullscreen: typeof document !== "undefined" && !!document.fullscreenElement,
                cursorHidden,
                imgW: pageDimsRef.current[currentPage]?.w,
                imgH: pageDimsRef.current[currentPage]?.h,
                imgFormat: pages[currentPage]?.url?.match(/\.(webp|jpe?g|png|gif|avif)/i)?.[1]?.toUpperCase(),
                lastFetchMs: lastFetchMsRef.current ?? undefined,
              };
            })()}
            onReloadChapter={() => {
              if (selectedChapter) {
                delete prefetchedPagesRef.current[selectedChapter.id];
                readChapter(selectedChapter, currentPage);
              }
            }}
            onClearCache={() => {
              prefetchedPagesRef.current = {};
              pageHeightsRef.current = {};
              pageAspectRef.current = {};
              pageDimsRef.current = {};
            }}
            onTestProvider={() => { if (selectedSource) loadChapters(selectedSource); }}
          />
        </div>
      )}
    </div>
  );
}
