import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useGetResult } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/Layout";
import { ComicCard } from "@/components/results/ComicCard";
import { FeedbackActions } from "@/components/results/FeedbackActions";
import { MangaDexReader } from "@/components/results/MangaDexReader";
import { Link2, AlertCircle, Loader2, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ResultDetail() {
  const [, params] = useRoute("/gibi/:id");
  const id = params?.id || "";
  const { toast } = useToast();

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
          coverUrl: resultData?.coverUrl || resultData?.images?.[0] || initialCoverUrl || undefined,
          description: resultData?.sinopse || resultData?.descricao || initialDescription || "",
          timestamp: Date.now()
        });
        setIsFavorited(true);
        toast({
          title: "Adicionado aos favoritos!",
          description: "O gibi foi salvo na sua coleção.",
        });
      }
      localStorage.setItem("gibi-finder:favorites", JSON.stringify(newFavorites));
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
        images: onlineDetails?.coverUrl ? [onlineDetails.coverUrl] : (initialCoverUrl ? [initialCoverUrl] : ["https://images.unsplash.com/photo-1608889175123-8ec330b86f84?w=256&fit=crop"])
      }
    : dbData?.result;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto pb-16">
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

            <ComicCard result={resultData as any} isMain />
            
            <MangaDexReader 
              mangaTitle={(resultData as any).revista || (resultData as any).titulo || ""} 
              coverUrl={(resultData as any).coverUrl || (resultData as any).images?.[0]} 
            />
            
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
