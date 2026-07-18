import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetResult } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/Layout";
import { ComicCard } from "@/components/results/ComicCard";
import { FeedbackActions } from "@/components/results/FeedbackActions";
import { MangaDexReader } from "@/components/results/MangaDexReader";
import { Link2, AlertCircle, Loader2, Star, BookOpen, ExternalLink, ShoppingCart, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn, translateToPt } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ✏️  Troque pelo seu ID de afiliado real da Amazon Brasil
const AMAZON_TAG = import.meta.env.VITE_AMAZON_TAG || "gibifinder-20";

function getGoogleDriveEmbedUrl(driveUrl?: string): string | null {
  if (!driveUrl) return null;
  const matchD = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchD && matchD[1]) {
    return `https://drive.google.com/file/d/${matchD[1]}/preview`;
  }
  const matchId = driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId && matchId[1]) {
    return `https://drive.google.com/file/d/${matchId[1]}/preview`;
  }
  return null;
}

export default function ResultDetail() {
  const [, params] = useRoute("/gibi/:id");
  const [, setLocation] = useLocation();
  const id = params?.id || "";
  const { toast } = useToast();
  const { user } = useAuth();
  const [detailTab, setDetailTab] = useState<"read" | "buy">("read");

  // Whether there is a stored online search to return to.
  const [savedSearchQuery, setSavedSearchQuery] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("gibi-finder:last-online-search");
      if (!raw) return;
      const saved = JSON.parse(raw) as { query?: string; results?: unknown[] };
      if (saved && Array.isArray(saved.results) && saved.results.length > 0) {
        setSavedSearchQuery(saved.query || "");
      }
    } catch {}
  }, []);

  // Search parameters for virtual aggregator view
  const searchParams = new URLSearchParams(window.location.search);
  const providerId = searchParams.get("providerId") || "";
  const mangaId = searchParams.get("id") || "";
  const initialTitle = searchParams.get("title") || "";
  const initialCoverUrl = searchParams.get("coverUrl") || "";
  const initialDescription = searchParams.get("description") || "";

  const isOnlineResult = id === "online";

  // State for online details
  const [onlineDetails, setOnlineDetails] = useState<any | null>(null);
  const [loadingOnline, setLoadingOnline] = useState(false);

  // Load details from provider if virtual view
  const loadOnlineDetails = async () => {
    if (!providerId || !mangaId) return;
    setLoadingOnline(true);
    try {
      const res = await fetch(`${BASE}/api/providers/details?providerId=${providerId}&id=${encodeURIComponent(mangaId)}`);
      if (res.ok) {
        const data = await res.json();
        setOnlineDetails(data);
      }
    } catch (err) {
      console.error("Failed to load online details:", err);
    } finally {
      setLoadingOnline(false);
    }
  };

  useEffect(() => {
    if (isOnlineResult) {
      loadOnlineDetails();
    }
  }, [id, providerId, mangaId]);

  // Hook for database results
  const { data: dbData, isLoading: loadingDb, error: dbError } = useGetResult(id, {
    query: { enabled: !!id && !isOnlineResult } as any
  });

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Link copiado!",
      description: "Compartilhe este gibi com seus amigos.",
    });
  };

  const itemMangaId = isOnlineResult ? mangaId : id;
  const itemProviderId = isOnlineResult ? providerId : "local";
  const [isFavorited, setIsFavorited] = useState(false);
  const [ptSinopse, setPtSinopse] = useState<string | null>(null);

  useEffect(() => {
    if (!itemMangaId) return;
    try {
      const favorites = JSON.parse(localStorage.getItem("gibi-finder:favorites") || "[]") as any[];
      const favorited = favorites.some((f: any) => f.mangaId === itemMangaId && f.providerId === itemProviderId);
      setIsFavorited(favorited);
    } catch {}
  }, [itemMangaId, itemProviderId]);

  const toggleFavorite = () => {
    if (!itemMangaId) return;
    try {
      const favorites = JSON.parse(localStorage.getItem("gibi-finder:favorites") || "[]") as any[];
      const existsIndex = favorites.findIndex((f: any) => f.mangaId === itemMangaId && f.providerId === itemProviderId);
      
      let newFavorites = [...favorites];
      if (existsIndex > -1) {
        newFavorites.splice(existsIndex, 1);
        setIsFavorited(false);
        toast({
          title: "Removido dos favoritos",
          description: "O gibi foi removido da sua coleção.",
        });
      } else {
        newFavorites.push({
          providerId: itemProviderId,
          mangaId: itemMangaId,
          title: resultData?.titulo || resultData?.revista || initialTitle || "Sem título",
          coverUrl: (resultData as any)?.coverUrl || (resultData as any)?.images?.[0] || initialCoverUrl || undefined,
          description: (resultData as any)?.sinopse || (resultData as any)?.descricao || initialDescription || "",
          timestamp: Date.now()
        });
        setIsFavorited(true);
        toast({
          title: "Adicionado aos favoritos!",
          description: "O gibi foi salvo na sua coleção.",
        });
      }
      localStorage.setItem("gibi-finder:favorites", JSON.stringify(newFavorites));

      if (user) {
        fetch(`${BASE}/api/auth/favorites/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, favorites: newFavorites })
        }).catch(err => console.error("Error syncing favorite to server:", err));
      }
    } catch (err) {
      console.error("Error toggling favorite:", err);
    }
  };

  const [stats, setStats] = useState<any | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const loadStats = async () => {
    if (!itemMangaId || !itemProviderId) return;
    setLoadingStats(true);
    try {
      const res = await fetch(`${BASE}/api/providers/statistics?providerId=${itemProviderId}&id=${encodeURIComponent(itemMangaId)}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to load statistics:", err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (itemMangaId) {
      loadStats();
    }
  }, [itemMangaId, itemProviderId]);

  const renderStars = (rating: number) => {
    const starValue = rating / 2;
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      if (i <= starValue) {
        stars.push(<Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" strokeWidth={3} />);
      } else if (i - 0.5 <= starValue) {
        stars.push(
          <div key={i} className="relative inline-block leading-none">
            <Star className="w-5 h-5 text-gray-300 fill-gray-300" strokeWidth={3} />
            <div className="absolute top-0 left-0 overflow-hidden w-[50%] h-full leading-none">
              <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" strokeWidth={3} />
            </div>
          </div>
        );
      } else {
        stars.push(<Star key={i} className="w-5 h-5 text-gray-300" strokeWidth={3} />);
      }
    }
    return stars;
  };

  const isLoading = isOnlineResult ? loadingOnline : loadingDb;
  const hasError = isOnlineResult ? (!mangaId) : (dbError || !dbData);

  // Construct virtual or db result object
  const resultData = isOnlineResult 
    ? {
        id: mangaId,
        titulo: onlineDetails?.title || initialTitle,
        revista: onlineDetails?.title || initialTitle,
        editora: providerId.toUpperCase(),
        ano: "Online",
        sinopse: onlineDetails?.description || initialDescription || "Carregado via agregador externo.",
        images: onlineDetails?.coverUrl ? [onlineDetails.coverUrl] : (initialCoverUrl ? [initialCoverUrl] : ["https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop"]),
        genres: onlineDetails?.genres || []
      }
    : dbData?.result 
      ? {
          ...(dbData.result as any),
          genres: (dbData.result as any).genres || (dbData.result as any).generos || []
        }
      : undefined;

  // Translate the synopsis to Portuguese (cached; skips text already in PT).
  const rawSinopse = ((resultData as any)?.sinopse || (resultData as any)?.descricao) as string | undefined;
  useEffect(() => {
    setPtSinopse(null);
    if (!rawSinopse) return;
    let active = true;
    translateToPt(rawSinopse).then(t => { if (active && t && t !== rawSinopse) setPtSinopse(t); });
    return () => { active = false; };
  }, [rawSinopse]);

  // ComicCard renders `descricao`; online results carry `sinopse`. Fill both with
  // the translated (or original) text so the synopsis always shows in Portuguese.
  const displayResult = resultData
    ? {
        ...(resultData as any),
        sinopse: ptSinopse || (resultData as any).sinopse,
        descricao: ptSinopse || (resultData as any).descricao || (resultData as any).sinopse,
      }
    : resultData;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto pb-16">
        {isOnlineResult && savedSearchQuery !== null && (
          <button
            onClick={() => setLocation("/?restore=1")}
            className="mb-6 inline-flex items-center gap-2 bg-white text-black font-display text-sm uppercase px-4 py-2.5 border-4 border-black rounded-lg comic-shadow-sm hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={3} />
            {savedSearchQuery ? `Voltar aos resultados de "${savedSearchQuery}"` : "Voltar aos resultados"}
          </button>
        )}
        {isLoading ? (
          <div className="py-32 text-center">
            <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto mb-4" />
            <p className="font-display text-2xl">CARREGANDO DETALHES DO QUADRINHO...</p>
          </div>
        ) : hasError || !resultData ? (
          <div className="bg-destructive/10 border-4 border-destructive p-12 rounded-xl text-center max-w-lg mx-auto mt-12">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" strokeWidth={2} />
            <h2 className="font-display text-4xl text-destructive mb-2">OBRA NÃO ENCONTRADA</h2>
            <p className="font-sans font-bold text-gray-700">Não foi possível carregar as informações deste título.</p>
          </div>
        ) : (
          <div className="space-y-12">
            <div className="flex justify-between items-center bg-white p-4 border-4 border-black rounded-xl comic-shadow">
              <span className="font-display text-2xl text-gray-600">
                {isOnlineResult ? `PROVEDOR: ${providerId.toUpperCase()}` : `ARQUIVO #${id.slice(0,8).toUpperCase()}`}
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={toggleFavorite}
                  className={cn(
                    "flex items-center gap-2 font-sans font-extrabold text-sm uppercase px-4 py-2 border-2 border-black rounded transition-colors",
                    isFavorited 
                      ? "bg-yellow-400 text-black hover:bg-yellow-500" 
                      : "bg-white text-black hover:bg-gray-100"
                  )}
                >
                  <Star className={cn("w-4 h-4", isFavorited && "fill-black")} strokeWidth={3} />
                  {isFavorited ? "FAVORITADO" : "FAVORITAR"}
                </button>
                <button 
                  onClick={handleCopyLink}
                  className="flex items-center gap-2 font-sans font-extrabold text-sm uppercase bg-secondary px-4 py-2 border-2 border-black rounded hover:bg-secondary/80 transition-colors"
                >
                  <Link2 className="w-4 h-4" strokeWidth={3} />
                  COPIAR LINK
                </button>
              </div>
            </div>

            {/* Stats / Rating Bar */}
            {stats && (
              <div className="bg-white p-4 border-4 border-black rounded-xl comic-shadow flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-sans font-bold select-none animate-in fade-in slide-in-from-bottom duration-200">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-display text-xl uppercase text-black">AVALIAÇÃO:</span>
                  <div className="flex items-center gap-0.5">
                    {renderStars(stats.rating)}
                  </div>
                  <span className="text-lg text-black font-extrabold ml-1">
                    {stats.rating ? `${(stats.rating / 2).toFixed(1)} / 5` : "Sem notas"}
                  </span>
                  <span className="text-xs text-gray-400 font-extrabold uppercase">
                    ({stats.votes.toLocaleString()} votos)
                  </span>
                </div>
                
                <div className="flex gap-6 text-sm text-gray-700 w-full sm:w-auto justify-between sm:justify-start">
                  {stats.follows !== undefined && (
                    <div>
                      <span className="text-gray-400 uppercase text-xs block">Seguidores</span>
                      <span className="text-black font-extrabold text-base">{stats.follows.toLocaleString()}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-400 uppercase text-xs block">Popularidade</span>
                    <span className="text-primary font-display text-lg tracking-wider">
                      {stats.rating >= 8 ? "🔥 ALTA" : stats.rating >= 6 ? "⚡ MÉDIA" : "❄️ BAIXA"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Tabs Navigation Bar */}
            <div className="flex border-4 border-black bg-white overflow-hidden select-none comic-shadow-sm">
              <button 
                onClick={() => setDetailTab("read")}
                className={cn(
                  "flex-1 py-3.5 font-display text-lg flex items-center justify-center gap-2 transition-colors border-r-4 border-black",
                  detailTab === "read" ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-muted"
                )}
              >
                <BookOpen className="w-5 h-5" strokeWidth={3} />
                LER CAPÍTULOS
              </button>
              
              <button 
                onClick={() => setDetailTab("buy")}
                className={cn(
                  "flex-1 py-3.5 font-display text-lg flex items-center justify-center gap-2 transition-colors",
                  detailTab === "buy" ? "bg-secondary text-black" : "bg-white text-gray-500 hover:bg-muted"
                )}
              >
                <Star className="w-5 h-5" strokeWidth={3} />
                ONDE COMPRAR (OFICIAL)
              </button>
            </div>

            {detailTab === "read" && (() => {
              const driveEmbedUrl = (resultData as any)?.drive_url ? getGoogleDriveEmbedUrl((resultData as any).drive_url) : null;
              return (
                <div className="space-y-12 animate-in fade-in duration-200">
                  <ComicCard result={displayResult as any} isMain />
                  
                  {driveEmbedUrl ? (
                    <div className="space-y-6">
                      <div className="bg-white p-4 border-4 border-black rounded-xl comic-shadow">
                        <h3 className="font-display text-2xl text-black uppercase flex items-center gap-2">
                          📖 LEITOR GIBI-FINDER (PDF)
                        </h3>
                        <p className="font-sans font-bold text-gray-600 text-sm mt-1">
                          Este quadrinho está disponível na nossa coleção local. Aproveite a leitura!
                        </p>
                      </div>
                      
                      <div className="border-4 border-black rounded-xl overflow-hidden comic-shadow bg-zinc-900 aspect-[3/4] sm:aspect-video w-full h-[600px] md:h-[800px]">
                        <iframe 
                          src={driveEmbedUrl}
                          className="w-full h-full border-0"
                          allow="autoplay"
                          title={(resultData as any).titulo || "Leitor de PDF"}
                        />
                      </div>
                    </div>
                  ) : (
                    <MangaDexReader 
                      mangaTitle={(resultData as any).revista || (resultData as any).titulo || ""} 
                      coverUrl={(resultData as any).coverUrl || (resultData as any).images?.[0]} 
                      description={(displayResult as any).sinopse || (displayResult as any).description}
                      initialProviderId={isOnlineResult ? providerId : undefined}
                      initialMangaId={isOnlineResult ? mangaId : undefined}
                    />
                  )}
                </div>
              );
            })()}

            {detailTab === "buy" && (() => {
              const mangaTitle = (resultData as any).revista || (resultData as any).titulo || initialTitle || "";
              const pubStatus = getPublicationStatus(mangaTitle);
              const q = encodeURIComponent(mangaTitle);
              const buyLinks = [
                {
                  store: "Amazon Brasil",
                  emoji: "📦",
                  color: "bg-orange-50 border-orange-400 hover:bg-orange-100",
                  badgeColor: "bg-orange-400 text-white",
                  url: `https://www.amazon.com.br/s?k=manga+${q}&tag=${AMAZON_TAG}`,
                  description: "Frete grátis com Prime · Entrega rápida · Link de afiliado",
                  badge: "Afiliado"
                },
                {
                  store: "Loja Panini",
                  emoji: "🏪",
                  color: "bg-blue-50 border-blue-400 hover:bg-blue-100",
                  badgeColor: "bg-blue-500 text-white",
                  url: `https://panini.com.br/catalogsearch/result/?q=${q}`,
                  description: "Volume físico direto da editora oficial no Brasil",
                  badge: "Editora Oficial"
                },
                {
                  store: "Editora JBC",
                  emoji: "📚",
                  color: "bg-indigo-50 border-indigo-400 hover:bg-indigo-100",
                  badgeColor: "bg-indigo-500 text-white",
                  url: `https://editorajbc.com.br/?s=${q}`,
                  description: "Catálogo oficial JBC — mangás, light novels e HQs",
                  badge: "Editora Oficial"
                },
              ];

              return (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Official Status Banner */}
                  <div className={`border-4 border-black p-4 flex items-center gap-4 ${
                    pubStatus.status === "green" ? "bg-green-50" : "bg-yellow-50"
                  }`}>
                    <span className="text-3xl leading-none select-none">
                      {pubStatus.status === "green" ? "🟢" : "🟡"}
                    </span>
                    <div>
                      <span className="font-display text-2xs text-gray-500 uppercase block">Status de Publicação no Brasil</span>
                      <span className="font-display text-xl text-black uppercase leading-tight">
                        {pubStatus.text}
                      </span>
                    </div>
                  </div>

                  {/* Support message */}
                  <div className="bg-amber-50 border-4 border-black p-5 relative overflow-hidden">
                    <div className="absolute -top-2 -right-2 w-20 h-20 opacity-5 bg-[radial-gradient(black_1px,transparent_1px)] [background-size:5px_5px] pointer-events-none" />
                    <div className="flex items-start gap-3">
                      <span className="text-2xl leading-none select-none mt-0.5">💡</span>
                      <div>
                        <h4 className="font-display text-base text-black uppercase leading-tight">Apoie os Criadores</h4>
                        <p className="font-sans font-bold text-xs text-gray-700 leading-snug mt-1">
                          Gostou da obra? Se ela estiver disponível oficialmente em sua região, considere apoiar os autores e as editoras adquirindo a edição física oficial.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Store cards */}
                  <div className="space-y-3">
                    <span className="font-display text-sm text-gray-500 uppercase block">
                      <ShoppingCart className="inline w-4 h-4 mr-1.5 mb-0.5" strokeWidth={3} />
                      Canais de Venda:
                    </span>
                    <div className="grid grid-cols-1 gap-3">
                      {buyLinks.map((link) => (
                        <a
                          key={link.store}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className={`border-4 ${link.color} p-4 flex items-center justify-between gap-4 transition-all hover:translate-x-1 group text-black select-none`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="text-2xl leading-none shrink-0 select-none">{link.emoji}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <h4 className="font-display text-xl leading-none">{link.store}</h4>
                                <span className={`${link.badgeColor} text-3xs font-display px-2 py-0.5 border-2 border-black uppercase shrink-0`}>
                                  {link.badge}
                                </span>
                              </div>
                              <p className="font-sans text-xs text-gray-500 font-bold truncate">{link.description}</p>
                            </div>
                          </div>
                          <span className="font-display text-sm text-primary flex items-center gap-1 shrink-0 group-hover:translate-x-1 transition-transform">
                            IR <ExternalLink className="w-4 h-4" strokeWidth={3} />
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
            
            {!isOnlineResult && (
              <>
                <div className="bg-white p-8 border-4 border-black rounded-xl comic-shadow">
                  <h3 className="font-display text-3xl mb-4">O que você acha?</h3>
                  <p className="font-sans font-bold text-gray-600 mb-6">Esta identificação foi precisa? Ajude-nos a melhorar nosso detetive avaliando este resultado.</p>
                  <FeedbackActions resultId={id} />
                </div>

                {dbData?.feedback && dbData.feedback.length > 0 && (
                  <div className="mt-12">
                    <h3 className="font-display text-3xl mb-6">Histórico de Correções</h3>
                    <div className="space-y-4">
                      {dbData.feedback.map(fb => (
                        <div key={fb.id} className="bg-muted p-4 border-l-4 border-black">
                          <div className="flex items-center gap-2 mb-2">
                            {fb.is_correct ? (
                              <span className="text-green-600 font-bold flex items-center gap-1">👍 Confirmado correto</span>
                            ) : (
                              <span className="text-destructive font-bold flex items-center gap-1">👎 Marcado como incorreto</span>
                            )}
                            <span className="text-gray-400 text-sm font-bold">• {new Date(fb.created_at).toLocaleDateString()}</span>
                          </div>
                          {fb.correction_text && (
                            <p className="font-sans text-gray-800">
                              <span className="font-bold">Sugestão:</span> {fb.correction_text}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

function getPublicationStatus(title: string): { status: "green" | "yellow"; text: string } {
  const t = title.toLowerCase();
  const licensed = [
    "one piece", "naruto", "boruto", "jujutsu", "demon slayer", "kimetsu", 
    "frieren", "chainsaw", "my hero academia", "boku no hero", "spy x family", 
    "kaiju", "hunter x hunter", "dragon ball", "death note", "tokyo ghoul", 
    "attack on titan", "shingeki", "berserk", "haikyu", "sakamoto days", 
    "dandadan", "blue lock", "kagurabachi", "chainsaw man"
  ];
  if (licensed.some(l => t.includes(l))) {
    return { status: "green", text: "Disponível oficialmente no Brasil" };
  }
  return { status: "yellow", text: "Sem publicação oficial brasileira cadastrada" };
}
