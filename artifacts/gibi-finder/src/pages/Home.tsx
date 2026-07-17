import { useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Hero } from "@/components/home/Hero";
import { SearchPanel } from "@/components/home/SearchPanel";
import { ResultView } from "@/components/results/ResultView";
import { useSearchActions } from "@/hooks/use-search-actions";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowDown, ArrowUp, BookOpen, Filter, HelpCircle, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeImage } from "@/components/ui/SafeImage";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { isFavorite, toggleFavorite } from "@/lib/favorites";
import { addSearchHistoryItem } from "@/lib/user-history";

interface UnifiedSearchResult {
  id: string;
  title: string;
  coverUrl?: string;
  description?: string;
  rating?: number;
  genres?: string[];
  isAdult?: boolean;
  releaseDate?: string;
  sources: {
    providerId: string;
    id: string;
    title: string;
    releaseDate?: string;
  }[];
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const LAST_ONLINE_SEARCH_KEY = "gibi-finder:last-online-search";
const ADULT_GENRES = ["hentai", "ecchi", "doujinshi", "erotico", "erotica", "adulto", "adult"];
const ADULT_PROVIDERS = ["eightmuses", "hentai-home", "hentai-fox", "hentai2read", "hq-desejo", "insta-hentai", "mega-hentai", "my-manga-comics", "nhentai", "quadrinhos-de-sexo", "quadrinhos-eroticos", "universo-hentai", "hentai-teca", "sombras-de-hentai"];

const PUBLISHER_FILTERS = [
  { id: "all", label: "Todas" },
  { id: "dc", label: "DC" },
  { id: "marvel", label: "Marvel" },
  { id: "image", label: "Image" },
  { id: "dark-horse", label: "Dark Horse" },
  { id: "idw", label: "IDW" },
  { id: "disney", label: "Disney" },
] as const;

type PublisherFilter = typeof PUBLISHER_FILTERS[number]["id"];
type ReleaseSort = "asc" | "desc" | null;

const PUBLISHER_TERMS: Record<Exclude<PublisherFilter, "all">, string[]> = {
  dc: [
    "dc", "batman", "superman", "wonder woman", "mulher maravilha", "flash", "aquaman", "shazam",
    "lanterna verde", "green lantern", "justice league", "liga da justica", "nightwing", "asa noturna",
    "robin", "arlequina", "harley", "coringa", "joker", "gotham", "teen titans", "jovens titas"
  ],
  marvel: [
    "marvel", "spider man", "spider-man", "homem aranha", "x men", "x-men", "wolverine", "deadpool",
    "hulk", "avengers", "vingadores", "iron man", "homem de ferro", "captain america", "capitao america",
    "thor", "venom", "daredevil", "demolidor", "fantastic four", "quarteto fantastico", "miles morales"
  ],
  image: ["image", "spawn", "invincible", "the walking dead", "saga", "witchblade", "youngblood", "radiant black"],
  "dark-horse": ["dark horse", "hellboy", "bprd", "b p r d", "sin city", "umbrella academy", "star wars", "conan"],
  idw: ["idw", "transformers", "teenage mutant ninja turtles", "tartarugas ninja", "tmnt", "sonic", "my little pony"],
  disney: ["disney", "mickey", "minnie", "donald", "pateta", "tio patinhas", "ducktales", "ze carioca"]
};

const normalizeFilterText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const getPublisherFilterText = (item: UnifiedSearchResult) => normalizeFilterText([
  item.title,
  item.description || "",
  ...(item.genres || []),
  ...item.sources.map(source => `${source.providerId} ${source.title}`)
].join(" "));

const matchesPublisher = (item: UnifiedSearchResult, filter: PublisherFilter) => {
  if (filter === "all") return true;
  const text = getPublisherFilterText(item);
  const words = text.split(/\s+/);
  return PUBLISHER_TERMS[filter].some(term => {
    const normalizedTerm = normalizeFilterText(term);
    return normalizedTerm.length <= 3 ? words.includes(normalizedTerm) : text.includes(normalizedTerm);
  });
};

const getPublisherCounts = (items: UnifiedSearchResult[]) => {
  const counts = Object.fromEntries(PUBLISHER_FILTERS.map(option => [option.id, 0])) as Record<PublisherFilter, number>;
  counts.all = items.length;
  for (const item of items) {
    for (const option of PUBLISHER_FILTERS) {
      if (option.id !== "all" && matchesPublisher(item, option.id)) {
        counts[option.id] += 1;
      }
    }
  }
  return counts;
};

const getReleaseTime = (date?: string) => {
  if (!date) return 0;
  const trimmed = String(date).trim();
  if (/^\d{4}$/.test(trimmed)) {
    return new Date(`${trimmed}-01-01T00:00:00.000Z`).getTime();
  }
  const time = new Date(trimmed).getTime();
  return Number.isFinite(time) ? time : 0;
};

const formatReleaseDate = (date?: string) => {
  if (!date) return "";
  const trimmed = String(date).trim();
  if (/^\d{4}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
};

const sortByReleaseDate = (items: UnifiedSearchResult[], direction: ReleaseSort) => {
  if (!direction) return items;
  return [...items].sort((a, b) => {
    const aTime = getReleaseTime(a.releaseDate);
    const bTime = getReleaseTime(b.releaseDate);
    if (!aTime && !bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;
    return direction === "desc" ? bTime - aTime : aTime - bTime;
  });
};

export default function Home() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
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
  const [publisherFilter, setPublisherFilter] = useState<PublisherFilter>("all");
  const [releaseSort, setReleaseSort] = useState<ReleaseSort>(null);
  const [favoriteVersion, setFavoriteVersion] = useState(0);

  const resultsRef = useRef<HTMLDivElement>(null);

  const [isNsfw, setIsNsfw] = useState(() => document.documentElement.classList.contains("nsfw"));

  useEffect(() => {
    const handleNsfwChange = () => {
      setIsNsfw(document.documentElement.classList.contains("nsfw"));
    };
    window.addEventListener("nsfw-change", handleNsfwChange);
    return () => window.removeEventListener("nsfw-change", handleNsfwChange);
  }, []);

  // On mount: re-run a search coming from history (?q=...), or restore the last
  // online search ONLY when returning via "Voltar aos resultados" (?restore=1).
  // A plain visit to "/" (e.g. clicking the logo) starts clean.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("q");
    if (q && q.trim()) {
      searchByOnline(q.trim());
      return;
    }
    if (sp.get("restore") === "1") {
      try {
        const raw = sessionStorage.getItem(LAST_ONLINE_SEARCH_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as { query?: string; results?: UnifiedSearchResult[] };
          if (saved && Array.isArray(saved.results)) {
            setSearchedQuery(saved.query || "");
            setOnlineResults(saved.results);
          }
        }
      } catch {}
      // Drop the query flag so a later logo click / refresh stays clean.
      try { window.history.replaceState({}, "", window.location.pathname); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search online aggregator
  const searchByOnline = async (query: string) => {
    if (!query.trim()) return;
    setOnlineSearching(true);
    setSearchedQuery(query);
    clearResults(); // Clear AI results if any
    setOnlineResults(null);
    setAdultSearchWarning(null);
    setPublisherFilter("all");
    setReleaseSort(null);

    try {
      const res = await fetch(`${BASE}/api/providers/search?query=${encodeURIComponent(query)}&nsfw=${isNsfw}`);
      if (res.ok) {
        const data = await res.json() as UnifiedSearchResult[];
        const hiddenCount = Number(res.headers.get("X-Adult-Results-Hidden") || "0");
        const adultQuery = res.headers.get("X-Adult-Query") === "true";
        setAdultSearchWarning(hiddenCount > 0 || (adultQuery && !isNsfw) ? { hiddenCount, adultQuery } : null);
        setOnlineResults(data);
        // Persist so "voltar aos resultados" from a detail page can restore the
        // list without re-running the search.
        try {
          sessionStorage.setItem(LAST_ONLINE_SEARCH_KEY, JSON.stringify({ query, results: data }));
        } catch {}
        // Record the online search in the search history so it can be repeated.
        if (data.length > 0) {
          addSearchHistoryItem({
            id: `online-${query.toLowerCase().trim()}`,
            titulo: query,
            revista: `${data.length} resultado(s) online`,
            editora: "Busca online",
            ano: "",
            images: data.find(item => item.coverUrl)?.coverUrl ? [data.find(item => item.coverUrl)!.coverUrl!] : [],
            search_type: "online",
            created_at: new Date().toISOString()
          }, user?.id);
        }
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
    const src = item.sources[0];
    const url = `/gibi/online?providerId=${src.providerId}&id=${encodeURIComponent(src.id)}&title=${encodeURIComponent(item.title)}&coverUrl=${encodeURIComponent(item.coverUrl || "")}&description=${encodeURIComponent(item.description || "")}&resume=true`;
    setLocation(url);
  };

  const handleToggleFavorite = (item: UnifiedSearchResult, e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.sources.length === 0) return;
    const src = item.sources[0];
    const added = toggleFavorite({
      providerId: src.providerId,
      mangaId: src.id,
      title: item.title,
      coverUrl: item.coverUrl,
      description: item.description
    }, user?.id);
    setFavoriteVersion(v => v + 1);
    toast({
      title: added ? "Adicionado aos favoritos!" : "Removido dos favoritos",
      description: added ? "Salvo na sua estante." : "Removido da sua estante."
    });
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
          const publisherCounts = getPublisherCounts(filtered);
          const publisherFiltered = filtered.filter(item => matchesPublisher(item, publisherFilter));
          const visibleResults = sortByReleaseDate(publisherFiltered, releaseSort);

          return (
            <div ref={resultsRef} className="scroll-mt-24 mt-12 space-y-8">
              <div className="flex items-center justify-between border-b-4 border-black pb-4">
                <h2 className="font-display text-3xl text-black uppercase flex items-center gap-2">
                  <BookOpen className="w-8 h-8 text-primary" strokeWidth={3} />
                  Resultados Online para "{searchedQuery}"
                </h2>
                <span className="font-sans font-extrabold text-xs uppercase bg-black text-white px-3 py-1">
                  {visibleResults.length} Encontrado(s)
                </span>
              </div>

              <div className="bg-white border-4 border-black rounded-xl comic-shadow-sm p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Filter className="w-5 h-5 text-primary" strokeWidth={3} />
                    <h3 className="font-display text-xl text-black uppercase">Editora</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm text-black uppercase">Lancamento</span>
                    <div className="flex border-2 border-black rounded-lg overflow-hidden bg-white">
                      <button
                        type="button"
                        onClick={() => setReleaseSort(releaseSort === "asc" ? null : "asc")}
                        title="Mais antigos primeiro"
                        aria-label="Ordenar por data: mais antigos primeiro"
                        className={cn(
                          "h-9 w-10 flex items-center justify-center border-r-2 border-black transition-colors",
                          releaseSort === "asc" ? "bg-primary text-white" : "bg-white text-black hover:bg-yellow-100"
                        )}
                      >
                        <ArrowUp className="h-4 w-4" strokeWidth={3} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setReleaseSort(releaseSort === "desc" ? null : "desc")}
                        title="Mais recentes primeiro"
                        aria-label="Ordenar por data: mais recentes primeiro"
                        className={cn(
                          "h-9 w-10 flex items-center justify-center transition-colors",
                          releaseSort === "desc" ? "bg-primary text-white" : "bg-white text-black hover:bg-yellow-100"
                        )}
                      >
                        <ArrowDown className="h-4 w-4" strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {PUBLISHER_FILTERS.map(option => {
                    const isActive = publisherFilter === option.id;
                    const count = publisherCounts[option.id];
                    return (
                      <button
                        key={option.id}
                        onClick={() => setPublisherFilter(option.id)}
                        disabled={option.id !== "all" && count === 0}
                        className={cn(
                          "min-h-11 border-2 border-black rounded-lg px-2 py-2 font-display text-sm uppercase transition-all flex items-center justify-center gap-1.5",
                          isActive
                            ? "bg-primary text-white shadow-[3px_3px_0_rgba(0,0,0,1)] translate-y-[-1px]"
                            : "bg-white text-black hover:bg-yellow-100",
                          option.id !== "all" && count === 0 && "opacity-40 cursor-not-allowed hover:bg-white"
                        )}
                      >
                        <span>{option.label}</span>
                        <span className={cn(
                          "font-sans text-[10px] font-black px-1.5 py-0.5 rounded-full border border-black",
                          isActive ? "bg-white text-black" : "bg-black text-white"
                        )}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
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

              {visibleResults.length === 0 ? (
                <div className="text-center py-20 border-4 border-dashed border-black bg-white comic-shadow-sm">
                  <HelpCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="font-display text-2xl text-black">NENHUM QUADRINHO ENCONTRADO</h3>
                  <p className="font-sans font-bold text-gray-500 mt-2">Tente pesquisar em inglês ou verifique se os provedores estão ativados no painel admin.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {visibleResults.map((item) => {
                    const src = item.sources[0];
                    const favorited = src ? isFavorite(src.providerId, src.id) : false;
                    void favoriteVersion;
                    return (
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
                        {src && (
                          <button
                            type="button"
                            onClick={(e) => handleToggleFavorite(item, e)}
                            className={cn(
                              "absolute top-2 right-2 p-1.5 border-2 border-black rounded-full transition-colors shadow-[2px_2px_0_rgba(0,0,0,1)]",
                              favorited ? "bg-secondary text-black" : "bg-white/90 text-gray-500 hover:bg-secondary hover:text-black"
                            )}
                            title={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                          >
                            <Star className={cn("w-4 h-4", favorited && "fill-black")} strokeWidth={3} />
                          </button>
                        )}
                      </div>

                      <div className="p-4 flex-1 flex flex-col justify-between min-w-0">
                        <div>
                          <h4 className="font-display text-lg text-black leading-tight group-hover:text-primary transition-colors line-clamp-2">
                            {item.title}
                          </h4>
                          <p className="font-sans text-2xs text-gray-500 font-extrabold uppercase mt-1">
                            Fontes: {Array.from(new Set(item.sources.map(s => s.providerId.toUpperCase()))).join(", ")}
                          </p>
                          {item.releaseDate && (
                            <p className="font-sans text-2xs text-gray-500 font-extrabold uppercase mt-1">
                              Lancamento: {formatReleaseDate(item.releaseDate)}
                            </p>
                          )}
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
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </Layout>
  );
}
