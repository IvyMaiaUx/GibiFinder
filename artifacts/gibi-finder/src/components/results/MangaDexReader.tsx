import { useState, useEffect, useRef } from "react";
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
  Maximize,
  Minimize,
  Info
} from "lucide-react";
import { cn, proxyPdfUrl } from "@/lib/utils";
import { SafeImage } from "@/components/ui/SafeImage";
import { PdfReader } from "@/components/results/PdfReader";
import { useAuth } from "@/hooks/use-auth";
import { getLocalProgress, saveReadingState, markChapterCompleted } from "@/lib/user-history";

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
  // Guards the intersection observer from clobbering the saved page while we
  // are auto-scrolling back to it on resume.
  const resumingRef = useRef(false);
  // When resuming into cascade mode, holds the page index we must land on. It
  // also forces every image up to that page to load eagerly so the layout
  // heights are correct before we scroll.
  const [resumeTargetPage, setResumeTargetPage] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        !!document.fullscreenElement || 
        !!(document as any).webkitFullscreenElement ||
        !!(document as any).mozFullScreenElement ||
        !!(document as any).msFullscreenElement
      );
    };
    
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    const element = readerRef.current;
    if (!element) return;

    const requestMethod = 
      element.requestFullscreen || 
      (element as any).webkitRequestFullscreen || 
      (element as any).mozRequestFullScreen || 
      (element as any).msRequestFullscreen;

    const exitMethod = 
      document.exitFullscreen || 
      (document as any).webkitExitFullscreen || 
      (document as any).mozCancelFullScreen || 
      (document as any).msExitFullscreen;

    const isNativeFullscreen = 
      !!document.fullscreenElement || 
      !!(document as any).webkitFullscreenElement ||
      !!(document as any).mozFullScreenElement ||
      !!(document as any).msFullscreenElement;

    if (requestMethod) {
      if (!isNativeFullscreen) {
        requestMethod.call(element).catch(err => {
          console.error("Error enabling native fullscreen:", err);
          // Fallback to virtual fullscreen
          setIsFullscreen(true);
        });
      } else if (exitMethod) {
        exitMethod.call(document);
      }
    } else {
      // Fallback for devices without native Fullscreen API support (like iOS Safari)
      setIsFullscreen(prev => !prev);
    }
  };
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [langFilter, setLangFilter] = useState<"pt" | "en" | "all">("all");
  
  const [loadingPages, setLoadingPages] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [showReader, setShowReader] = useState(false);
  const [readerMode, setReaderMode] = useState<"page" | "scroll">("scroll");
  const [error, setError] = useState<string | null>(null);
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
    setSelectedChapter(chapter);
    setLoadingPages(true);
    setPages([]);
    setError(null);

    try {
      const url = `${BASE}/api/providers/pages?providerId=${chapter.providerId}&chapterId=${encodeURIComponent(chapter.id)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erro ao carregar páginas do capítulo");
      const data = await res.json() as Page[];
      
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
        setIsFullscreen(true);

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

        // Try to trigger native browser fullscreen after mount
        setTimeout(() => {
          const element = readerRef.current;
          if (element) {
            const requestMethod = 
              element.requestFullscreen || 
              (element as any).webkitRequestFullscreen || 
              (element as any).mozRequestFullScreen || 
              (element as any).msRequestFullscreen;
            if (requestMethod) {
              requestMethod.call(element).catch(() => {
                // Ignore security exceptions, virtual fullscreen handles the layout
              });
            }
          }
        }, 150);
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
      let bestIdx = 0;
      for (let i = 0; i < pageRefs.current.length; i++) {
        const el = pageRefs.current[i];
        if (!el) continue;
        if (el.getBoundingClientRect().top <= marker) {
          bestIdx = i;
        } else {
          break;
        }
      }
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
      )}

      {/* ==================== COMMON READER MODAL OVERLAY (images/iframe) ==================== */}
      {showReader && pages.length > 0 && selectedChapter && !pages[0]?.url?.startsWith("pdf:") && (
        <div ref={readerRef} className="fixed inset-0 z-[100] bg-black/95 flex flex-col">
          {/* Header controls */}
          {!isFullscreen && (
            <div className="bg-black border-b-4 border-white/20 p-3 sm:p-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none animate-in fade-in slide-in-from-top duration-200">
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
                    <h4 className="font-display text-sm sm:text-base md:text-xl leading-tight truncate text-white" title={selectedResult?.title || mangaTitle}>
                      {selectedResult?.title || mangaTitle}
                    </h4>
                  </div>
                  <p className="font-sans text-3xs sm:text-xs font-bold text-gray-400 mt-0.5">
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

                  {/* Close Button */}
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
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto flex justify-center p-4">
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
              <div className="max-w-lg w-full bg-white border-4 border-black p-8 text-center text-black rounded-xl comic-shadow">
                <h4 className="font-display text-2xl uppercase mb-3">Abrir catálogo externo</h4>
                <p className="font-sans font-bold text-sm text-gray-600 mb-6">
                  Este título abre um catálogo em outro site. Clique abaixo para continuar.
                </p>
                <a
                  href={externalHref(pages[currentPage]?.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 bg-primary text-white font-display px-6 py-3 border-2 border-black hover:bg-yellow-400 hover:text-black transition-colors"
                >
                  ABRIR FONTE <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ) : readerMode === "scroll" ? (
              /* Continuous Scroll Mode */
              <div className="max-w-2xl w-full space-y-4 flex flex-col items-center">
                {pages.map((p, idx) => (
                  <div
                    key={idx}
                    ref={(el) => { pageRefs.current[idx] = el; }}
                    className="relative w-full border-4 border-white/10 bg-zinc-900"
                  >
                    <SafeImage
                      src={p.url}
                      alt={`Página ${p.pageNumber}`}
                      className="w-full h-auto select-none pointer-events-none"
                      loading={idx <= 2 || (resumeTargetPage !== null && idx <= resumeTargetPage) ? undefined : "lazy"}
                    />
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white font-sans text-xs px-2 py-1">
                      Pág. {p.pageNumber}
                    </div>
                  </div>
                ))}
                
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
              /* Page by Page Mode */
              <div className="max-w-xl w-full h-full flex flex-col justify-between items-center gap-4">
                <div 
                  className="flex-1 flex items-center justify-center w-full relative group cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    if (x > rect.width / 2) {
                      if (currentPage < pages.length - 1) {
                        setCurrentPage(currentPage + 1);
                      } else if (nextChapter) {
                        // Switch to next chapter if on last page and clicked right half
                        readChapter(nextChapter);
                      }
                    } else {
                      if (currentPage > 0) {
                        setCurrentPage(currentPage - 1);
                      } else if (prevChapter) {
                        // Switch to prev chapter if on first page and clicked left half
                        readChapter(prevChapter);
                      }
                    }
                  }}
                >
                  <SafeImage
                    src={pages[currentPage]?.url} 
                    alt={`Página ${pages[currentPage]?.pageNumber}`} 
                    className="max-h-[75vh] max-w-full object-contain border-4 border-white/20 select-none pointer-events-none"
                  />
                  
                  {/* Left Edge Overlay Hint */}
                  <div className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-black/20 to-transparent opacity-0 group-hover:opacity-100 flex items-center pl-2 transition-opacity">
                    <ChevronLeft className="w-12 h-12 text-white drop-shadow-md" />
                  </div>
                  {/* Right Edge Overlay Hint */}
                  <div className="absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-black/20 to-transparent opacity-0 group-hover:opacity-100 flex items-center justify-end pr-2 transition-opacity">
                    <ChevronRight className="w-12 h-12 text-white drop-shadow-md" />
                  </div>
                </div>

                {/* Page Navigation Controls */}
                {!isFullscreen && (
                  <div className="flex flex-col items-center gap-2 select-none w-full">
                    <div className="flex items-center gap-6 bg-zinc-900 px-6 py-3 rounded-full border-2 border-white/20 animate-in fade-in slide-in-from-bottom duration-200">
                      <button
                        disabled={currentPage === 0 && !prevChapter}
                        onClick={() => {
                          if (currentPage > 0) {
                            setCurrentPage(currentPage - 1);
                          } else if (prevChapter) {
                            readChapter(prevChapter);
                          }
                        }}
                        className="text-white hover:text-secondary disabled:opacity-30 disabled:hover:text-white"
                      >
                        <ChevronLeft className="w-8 h-8" strokeWidth={3} />
                      </button>
                      <span className="font-display text-xl text-white">
                        Pág. {pages[currentPage]?.pageNumber} / {pages.length}
                      </span>
                      <button
                        disabled={currentPage === pages.length - 1 && !nextChapter}
                        onClick={() => {
                          if (currentPage < pages.length - 1) {
                            setCurrentPage(currentPage + 1);
                          } else if (nextChapter) {
                            readChapter(nextChapter);
                          }
                        }}
                        className="text-white hover:text-secondary disabled:opacity-30 disabled:hover:text-white"
                      >
                        <ChevronRight className="w-8 h-8" strokeWidth={3} />
                      </button>
                    </div>
                    {currentPage === pages.length - 1 && nextChapter && (
                      <button
                        onClick={() => readChapter(nextChapter)}
                        className="bg-primary hover:bg-yellow-500 text-black text-xs px-4 py-2 border-2 border-black rounded font-display tracking-wide uppercase transition-all shadow-[2px_2px_0_rgba(255,255,255,0.2)]"
                      >
                        SEGUINTE: CAP. {nextChapter.chapterNum} ➔
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Floating Fullscreen Button in the bottom right */}
          <button
            onClick={toggleFullscreen}
            className="fixed bottom-6 right-6 z-[110] bg-black/80 hover:bg-black text-white p-3 border-2 border-white/20 rounded-full transition-all hover:scale-105"
            title="Alternar Tela Cheia"
          >
            {isFullscreen ? (
              <Minimize className="w-5 h-5" strokeWidth={3} />
            ) : (
              <Maximize className="w-5 h-5" strokeWidth={3} />
            )}
          </button>

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
        </div>
      )}
    </div>
  );
}
