import { useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Hero } from "@/components/home/Hero";
import { SearchPanel } from "@/components/home/SearchPanel";
import { ResultView } from "@/components/results/ResultView";
import { useSearchActions } from "@/hooks/use-search-actions";
import { useLocation } from "wouter";
import { AlertTriangle, BookOpen, HelpCircle, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeImage } from "@/components/ui/SafeImage";

interface UnifiedSearchResult {
  id: string;
  title: string;
  coverUrl?: string;
  description?: string;
  rating?: number;
  genres?: string[];
  isAdult?: boolean;
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
  const [adultSearchWarning, setAdultSearchWarning] = useState<{ hiddenCount: number; adultQuery: boolean } | null>(null);

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
    setAdultSearchWarning(null);

    try {
      const res = await fetch(`${BASE}/api/providers/search?query=${encodeURIComponent(query)}&nsfw=${isNsfw}`);
      if (res.ok) {
        const data = await res.json() as UnifiedSearchResult[];
        const hiddenCount = Number(res.headers.get("X-Adult-Results-Hidden") || "0");
        const adultQuery = res.headers.get("X-Adult-Query") === "true";
        setAdultSearchWarning(hiddenCount > 0 || (adultQuery && !isNsfw) ? { hiddenCount, adultQuery } : null);
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
          const ADULT_PROVIDERS = ["eightmuses", "hentai-home", "hentai-fox", "hentai2read", "hq-desejo", "insta-hentai", "mega-hentai", "my-manga-comics", "nhentai", "quadrinhos-de-sexo", "quadrinhos-eroticos", "universo-hentai", "hentai-teca", "sombras-de-hentai"];
          const filtered = onlineResults.filter(item => {
            const isAdult = item.isAdult ||
                            item.sources?.some(s => ADULT_PROVIDERS.includes(s.providerId)) ||
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

              {adultSearchWarning && !isNsfw && (
                <div className="bg-rose-50 border-4 border-rose-600 rounded-xl p-4 comic-shadow-sm flex items-start gap-3">
                  <AlertTriangle className="w-7 h-7 text-rose-600 shrink-0 mt-0.5" strokeWidth={3} />
                  <div>
                    <h3 className="font-display text-xl text-rose-700 uppercase">Conteudo +18 oculto</h3>
                    <p className="font-sans font-bold text-sm text-rose-900 leading-relaxed">
                      Esta busca parece ter titulos adultos. {adultSearchWarning.hiddenCount > 0 ? `${adultSearchWarning.hiddenCount} resultado(s) +18 foram escondidos.` : "Ative o modo +18 para pesquisar e exibir esse tipo de conteudo."}
                    </p>
                  </div>
                </div>
              )}

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
                        <SafeImage 
                          src={item.coverUrl} 
                          alt={item.title} 
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
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
                            const ADULT_PROVIDERS = ["eightmuses", "hentai-home", "hentai-fox", "hentai2read", "hq-desejo", "insta-hentai", "mega-hentai", "my-manga-comics", "nhentai", "quadrinhos-de-sexo", "quadrinhos-eroticos", "universo-hentai", "hentai-teca", "sombras-de-hentai"];
                            const isAdult = item.isAdult ||
                                            item.sources.some(s => ADULT_PROVIDERS.includes(s.providerId)) ||
                                            item.genres.some((g: string) => ADULT_GENRES.includes(g.toLowerCase()));
                            const isUncensored = item.sources.some(s => ADULT_PROVIDERS.includes(s.providerId)) || 
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
