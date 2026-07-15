import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { BookOpen, Trash2, Compass, Clock, BookOpenCheck } from "lucide-react";
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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Colecao() {
  const [, setLocation] = useLocation();
  const [shelfItems, setShelfItems] = useState<ReadingProgress[]>([]);
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
      // Sort by timestamp descending (most recent first)
      items.sort((a, b) => b.timestamp - a.timestamp);
      setShelfItems(items);
    } catch (err) {
      console.error("Error reading progress shelf:", err);
    }
  };

  useEffect(() => {
    loadShelf();
  }, []);

  const handleResume = (item: ReadingProgress) => {
    // Redirect to detail page with resume parameter
    const url = `/gibi/online?providerId=${item.providerId}&id=${encodeURIComponent(item.gibiId)}&title=${encodeURIComponent(item.title)}&coverUrl=${encodeURIComponent(item.coverUrl || "")}&resume=true`;
    setLocation(url);
  };

  const handleRemove = (item: ReadingProgress, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const progressKey = "gibi-finder:progress";
      const allProgress = JSON.parse(localStorage.getItem(progressKey) || "{}");
      
      // Find the key to delete
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
            Acompanhe as leituras que você já iniciou e continue de onde parou.
          </p>
        </div>

        {shelfItems.length === 0 ? (
          /* Empty bookshelf state */
          <div className="py-20 text-center border-4 border-dashed border-black bg-white rounded-xl max-w-lg mx-auto p-8 comic-shadow">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="font-display text-2xl mb-2 uppercase">Estante Vazia</h3>
            <p className="font-sans font-bold text-gray-500 mb-6">
              Você ainda não iniciou a leitura de nenhuma obra. Visite o catálogo ou faça uma busca rápida!
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => setLocation("/")}
                className="bg-primary text-white font-display text-sm px-6 py-3 border-4 border-black rounded-lg hover:bg-yellow-500 hover:text-black transition-colors"
              >
                IR PARA BUSCA
              </button>
              <button
                onClick={() => setLocation("/explorar")}
                className="bg-secondary text-black font-display text-sm px-6 py-3 border-4 border-black rounded-lg hover:bg-yellow-300 transition-colors"
              >
                EXPLORAR CATÁLOGO
              </button>
            </div>
          </div>
        ) : (
          /* Shelf grid list */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {shelfItems.map((item) => (
              <div
                key={`${item.providerId}-${item.gibiId}`}
                onClick={() => handleResume(item)}
                className="group cursor-pointer bg-white border-4 border-black rounded-xl overflow-hidden flex flex-col justify-between hover:translate-y-[-6px] transition-all duration-200 comic-shadow hover:shadow-[8px_8px_0_rgba(0,0,0,1)] hover:bg-yellow-50"
              >
                <div className="relative aspect-[3/4] border-b-4 border-black bg-zinc-950 overflow-hidden shrink-0">
                  {item.coverUrl && !brokenImages[`${item.providerId}-${item.gibiId}`] ? (
                    <img 
                      src={item.coverUrl} 
                      alt={item.title} 
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                      onError={() => setBrokenImages(prev => ({ ...prev, [`${item.providerId}-${item.gibiId}`]: true }))}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-display text-5xl text-white/20 select-none bg-gradient-to-br from-zinc-900 to-zinc-950">
                      {item.title.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Provider label badge */}
                  <span className="absolute top-2 left-2 bg-secondary border border-black text-black text-3xs font-display px-1.5 py-0.5 rounded">
                    {item.providerId.toUpperCase()}
                  </span>

                  {/* Remove button */}
                  <button
                    onClick={(e) => handleRemove(item, e)}
                    className="absolute top-2 right-2 p-1.5 bg-red-600 border border-black rounded hover:bg-red-700 text-white transition-colors"
                    title="Remover da Estante"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between min-w-0">
                  <div>
                    <h4 className="font-display text-lg text-black leading-tight group-hover:text-primary transition-colors line-clamp-2">
                      {item.title}
                    </h4>
                    
                    {/* Read progress tags */}
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
            ))}
          </div>
        )}

      </div>
    </Layout>
  );
}
