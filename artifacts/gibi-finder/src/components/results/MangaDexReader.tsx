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
import { cn, proxyCoverUrl } from "@/lib/utils";

interface MangaDexReaderProps {
  mangaTitle: string;
  coverUrl?: string;
  description?: string;
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

export function MangaDexReader({ mangaTitle, coverUrl, description }: MangaDexReaderProps) {
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
      if (data.length > 0) {
        // Auto-select the first result group for convenience
        setSelectedResult(data[0]);
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
  const readChapter = async (chapter: Chapter) => {
    setSelectedChapter(chapter);
    setLoadingPages(true);
    setPages([]);
    setCurrentPage(0);
    setError(null);

    try {
      const url = `${BASE}/api/providers/pages?providerId=${chapter.providerId}&chapterId=${encodeURIComponent(chapter.id)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erro ao carregar páginas do capítulo");
      const data = await res.json() as Page[];
      
      setPages(data);
      setShowReader(true);
    } catch (err) {
      console.error(err);
      setError("Falha ao abrir o leitor para este capítulo.");
    } finally {
      setLoadingPages(false);
    }
  };

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

        const pagesUrl = `${BASE}/api/providers/pages?providerId=${targetChapter.providerId}&chapterId=${encodeURIComponent(targetChapter.id)}`;
        const pagesRes = await fetch(pagesUrl);
        if (!pagesRes.ok) throw new Error();
        const pagesData = await pagesRes.json() as Page[];
        
        setPages(pagesData);
        setShowReader(true);
        setIsFullscreen(true);

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

  // Search on mount
  useEffect(() => {
    if (mangaTitle) {
      searchAggregator(mangaTitle);
    }
  }, [mangaTitle]);

  // Load progress on mount/change
  useEffect(() => {
    try {
      const progressKey = "gibi-finder:progress";
      const allProgress = JSON.parse(localStorage.getItem(progressKey) || "{}");
      const searchParams = new URLSearchParams(window.location.search);
      const isResume = searchParams.get("resume") === "true";
      const pId = searchParams.get("providerId") || "";
      const mId = searchParams.get("id") || "";
      
      const lookupKey = selectedResult?.id || mId || mangaTitle;
      const prog = allProgress[lookupKey];
      
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
    if (showReader && selectedChapter && pages.length > 0) {
      try {
        const progressKey = "gibi-finder:progress";
        const allProgress = JSON.parse(localStorage.getItem(progressKey) || "{}");
        allProgress[selectedResult?.id || mangaTitle] = {
          chapterId: selectedChapter.id,
          chapterNum: selectedChapter.chapterNum,
          pageNumber: currentPage + 1,
          title: selectedResult?.title || mangaTitle,
          coverUrl: selectedResult?.coverUrl,
          providerId: selectedSource?.providerId || selectedChapter.providerId,
          mangaId: selectedSource?.id,
          language: selectedChapter.language,
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem(progressKey, JSON.stringify(allProgress));

        // Save to chronological reading history list
        const historyKey = "gibi-finder:reading-history";
        const historyList = JSON.parse(localStorage.getItem(historyKey) || "[]");
        const newEntry = {
          id: `${selectedSource?.providerId || selectedChapter.providerId}-${selectedSource?.id || mangaTitle}-${selectedChapter.id}`,
          title: selectedResult?.title || mangaTitle,
          coverUrl: selectedResult?.coverUrl,
          chapterId: selectedChapter.id,
          chapterNum: selectedChapter.chapterNum,
          chapterTitle: selectedChapter.title,
          providerId: selectedSource?.providerId || selectedChapter.providerId,
          mangaId: selectedSource?.id,
          language: selectedChapter.language,
          pageNumber: currentPage + 1,
          timestamp: Date.now()
        };

        const filteredList = historyList.filter(
          (item: any) => !(item.mangaId === newEntry.mangaId && item.chapterId === newEntry.chapterId)
        );
        filteredList.unshift(newEntry);
        localStorage.setItem(historyKey, JSON.stringify(filteredList.slice(0, 100)));
      } catch (e) {
        console.error("Failed to save progress:", e);
      }
    }
  }, [currentPage, selectedChapter, showReader, pages, selectedResult, mangaTitle, selectedSource]);

  // Filtered chapters for display
  const filteredChapters = chapters.filter(ch => {
    if (langFilter === "all") return true;
    if (langFilter === "pt") return ch.language === "pt" || ch.language === "pt-br";
    if (langFilter === "en") return ch.language === "en";
    return true;
  });

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
                      <img src={proxyCoverUrl(r.coverUrl)} alt={r.title} className="w-10 h-14 object-cover border border-black shrink-0" referrerPolicy="no-referrer" />
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
                  <img 
                    src={proxyCoverUrl(selectedResult.coverUrl)} 
                    alt={selectedResult.title} 
                    className="w-24 h-36 object-cover border-4 border-black shrink-0 mx-auto sm:mx-0"
                    referrerPolicy="no-referrer"
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
                  setCurrentPage(Math.max(0, lastReadProgress.pageNumber - 1));
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

      {/* ==================== COMMON READER MODAL OVERLAY ==================== */}
      {showReader && pages.length > 0 && selectedChapter && (
        <div ref={readerRef} className="fixed inset-0 z-[100] bg-black/95 flex flex-col">
          {/* Header controls */}
          {!isFullscreen && (
            <div className="bg-black border-b-4 border-white/20 p-4 text-white flex justify-between items-center select-none animate-in fade-in slide-in-from-top duration-200">
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Cover Thumbnail */}
                {(coverUrl || selectedResult?.coverUrl) && (
                  <img 
                    src={proxyCoverUrl(coverUrl || selectedResult?.coverUrl)} 
                    alt={mangaTitle} 
                    className="w-8 h-11 sm:w-10 sm:h-14 object-cover border border-white/40 shrink-0 rounded"
                    referrerPolicy="no-referrer"
                  />
                )}
                <span className="bg-primary text-white font-display text-xs sm:text-sm px-2 py-0.5 border-2 border-white transform -rotate-2 hidden xs:inline-block">
                  {selectedChapter.providerId.toUpperCase()}
                </span>
                <div>
                  <h4 className="font-display text-base md:text-xl leading-none line-clamp-1 max-w-[120px] sm:max-w-xs md:max-w-md" title={selectedResult?.title || mangaTitle}>
                    {selectedResult?.title || mangaTitle}
                  </h4>
                  <p className="font-sans text-2xs sm:text-xs font-bold text-gray-400 mt-1">Capítulo {selectedChapter.chapterNum} · {currentPage + 1} / {pages.length}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Layout Switcher */}
                <div className="hidden sm:flex border-2 border-white/20 rounded overflow-hidden">
                  <button
                    onClick={() => setReaderMode("scroll")}
                    className={cn(
                      "px-3 py-1.5 font-sans font-bold text-xs flex items-center gap-1.5",
                      readerMode === "scroll" ? "bg-white text-black" : "bg-black text-white"
                    )}
                  >
                    <Layers className="w-3.5 h-3.5" /> Cascata
                  </button>
                  <button
                    onClick={() => setReaderMode("page")}
                    className={cn(
                      "px-3 py-1.5 font-sans font-bold text-xs flex items-center gap-1.5",
                      readerMode === "page" ? "bg-white text-black" : "bg-black text-white"
                    )}
                  >
                    <FileText className="w-3.5 h-3.5" /> Página
                  </button>
                </div>

                {/* Synopsis Info Button */}
                {(description || selectedResult?.description) && (
                  <button
                    onClick={() => setShowInfo(prev => !prev)}
                    className="bg-zinc-800 border-2 border-white/20 p-2 text-white rounded hover:bg-zinc-700 transition-colors flex items-center gap-1.5 font-sans font-bold text-xs"
                    title="Ver Sinopse"
                  >
                    <Info className="w-5 h-5 text-secondary" strokeWidth={3} />
                    <span className="hidden md:inline">SINOPSE</span>
                  </button>
                )}

                {/* Close Button */}
                <button 
                  onClick={() => setShowReader(false)}
                  className="bg-primary hover:bg-red-600 text-white p-2 border-2 border-white rounded transition-colors"
                  title="Fechar Leitor"
                >
                  <X className="w-6 h-6" strokeWidth={3} />
                </button>
              </div>
            </div>
          )}

          {/* Reader Body */}
          <div className="flex-1 overflow-y-auto flex justify-center p-4">
            {readerMode === "scroll" ? (
              /* Continuous Scroll Mode */
              <div className="max-w-2xl w-full space-y-4 flex flex-col items-center">
                {pages.map((p, idx) => (
                  <div key={idx} className="relative w-full border-4 border-white/10 bg-zinc-900">
                    <img 
                      src={p.url} 
                      alt={`Página ${p.pageNumber}`}
                      className="w-full h-auto select-none pointer-events-none"
                      loading={idx > 2 ? "lazy" : undefined}
                    />
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white font-sans text-xs px-2 py-1">
                      Pág. {p.pageNumber}
                    </div>
                  </div>
                ))}
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
                      if (currentPage < pages.length - 1) setCurrentPage(currentPage + 1);
                    } else {
                      if (currentPage > 0) setCurrentPage(currentPage - 1);
                    }
                  }}
                >
                  <img 
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
                  <div className="flex items-center gap-6 bg-zinc-900 px-6 py-3 rounded-full border-2 border-white/20 select-none animate-in fade-in slide-in-from-bottom duration-200">
                    <button
                      disabled={currentPage === 0}
                      onClick={() => setCurrentPage(currentPage - 1)}
                      className="text-white hover:text-secondary disabled:opacity-30 disabled:hover:text-white"
                    >
                      <ChevronLeft className="w-8 h-8" strokeWidth={3} />
                    </button>
                    <span className="font-display text-xl text-white">
                      Pág. {pages[currentPage]?.pageNumber} / {pages.length}
                    </span>
                    <button
                      disabled={currentPage === pages.length - 1}
                      onClick={() => setCurrentPage(currentPage + 1)}
                      className="text-white hover:text-secondary disabled:opacity-30 disabled:hover:text-white"
                    >
                      <ChevronRight className="w-8 h-8" strokeWidth={3} />
                    </button>
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
