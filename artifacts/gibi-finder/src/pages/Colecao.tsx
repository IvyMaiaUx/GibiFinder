import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { BookOpen, Trash2, Compass, Clock, BookOpenCheck, Star } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

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
  const [activeTab, setActiveTab] = useState<"progress" | "favorites">("progress");
  const [shelfItems, setShelfItems] = useState<ReadingProgress[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

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
      setShelfItems(items);
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

  useEffect(() => {
    loadShelf();
    loadFavorites();
  }, []);

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
      
      const keyToDelete = Object.keys(allProgress).find(
        k => k === item.gibiId || allProgress[k].mangaId === item.gibiId || allProgress[k].title === item.title
      );
      
      if (keyToDelete) {
        delete allProgress[keyToDelete];
        localStorage.setItem(progressKey, JSON.stringify(allProgress));
      }
      loadShelf();
    } catch (err) {
      console.error("Error removing from shelf:", err);
    }
  };

  const handleRemoveFavorite = (item: FavoriteItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const favorites = JSON.parse(localStorage.getItem("gibi-finder:favorites") || "[]") as FavoriteItem[];
      const filtered = favorites.filter(f => !(f.mangaId === item.mangaId && f.providerId === item.providerId));
      localStorage.setItem("gibi-finder:favorites", JSON.stringify(filtered));
      loadFavorites();
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
              "flex-1 py-4 font-display text-xl sm:text-2xl transition-all flex items-center justify-center gap-2 border-r-4 border-black",
              activeTab === "progress"
                ? "bg-primary text-white"
                : "bg-white text-gray-500 hover:bg-muted/30 hover:text-black"
            )}
          >
            <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={3} />
            LENDO ({shelfItems.length})
          </button>
          <button
            onClick={() => setActiveTab("favorites")}
            className={cn(
              "flex-1 py-4 font-display text-xl sm:text-2xl transition-all flex items-center justify-center gap-2",
              activeTab === "favorites"
                ? "bg-secondary text-black"
                : "bg-white text-gray-500 hover:bg-muted/30 hover:text-black"
            )}
          >
            <Star className="w-5 h-5 sm:w-6 sm:h-6 fill-current" strokeWidth={3} />
            FAVORITOS ({favoriteItems.length})
          </button>
        </div>

        {activeTab === "progress" ? (
          /* Reading progress tab content */
          shelfItems.length === 0 ? (
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
              {shelfItems.map((item) => {
                const imgKey = `${item.providerId}-${item.gibiId}`;
                return (
                  <div
                    key={imgKey}
                    onClick={() => handleResume(item)}
                    className="group cursor-pointer bg-white border-4 border-black rounded-xl overflow-hidden flex flex-col justify-between hover:translate-y-[-6px] transition-all duration-200 comic-shadow hover:shadow-[8px_8px_0_rgba(0,0,0,1)] hover:bg-yellow-50"
                  >
                    <div className="relative aspect-[3/4] border-b-4 border-black bg-zinc-950 overflow-hidden shrink-0">
                      {item.coverUrl && !brokenImages[imgKey] ? (
                        <img 
                          src={item.coverUrl} 
                          alt={item.title} 
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenImages(prev => ({ ...prev, [imgKey]: true }))}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-display text-5xl text-white/20 select-none bg-gradient-to-br from-zinc-900 to-zinc-950">
                          {item.title.charAt(0).toUpperCase()}
                        </div>
                      )}

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
        ) : (
          /* Favorites list tab content */
          favoriteItems.length === 0 ? (
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
              {favoriteItems.map((item) => {
                const imgKey = `fav-${item.providerId}-${item.mangaId}`;
                return (
                  <div
                    key={imgKey}
                    onClick={() => handleOpenFavorite(item)}
                    className="group cursor-pointer bg-white border-4 border-black rounded-xl overflow-hidden flex flex-col justify-between hover:translate-y-[-6px] transition-all duration-200 comic-shadow hover:shadow-[8px_8px_0_rgba(0,0,0,1)] hover:bg-yellow-50"
                  >
                    <div className="relative aspect-[3/4] border-b-4 border-black bg-zinc-950 overflow-hidden shrink-0">
                      {item.coverUrl && !brokenImages[imgKey] ? (
                        <img 
                          src={item.coverUrl} 
                          alt={item.title} 
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenImages(prev => ({ ...prev, [imgKey]: true }))}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-display text-5xl text-white/20 select-none bg-gradient-to-br from-zinc-900 to-zinc-950">
                          {item.title.charAt(0).toUpperCase()}
                        </div>
                      )}

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
