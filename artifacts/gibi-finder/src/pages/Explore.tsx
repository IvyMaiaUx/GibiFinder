import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Loader2, AlertCircle, Compass, Flame, Clock, Languages } from "lucide-react";
import { useLocation } from "wouter";
import { cn, proxyCoverUrl } from "@/lib/utils";

interface UnifiedCatalogItem {
  id: string;
  title: string;
  coverUrl?: string;
  description?: string;
  sources: {
    providerId: string;
    id: string;
    title: string;
  }[];
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const ITEMS_PER_PAGE = 20;

export default function Explore() {
  const [, setLocation] = useLocation();
  const [listType, setListType] = useState<"popular" | "latest">("popular");
  const [langFilter, setLangFilter] = useState<"all" | "pt" | "en">("all");
  const [currentPage, setCurrentPage] = useState(1);
  
  const [items, setItems] = useState<UnifiedCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // Fetch unified catalog list from provider
  const loadCatalog = async (type: "popular" | "latest") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/providers/catalog?listType=${type}`);
      if (!res.ok) throw new Error();
      const data = await res.json() as UnifiedCatalogItem[];
      setItems(data);
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar o catálogo neste momento. Tente novamente mais tarde.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    loadCatalog(listType);
  }, [listType]);

  useEffect(() => {
    setCurrentPage(1);
  }, [langFilter]);

  const handleOpenItem = (item: UnifiedCatalogItem) => {
    if (!item.sources || item.sources.length === 0) return;
    // Open the detail page using the first available source
    const src = item.sources[0];
    const url = `/gibi/online?providerId=${src.providerId}&id=${encodeURIComponent(src.id)}&title=${encodeURIComponent(item.title)}&coverUrl=${encodeURIComponent(item.coverUrl || "")}&description=${encodeURIComponent(item.description || "")}`;
    setLocation(url);
  };

  // Filter items by language
  const filteredItems = items.filter(item => {
    if (langFilter === "all") return true;
    if (langFilter === "pt") {
      // Keep items that are available on MangaDex, MangaPlus or other pt-friendly sources.
      // ComicExtra is strictly English, so filter it out if it is the ONLY source.
      return item.sources.some(s => s.providerId !== "comicextra");
    }
    if (langFilter === "en") {
      // ComicExtra, MangaDex, MangaPlus all support English
      return true;
    }
    return true;
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-16 select-none">
        
        {/* Banner header */}
        <div className="bg-primary text-white border-4 border-black p-6 rounded-xl comic-shadow relative overflow-hidden transform -rotate-1">
          <div className="absolute top-0 right-0 w-24 h-24 opacity-10 bg-[radial-gradient(white_1px,transparent_1px)] [background-size:6px_6px] pointer-events-none" />
          <h2 className="font-display text-4xl tracking-wider uppercase drop-shadow-[2px_2px_0_black] flex items-center gap-2">
            <Compass className="w-9 h-9 text-secondary drop-shadow-[1px_1px_0_black]" strokeWidth={3} />
            Explorar Catálogo Online
          </h2>
          <p className="font-sans font-extrabold text-sm uppercase mt-2 text-white/90">
            Navegue pelos mangás e HQs unificados de todas as nossas fontes ativas em tempo real.
          </p>
        </div>

        <div className="space-y-6">
          
          <div className="flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center bg-white p-4 border-4 border-black rounded-xl comic-shadow-sm">
            <span className="font-display text-lg text-black uppercase">
              Descobrir Quadrinhos/Mangás:
            </span>

            {/* Filters layout */}
            <div className="flex flex-col sm:flex-row gap-3">
              
              {/* Language Filter */}
              <div className="flex border-2 border-black rounded overflow-hidden text-xs font-sans font-bold">
                <span className="bg-muted px-2.5 py-1.5 border-r border-black text-gray-500 flex items-center gap-1">
                  <Languages className="w-3.5 h-3.5" /> IDIOMA
                </span>
                <button
                  onClick={() => setLangFilter("all")}
                  className={cn("px-3 py-1.5 border-r border-black", langFilter === "all" ? "bg-secondary text-black" : "bg-white text-gray-400")}
                >
                  TODOS
                </button>
                <button
                  onClick={() => setLangFilter("pt")}
                  className={cn("px-3 py-1.5 border-r border-black", langFilter === "pt" ? "bg-secondary text-black" : "bg-white text-gray-400")}
                >
                  PT-BR 🇧🇷
                </button>
                <button
                  onClick={() => setLangFilter("en")}
                  className={cn("px-3 py-1.5", langFilter === "en" ? "bg-secondary text-black" : "bg-white text-gray-400")}
                >
                  EN 🇺🇸
                </button>
              </div>

              {/* List Type Tabs */}
              <div className="flex border-2 border-black rounded overflow-hidden">
                <button
                  onClick={() => setListType("popular")}
                  className={cn(
                    "px-4 py-1.5 font-display text-sm flex items-center gap-1.5 border-r border-black transition-colors",
                    listType === "popular" ? "bg-secondary text-black" : "bg-white text-gray-500 hover:bg-muted"
                  )}
                >
                  <Flame className="w-4 h-4 text-primary fill-current" /> MAIS POPULARES
                </button>
                <button
                  onClick={() => setListType("latest")}
                  className={cn(
                    "px-4 py-1.5 font-display text-sm flex items-center gap-1.5 transition-colors",
                    listType === "latest" ? "bg-secondary text-black" : "bg-white text-gray-500 hover:bg-muted"
                  )}
                >
                  <Clock className="w-4 h-4" /> RECENTES
                </button>
              </div>

            </div>
          </div>

          {/* Error state */}
          {error && (
            <div className="bg-red-50 border-4 border-black text-black font-bold p-4 flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-primary shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Loading Grid spinner */}
          {loading ? (
            <div className="py-24 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
              <h3 className="font-display text-2xl">SOLICITANDO FONTES EM TEMPO REAL...</h3>
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className="py-20 text-center border-4 border-dashed border-black bg-white rounded-xl">
              <p className="font-display text-2xl text-gray-400">NENHUM QUADRINHO ENCONTRADO</p>
              <p className="font-sans font-bold text-gray-500 mt-1">Nenhum provedor retornou dados para os filtros selecionados. Verifique se as fontes estão ativas no painel admin.</p>
            </div>
          ) : (
            <>
              {/* Grid catalog list */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                {paginatedItems.map((item) => {
                  const hasPt = item.sources.some(s => s.providerId !== "comicextra");
                  const hasEn = true; // all active sources support English
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleOpenItem(item)}
                      className="group bg-white border-4 border-black rounded-xl overflow-hidden text-left flex flex-col justify-between hover:translate-y-[-6px] transition-all duration-200 comic-shadow hover:shadow-[8px_8px_0_rgba(0,0,0,1)] hover:bg-yellow-50"
                    >
                      <div className="relative aspect-[3/4] border-b-4 border-black bg-zinc-950 overflow-hidden shrink-0">
                        {item.coverUrl && !brokenImages[item.id] ? (
                          <img 
                            src={proxyCoverUrl(item.coverUrl)} 
                            alt={item.title} 
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={() => setBrokenImages(prev => ({ ...prev, [item.id]: true }))}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-display text-5xl text-white/20 select-none bg-gradient-to-br from-zinc-900 to-zinc-950">
                            {item.title.charAt(0).toUpperCase()}
                          </div>
                        )}
                        

                      </div>

                      <div className="p-4 flex-1 flex flex-col justify-between min-w-0">
                        <div>
                          <h4 className="font-display text-lg text-black leading-tight group-hover:text-primary transition-colors line-clamp-2">
                            {item.title}
                          </h4>
                          <p className="font-sans text-2xs text-gray-500 font-extrabold uppercase mt-1">
                            Fontes: {item.sources.map(s => s.providerId.toUpperCase()).join(", ")}
                          </p>
                        </div>
                        
                        <div className="mt-4 pt-3 border-t border-dashed border-black/20 flex items-center justify-between">
                          {item.rating !== undefined && (
                            <span className="flex items-center gap-1 font-display text-sm text-yellow-500">
                              ⭐ {(item.rating / 2).toFixed(1)}
                            </span>
                          )}
                          <span className="font-display text-xs text-primary group-hover:translate-x-1 transition-transform">
                            LER AGORA →
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex flex-wrap justify-center items-center gap-2 mt-12 pt-6 border-t-4 border-dashed border-black/20 font-sans">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => {
                      setCurrentPage(prev => Math.max(prev - 1, 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-3 py-1.5 border-2 border-black rounded font-bold hover:bg-secondary disabled:opacity-50 disabled:hover:bg-transparent transition-colors bg-white text-black"
                  >
                    &lt;
                  </button>
                  
                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const pageNum = idx + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => {
                          setCurrentPage(pageNum);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={cn(
                          "w-9 h-9 border-2 border-black rounded font-bold transition-all",
                          currentPage === pageNum 
                            ? "bg-secondary text-black scale-110 comic-shadow-sm font-black" 
                            : "bg-white text-gray-700 hover:bg-muted"
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => {
                      setCurrentPage(prev => Math.min(prev + 1, totalPages));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-3 py-1.5 border-2 border-black rounded font-bold hover:bg-secondary disabled:opacity-50 disabled:hover:bg-transparent transition-colors bg-white text-black"
                  >
                    &gt;
                  </button>
                </div>
              )}
            </>
          )}

        </div>

      </div>
    </Layout>
  );
}
