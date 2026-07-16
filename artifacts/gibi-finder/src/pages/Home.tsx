import { useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Hero } from "@/components/home/Hero";
import { SearchPanel } from "@/components/home/SearchPanel";
import { ResultView } from "@/components/results/ResultView";
import { useSearchActions } from "@/hooks/use-search-actions";
import { useLocation } from "wouter";
import { BookOpen, HelpCircle, Loader2, Star } from "lucide-react";
import { cn, proxyCoverUrl } from "@/lib/utils";

interface UnifiedSearchResult {
  id: string;
  title: string;
  coverUrl?: string;
  description?: string;
  rating?: number;
  genres?: string[];
  sources: {
    providerId: string;
    id: string;
    title: string;
  }[];
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Home() {
  const [, setLocation] = useLocation();
  const { 
    results,
    resultSource,
    isPending: aiPending, 
    searchByImage, 
    searchByText, 
    searchByCharacter, 
    searchByQuote,
    clearResults
  } = useSearchActions();

  const [onlineResults, setOnlineResults] = useState<UnifiedSearchResult[] | null>(null);
  const [onlineSearching, setOnlineSearching] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const handleImageError = (itemId: string) => {
    setBrokenImages(prev => ({ ...prev, [itemId]: true }));
  };

  const resultsRef = useRef<HTMLDivElement>(null);

  const [isNsfw, setIsNsfw] = useState(() => document.documentElement.classList.contains("nsfw"));

  useEffect(() => {
    const handleNsfwChange = () => {
      setIsNsfw(document.documentElement.classList.contains("nsfw"));
    };
    window.addEventListener("nsfw-change", handleNsfwChange);
    return () => window.removeEventListener("nsfw-change", handleNsfwChange);
  }, []);

  // Search online aggregator
  const searchByOnline = async (query: string) => {
    if (!query.trim()) return;
    setOnlineSearching(true);
    setSearchedQuery(query);
    clearResults(); // Clear AI results if any
    setOnlineResults(null);

    try {
      const res = await fetch(`${BASE}/api/providers/search?query=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json() as UnifiedSearchResult[];
        setOnlineResults(data);
      } else {
        setOnlineResults([]);
      }
    } catch (err) {
      console.error(err);
      setOnlineResults([]);
    } finally {
      setOnlineSearching(false);
    }
  };

  // Scroll to results
  useEffect(() => {
    if ((results || onlineResults) && resultsRef.current) {
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [results, onlineResults]);

  const handleOpenOnlineResult = (item: UnifiedSearchResult) => {
    if (item.sources.length === 0) return;
    // Use first source details to load the detail aggregator view
    const src = item.sources[0];
    const url = `/gibi/online?providerId=${src.providerId}&id=${encodeURIComponent(src.id)}&title=${encodeURIComponent(item.title)}&coverUrl=${encodeURIComponent(item.coverUrl || "")}&description=${encodeURIComponent(item.description || "")}`;
    setLocation(url);
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto relative z-10 pb-16">
        <Hero />
        <SearchPanel 
          onSearchImage={searchByImage}
          onSearchText={searchByText}
          onSearchCharacter={searchByCharacter}
          onSearchQuote={searchByQuote}
          onSearchOnline={searchByOnline}
          isPending={aiPending || onlineSearching}
        />
        
        {/* Loading Spinner for Online Search */}
        {onlineSearching && (
          <div className="py-24 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <h3 className="font-display text-2xl">PESQUISANDO NOS PROVEDORES EM TEMPO REAL...</h3>
          </div>
        )}

        {/* AI Identification Results */}
        {results && (
          <div ref={resultsRef} className="scroll-mt-24 mt-8">
            <ResultView results={results} source={resultSource} />
          </div>
        )}

        {/* Online Aggregated Search Results */}
        {onlineResults && !onlineSearching && (() => {
          const ADULT_GENRES = ["hentai", "ecchi", "doujinshi", "erótico", "erotica", "adulto", "adult"];
          const filtered = onlineResults.filter(item => {
            const isAdult = item.sources?.some(s => s.providerId === "eightmuses") || 
                            item.genres?.some((g: string) => ADULT_GENRES.includes(g.toLowerCase()));
            if (!isNsfw && isAdult) return false;
            return true;
          });

          return (
            <div ref={resultsRef} className="scroll-mt-24 mt-12 space-y-8">
              <div className="flex items-center justify-between border-b-4 border-black pb-4">
                <h2 className="font-display text-3xl text-black uppercase flex items-center gap-2">
                  <BookOpen className="w-8 h-8 text-primary" strokeWidth={3} />
                  Resultados Online para "{searchedQuery}"
                </h2>
                <span className="font-sans font-extrabold text-xs uppercase bg-black text-white px-3 py-1">
                  {filtered.length} Encontrado(s)
                </span>
              </div>

              {filtered.length === 0 ? (
                <div className="text-center py-20 border-4 border-dashed border-black bg-white comic-shadow-sm">
                  <HelpCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="font-display text-2xl text-black">NENHUM QUADRINHO ENCONTRADO</h3>
                  <p className="font-sans font-bold text-gray-500 mt-2">Tente pesquisar em inglês ou verifique se os provedores estão ativados no painel admin.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {filtered.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleOpenOnlineResult(item)}
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
                            onError={() => handleImageError(item.id)}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-display text-4xl text-white/20 select-none bg-gradient-to-br from-zinc-900 to-zinc-950">
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
                          {item.genres && item.genres.length > 0 && (() => {
                            const ADULT_GENRES = ["hentai", "ecchi", "doujinshi", "erótico", "erotica", "adulto", "adult"];
                            const isAdult = item.sources.some(s => s.providerId === "eightmuses") || 
                                            item.genres.some((g: string) => ADULT_GENRES.includes(g.toLowerCase()));
                            const isUncensored = item.sources.some(s => s.providerId === "eightmuses") || 
                                                 item.genres.some((g: string) => g.toLowerCase().includes("uncensored") || g.toLowerCase().includes("sem censura"));
                            return (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {item.genres.slice(0, 2).map((g: string, i: number) => (
                                  <span key={i} className="bg-yellow-200 text-black text-3xs font-extrabold uppercase px-1.5 py-0.5 border border-black rounded-sm shadow-[1px_1px_0_rgba(0,0,0,1)]">
                                    {g}
                                  </span>
                                ))}
                                {isAdult && (
                                  <span className={cn(
                                    "text-white text-3xs font-extrabold uppercase px-1.5 py-0.5 border border-black rounded-sm shadow-[1px_1px_0_rgba(0,0,0,1)]",
                                    isUncensored ? "bg-cyan-500" : "bg-rose-500"
                                  )}>
                                    {isUncensored ? "🔓 SEM CENSURA" : "🔒 CENSURADO"}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        
                        <div className="mt-4 pt-3 border-t border-dashed border-black/20 flex items-center justify-between">
                          {item.rating !== undefined && (
                            <span className="flex items-center gap-1 bg-[#FFD166] text-black px-2 py-0.5 border-2 border-black rounded-lg font-display text-xs font-black shadow-[2px_2px_0_rgba(0,0,0,1)]">
                              <Star className="w-3 h-3 fill-black text-black" strokeWidth={2.5} />
                              {(item.rating / 2).toFixed(1)}
                            </span>
                          )}
                          <span className="font-display text-xs text-primary group-hover:translate-x-1 transition-transform">
                            LER AGORA →
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </Layout>
  );
}
