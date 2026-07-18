import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { BookOpen, Trash2, Compass, Clock, BookOpenCheck, Star, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";
import { cn, isAdultProviderId } from "@/lib/utils";
import { SafeImage } from "@/components/ui/SafeImage";
import { useAuth } from "@/hooks/use-auth";
import { getLocalCompleted, saveLocalCompleted, getSyncedReadingHistory, getSyncedCompleted, removeCompletedRemote, removeReadingByManga, type CompletedReadingItem } from "@/lib/user-history";
import { getSyncedFavorites } from "@/lib/favorites";

interface ReadingProgress {
  providerId: string;
  gibiId: string;
  title: string;
  coverUrl?: string;
  chapterId: string;
  chapterNum: string;
  pageIndex: number;
  timestamp: number;
}

interface FavoriteItem {
  providerId: string;
  mangaId: string;
  title: string;
  coverUrl?: string;
  description?: string;
  timestamp: number;
}

export default function Colecao() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"progress" | "favorites" | "completed">("progress");
  const [shelfItems, setShelfItems] = useState<ReadingProgress[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);
  const [completedItems, setCompletedItems] = useState<CompletedReadingItem[]>([]);
  const [isNsfw, setIsNsfw] = useState(() => document.documentElement.classList.contains("nsfw"));

  useEffect(() => {
    const onNsfw = () => setIsNsfw(document.documentElement.classList.contains("nsfw"));
    window.addEventListener("nsfw-change", onNsfw);
    return () => window.removeEventListener("nsfw-change", onNsfw);
  }, []);

  // Load reading progress list from "gibi-finder:progress"
  const loadShelf = () => {
    const items: ReadingProgress[] = [];
    try {
      const progressKey = "gibi-finder:progress";
      const allProgress = JSON.parse(localStorage.getItem(progressKey) || "{}");
      
      for (const [key, data] of Object.entries(allProgress)) {
        const item = data as any;
        if (item) {
          items.push({
            providerId: item.providerId || "mangadex",
            gibiId: item.mangaId || key,
            title: item.title || key,
            coverUrl: item.coverUrl,
            chapterId: item.chapterId,
            chapterNum: item.chapterNum,
            pageIndex: (item.pageNumber || 1) - 1,
            timestamp: item.updatedAt ? new Date(item.updatedAt).getTime() : 0
          });
        }
      }
      items.sort((a, b) => b.timestamp - a.timestamp);
      // Dedupe by title (local save and account sync can key the same manga
      // differently), keeping the most recent entry.
      const seen = new Set<string>();
      const deduped = items.filter(it => {
        const k = (it.title || `${it.providerId}-${it.gibiId}`).toLowerCase().trim();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      setShelfItems(deduped);
    } catch (err) {
      console.error("Error reading progress shelf:", err);
    }
  };

  // Load favorites list from "gibi-finder:favorites"
  const loadFavorites = () => {
    try {
      const items = JSON.parse(localStorage.getItem("gibi-finder:favorites") || "[]") as FavoriteItem[];
      items.sort((a, b) => b.timestamp - a.timestamp);
      setFavoriteItems(items);
    } catch (err) {
      console.error("Error reading favorites:", err);
    }
  };

  const loadCompleted = () => {
    try {
      const items = getLocalCompleted();
      items.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
      setCompletedItems(items);
    } catch (err) {
      console.error("Error reading completed shelf:", err);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // When logged in, pull progress + favorites from the account first so the
      // shelf reflects the account (cross-device), not just this browser.
      if (user?.id) {
        await Promise.all([
          getSyncedReadingHistory(user.id).catch(() => {}),
          getSyncedFavorites(user.id).catch(() => {}),
          getSyncedCompleted(user.id).catch(() => {}),
        ]);
      }
      if (cancelled) return;
      loadShelf();
      loadFavorites();
      loadCompleted();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleResume = (item: ReadingProgress) => {
    const url = `/gibi/online?providerId=${item.providerId}&id=${encodeURIComponent(item.gibiId)}&title=${encodeURIComponent(item.title)}&coverUrl=${encodeURIComponent(item.coverUrl || "")}&resume=true`;
    setLocation(url);
  };

  const handleOpenFavorite = (item: FavoriteItem) => {
    const url = item.providerId === "local"
      ? `/gibi/${item.mangaId}`
      : `/gibi/online?providerId=${item.providerId}&id=${encodeURIComponent(item.mangaId)}&title=${encodeURIComponent(item.title)}&coverUrl=${encodeURIComponent(item.coverUrl || "")}`;
    setLocation(url);
  };

  const handleRemove = (item: ReadingProgress, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const progressKey = "gibi-finder:progress";
      const allProgress = JSON.parse(localStorage.getItem(progressKey) || "{}");

      // Remove EVERY local key for this manga (local save and account sync can
      // store it under different keys).
      for (const k of Object.keys(allProgress)) {
        const p = allProgress[k] || {};
        if (k === item.gibiId || p.mangaId === item.gibiId || (p.title && p.title === item.title)) {
          delete allProgress[k];
        }
      }
      localStorage.setItem(progressKey, JSON.stringify(allProgress));

      // Remove from the account too, so the next sync doesn't bring it back.
      removeReadingByManga(item.providerId, item.gibiId, user?.id);
      loadShelf();
    } catch (err) {
      console.error("Error removing from shelf:", err);
    }
  };

  const handleOpenCompleted = (item: CompletedReadingItem) => {
    const url = `/gibi/online?providerId=${item.providerId}&id=${encodeURIComponent(item.mangaId)}&title=${encodeURIComponent(item.title)}&coverUrl=${encodeURIComponent(item.coverUrl || "")}&resume=true`;
    setLocation(url);
  };

  const handleRemoveCompleted = (item: CompletedReadingItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const filtered = getLocalCompleted().filter(
        entry => !(entry.mangaId === item.mangaId && entry.providerId === item.providerId && entry.chapterId === item.chapterId)
      );
      saveLocalCompleted(filtered);
      removeCompletedRemote(item, user?.id);
      loadCompleted();
    } catch (err) {
      console.error("Error removing from completed shelf:", err);
    }
  };

  const handleRemoveFavorite = (item: FavoriteItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const favorites = JSON.parse(localStorage.getItem("gibi-finder:favorites") || "[]") as FavoriteItem[];
      const filtered = favorites.filter(f => !(f.mangaId === item.mangaId && f.providerId === item.providerId));
       localStorage.setItem("gibi-finder:favorites", JSON.stringify(filtered));
      loadFavorites();

      if (user) {
        const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
        fetch(`${BASE}/api/auth/favorites/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, favorites: filtered })
        }).catch(err => console.error("Error syncing favorites after deletion:", err));
      }
    } catch (err) {
      console.error("Error removing favorite:", err);
    }
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // +18 items stay hidden unless the +18 mode is active (and vice-versa).
  const visibleShelf = shelfItems.filter(i => isAdultProviderId(i.providerId) === isNsfw);
  const visibleCompleted = completedItems.filter(i => isAdultProviderId(i.providerId) === isNsfw);
  const visibleFavorites = favoriteItems.filter(i => isAdultProviderId(i.providerId) === isNsfw);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-16 select-none">
        
        {/* Banner header */}
        <div className="bg-primary text-white border-4 border-black p-6 rounded-xl comic-shadow relative overflow-hidden transform -rotate-1">
          <div className="absolute top-0 right-0 w-24 h-24 opacity-10 bg-[radial-gradient(white_1px,transparent_1px)] [background-size:6px_6px] pointer-events-none" />
          <h2 className="font-display text-4xl tracking-wider uppercase drop-shadow-[2px_2px_0_black] flex items-center gap-2">
            <BookOpenCheck className="w-9 h-9 text-secondary drop-shadow-[1px_1px_0_black]" strokeWidth={3} />
            Minha Coleção / Estante
          </h2>
          <p className="font-sans font-extrabold text-sm uppercase mt-2 text-white/90">
            Acompanhe suas leituras e seus títulos favoritos em um só lugar.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex border-4 border-black bg-white rounded-xl overflow-hidden comic-shadow-sm">
          <button
            onClick={() => setActiveTab("progress")}
            className={cn(
              "flex-1 py-4 font-display text-lg sm:text-xl transition-all flex items-center justify-center gap-2 border-r-4 border-black",
              activeTab === "progress"
                ? "bg-primary text-white"
                : "bg-white text-gray-500 hover:bg-muted/30 hover:text-black"
            )}
          >
            <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={3} />
            LENDO ({visibleShelf.length})
          </button>
          <button
            onClick={() => setActiveTab("completed")}
            className={cn(
              "flex-1 py-4 font-display text-lg sm:text-xl transition-all flex items-center justify-center gap-2 border-r-4 border-black",
              activeTab === "completed"
                ? "bg-emerald-600 text-white"
                : "bg-white text-gray-500 hover:bg-muted/30 hover:text-black"
            )}
          >
            <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={3} />
            JÁ LIDOS ({visibleCompleted.length})
          </button>
          <button
            onClick={() => setActiveTab("favorites")}
            className={cn(
              "flex-1 py-4 font-display text-lg sm:text-xl transition-all flex items-center justify-center gap-2",
              activeTab === "favorites"
                ? "bg-secondary text-black"
                : "bg-white text-gray-500 hover:bg-muted/30 hover:text-black"
            )}
          >
            <Star className="w-5 h-5 sm:w-6 sm:h-6 fill-current" strokeWidth={3} />
            FAVORITOS ({visibleFavorites.length})
          </button>
        </div>

        {activeTab === "progress" ? (
          /* Reading progress tab content */
          visibleShelf.length === 0 ? (
            <div className="py-20 text-center border-4 border-dashed border-black bg-white rounded-xl max-w-lg mx-auto p-8 comic-shadow">
              <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="font-display text-2xl mb-2 uppercase">Nenhuma Leitura Iniciada</h3>
              <p className="font-sans font-bold text-gray-500 mb-6">
                Você ainda não começou a ler nenhuma obra. Visite o catálogo ou faça uma busca rápida!
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button onClick={() => setLocation("/")} className="bg-primary text-white font-display text-sm px-6 py-3 border-4 border-black rounded-lg hover:bg-yellow-500 hover:text-black transition-colors">
                  IR PARA BUSCA
                </button>
                <button onClick={() => setLocation("/explorar")} className="bg-secondary text-black font-display text-sm px-6 py-3 border-4 border-black rounded-lg hover:bg-yellow-300 transition-colors">
                  EXPLORAR CATÁLOGO
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {visibleShelf.map((item) => {
                const imgKey = `${item.providerId}-${item.gibiId}`;
                return (
                  <div
                    key={imgKey}
                    onClick={() => handleResume(item)}
                    className="group cursor-pointer bg-white border-4 border-black rounded-xl overflow-hidden flex flex-col justify-between hover:translate-y-[-6px] transition-all duration-200 comic-shadow hover:shadow-[8px_8px_0_rgba(0,0,0,1)] hover:bg-yellow-50"
                  >
                    <div className="relative aspect-[3/4] border-b-4 border-black bg-zinc-950 overflow-hidden shrink-0">
                      <SafeImage
                        src={item.coverUrl}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                      />

                      <span className="absolute top-2 left-2 bg-secondary border border-black text-black text-3xs font-display px-1.5 py-0.5 rounded">
                        {item.providerId.toUpperCase()}
                      </span>

                      <button
                        onClick={(e) => handleRemove(item, e)}
                        className="absolute top-2 right-2 p-1.5 bg-red-600 border border-black rounded hover:bg-red-700 text-white transition-colors"
                        title="Remover da Estante"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between min-w-0 bg-white">
                      <div>
                        <h4 className="font-display text-base sm:text-lg text-black leading-tight group-hover:text-primary transition-colors line-clamp-2">
                          {item.title}
                        </h4>
                        
                        <div className="mt-3 space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 font-sans">
                            <BookOpen className="w-4 h-4 text-primary" />
                            <span>Último: Cap. {item.chapterNum}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-2xs text-gray-400 font-bold font-sans">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Lido em {formatDate(item.timestamp)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-dashed border-black/20 flex items-center justify-between">
                        <span className="font-display text-xs text-primary group-hover:translate-x-1 transition-transform">
                          CONTINUAR LENDO →
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : activeTab === "completed" ? (
          visibleCompleted.length === 0 ? (
            <div className="py-20 text-center border-4 border-dashed border-black bg-white rounded-xl max-w-lg mx-auto p-8 comic-shadow">
              <CheckCircle2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="font-display text-2xl mb-2 uppercase">Nenhum Capítulo Concluído</h3>
              <p className="font-sans font-bold text-gray-500 mb-6">
                Quando você terminar um capítulo, ele aparecerá aqui automaticamente.
              </p>
              <button onClick={() => setLocation("/")} className="bg-primary text-white font-display text-sm px-6 py-3 border-4 border-black rounded-lg hover:bg-yellow-500 hover:text-black transition-colors">
                IR PARA BUSCA
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {visibleCompleted.map((item) => {
                const imgKey = `done-${item.providerId}-${item.mangaId}-${item.chapterId}`;
                return (
                  <div
                    key={imgKey}
                    onClick={() => handleOpenCompleted(item)}
                    className="group cursor-pointer bg-white border-4 border-black rounded-xl overflow-hidden flex flex-col justify-between hover:translate-y-[-6px] transition-all duration-200 comic-shadow hover:shadow-[8px_8px_0_rgba(0,0,0,1)] hover:bg-emerald-50"
                  >
                    <div className="relative aspect-[3/4] border-b-4 border-black bg-zinc-950 overflow-hidden shrink-0">
                      <SafeImage
                        src={item.coverUrl}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                      />
                      <span className="absolute top-2 left-2 bg-emerald-500 border border-black text-white text-3xs font-display px-1.5 py-0.5 rounded">
                        LIDO
                      </span>
                      <button
                        onClick={(e) => handleRemoveCompleted(item, e)}
                        className="absolute top-2 right-2 p-1.5 bg-red-600 border border-black rounded hover:bg-red-700 text-white transition-colors"
                        title="Remover dos Já Lidos"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between min-w-0 bg-white">
                      <div>
                        <h4 className="font-display text-base sm:text-lg text-black leading-tight group-hover:text-emerald-700 transition-colors line-clamp-2">
                          {item.title}
                        </h4>
                        <div className="mt-3 space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 font-sans">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Cap. {item.chapterNum} concluído</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-2xs text-gray-400 font-bold font-sans">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatDate(new Date(item.completedAt).getTime())}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-dashed border-black/20">
                        <span className="font-display text-xs text-emerald-700 group-hover:translate-x-1 transition-transform inline-block">
                          RELER →
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Favorites list tab content */
          visibleFavorites.length === 0 ? (
            <div className="py-20 text-center border-4 border-dashed border-black bg-white rounded-xl max-w-lg mx-auto p-8 comic-shadow">
              <Star className="w-16 h-16 text-gray-300 mx-auto mb-4 animate-pulse" />
              <h3 className="font-display text-2xl mb-2 uppercase">Nenhum Favorito</h3>
              <p className="font-sans font-bold text-gray-500 mb-6">
                Você ainda não adicionou nenhum título aos favoritos. Abra qualquer obra e clique em "Favoritar"!
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button onClick={() => setLocation("/explorar")} className="bg-primary text-white font-display text-sm px-6 py-3 border-4 border-black rounded-lg hover:bg-yellow-500 hover:text-black transition-colors">
                  EXPLORAR QUADRINHOS
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {visibleFavorites.map((item) => {
                const imgKey = `fav-${item.providerId}-${item.mangaId}`;
                return (
                  <div
                    key={imgKey}
                    onClick={() => handleOpenFavorite(item)}
                    className="group cursor-pointer bg-white border-4 border-black rounded-xl overflow-hidden flex flex-col justify-between hover:translate-y-[-6px] transition-all duration-200 comic-shadow hover:shadow-[8px_8px_0_rgba(0,0,0,1)] hover:bg-yellow-50"
                  >
                    <div className="relative aspect-[3/4] border-b-4 border-black bg-zinc-950 overflow-hidden shrink-0">
                      <SafeImage
                        src={item.coverUrl}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                      />

                      <span className="absolute top-2 left-2 bg-secondary border border-black text-black text-3xs font-display px-1.5 py-0.5 rounded">
                        {item.providerId.toUpperCase()}
                      </span>

                      <button
                        onClick={(e) => handleRemoveFavorite(item, e)}
                        className="absolute top-2 right-2 p-1.5 bg-red-600 border border-black rounded hover:bg-red-700 text-white transition-colors"
                        title="Remover dos Favoritos"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between min-w-0 bg-white">
                      <div>
                        <h4 className="font-display text-base sm:text-lg text-black leading-tight group-hover:text-primary transition-colors line-clamp-2">
                          {item.title}
                        </h4>
                        <p className="font-sans text-2xs text-gray-500 font-bold line-clamp-2 mt-2">
                          {item.description || "Sem descrição disponível."}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-dashed border-black/20 flex items-center justify-between">
                        <span className="font-display text-xs text-primary group-hover:translate-x-1 transition-transform">
                          VER DETALHES →
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

      </div>
    </Layout>
  );
}
