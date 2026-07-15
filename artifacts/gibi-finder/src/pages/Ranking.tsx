import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Trophy, Flame, Loader2, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

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

export default function Ranking() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<UnifiedCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const loadRanking = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/providers/catalog?listType=popular`);
      if (!res.ok) throw new Error();
      const data = await res.json() as UnifiedCatalogItem[];
      // Keep only top 10 for ranking
      setItems(data.slice(0, 10));
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar o ranking. Tente novamente mais tarde.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRanking();
  }, []);

  const handleOpenItem = (item: UnifiedCatalogItem) => {
    if (!item.sources || item.sources.length === 0) return;
    const src = item.sources[0];
    const url = `/gibi/online?providerId=${src.providerId}&id=${encodeURIComponent(src.id)}&title=${encodeURIComponent(item.title)}&coverUrl=${encodeURIComponent(item.coverUrl || "")}&description=${encodeURIComponent(item.description || "")}`;
    setLocation(url);
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto pb-16 select-none">
        
        {/* Banner Title */}
        <div className="text-center mb-12">
          <div className="inline-block relative">
            <Trophy className="absolute -top-6 -left-8 w-12 h-12 text-secondary fill-secondary transform -rotate-12 drop-shadow-[2px_2px_0_black]" strokeWidth={2} />
            <h1 className="font-display text-5xl md:text-6xl text-black bg-white px-8 py-3 border-4 border-black comic-shadow inline-block">
              TOP 10 POPULARES
            </h1>
            <Flame className="absolute -bottom-4 -right-6 w-10 h-10 text-primary fill-primary transform rotate-12 drop-shadow-[2px_2px_0_black]" strokeWidth={2} />
          </div>
          <p className="font-sans font-bold text-gray-500 mt-4 text-sm uppercase">
            As obras mais populares e acessadas em tempo real nos nossos agregadores.
          </p>
        </div>

        {loading ? (
          <div className="py-24 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <h3 className="font-display text-2xl">APURANDO LEADERBOARD GLOBAL...</h3>
          </div>
        ) : error ? (
          <div className="bg-destructive/10 border-4 border-black p-8 rounded-xl text-center max-w-lg mx-auto">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h3 className="font-display text-2xl text-black mb-2">ERRO AO CARREGAR</h3>
            <p className="font-sans font-bold text-gray-700">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white border-4 border-dashed border-black p-16 rounded-xl text-center">
            <p className="font-display text-3xl text-gray-500">NENHUM DADO DE POPULARIDADE DISPONÍVEL</p>
            <p className="font-sans font-bold text-gray-400 mt-2">Certifique-se de ativar os provedores no admin.</p>
          </div>
        ) : (
          /* Leaderboard list */
          <div className="space-y-6">
            {items.map((item, index) => {
              const rank = index + 1;
              const imgKey = `rank-${item.id}`;
              const providersString = item.sources.map(s => s.providerId.toUpperCase()).join(", ");
              
              // Colors for the rank badges
              const rankColor = rank === 1 ? '#F4D03F' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : '#F25C54';
              
              return (
                <div 
                  key={item.id}
                  onClick={() => handleOpenItem(item)}
                  className="cursor-pointer bg-white border-4 border-black rounded-xl overflow-hidden comic-shadow hover:shadow-[8px_8px_0_rgba(0,0,0,1)] hover:translate-y-[-4px] transition-all duration-200 flex items-center p-4 gap-3 sm:gap-6"
                >
                  {/* Rank Badge */}
                  <div className="w-12 sm:w-16 md:w-20 shrink-0 flex justify-center">
                    <span className="font-display text-3xl sm:text-5xl md:text-6xl" style={{
                      color: rankColor,
                      WebkitTextStroke: '2px black',
                      textShadow: '3px 3px 0px black'
                    }}>
                      #{rank}
                    </span>
                  </div>

                  {/* Thumbnail Cover */}
                  <div className="w-14 h-20 sm:w-20 sm:h-28 bg-zinc-950 border-4 border-black shrink-0 relative overflow-hidden rounded-md">
                    {item.coverUrl && !brokenImages[imgKey] ? (
                      <img 
                        src={item.coverUrl} 
                        alt={item.title} 
                        className="w-full h-full object-cover"
                        onError={() => setBrokenImages(prev => ({ ...prev, [imgKey]: true }))}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-display text-3xl text-white/20 select-none bg-gradient-to-br from-zinc-900 to-zinc-950">
                        {item.title.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Info Details */}
                  <div className="flex-1 min-w-0">
                    <span className="font-sans font-extrabold text-3xs bg-primary text-white border border-black px-2 py-0.5 rounded uppercase tracking-wider">
                      {providersString}
                    </span>
                    <h3 className="font-display text-lg sm:text-2xl md:text-3xl leading-tight truncate mt-1 group-hover:text-primary transition-colors">
                      {item.title}
                    </h3>
                    <p className="font-sans text-xs text-gray-500 font-bold line-clamp-1 mt-1">
                      {item.description || "Sem sinopse disponível."}
                    </p>
                  </div>

                  {/* Action Badge */}
                  <div className="hidden sm:block shrink-0 pr-2">
                    <span className="font-display text-xs text-primary group-hover:translate-x-1 transition-transform uppercase">
                      LER OBRA →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </Layout>
  );
}
