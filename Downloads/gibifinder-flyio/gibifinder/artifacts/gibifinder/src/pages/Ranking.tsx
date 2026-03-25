import React from "react";
import { Layout } from "@/components/Layout";
import { useGetRanking } from "@workspace/api-client-react";
import { Trophy, Medal, Crown, Star, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

export default function Ranking() {
  const { data, isLoading } = useGetRanking();

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0: return <Crown className="w-8 h-8 text-yellow" />;
      case 1: return <Medal className="w-8 h-8 text-gray-300" />;
      case 2: return <Medal className="w-8 h-8 text-amber-700" />;
      default: return <Star className="w-6 h-6 text-dark/30" />;
    }
  };

  const getRankColor = (index: number) => {
    switch (index) {
      case 0: return "bg-yellow";
      case 1: return "bg-gray-200";
      case 2: return "bg-amber-100";
      default: return "bg-white";
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8">
        
        <div className="text-center space-y-4 mb-12">
          <Trophy className="w-24 h-24 mx-auto text-yellow fill-yellow drop-shadow-[4px_4px_0px_#0a0a0a]" />
          <h1 className="font-display text-5xl md:text-7xl text-white drop-shadow-[4px_4px_0px_#06D6A0]">
            TOP 10 DA SEMANA
          </h1>
          {data && (
            <p className="font-bold text-xl bg-white inline-block px-4 py-2 border-4 border-dark shadow-[4px_4px_0px_#0a0a0a] transform rotate-2">
              {new Date(data.weekStart).toLocaleDateString()} - {new Date(data.weekEnd).toLocaleDateString()}
            </p>
          )}
        </div>

        {isLoading && (
          <div className="flex justify-center p-12 bg-white comic-panel">
            <Loader2 className="w-12 h-12 animate-spin text-dark" strokeWidth={3} />
          </div>
        )}

        {!isLoading && data && (
          <div className="space-y-6 relative">
             {/* Decorative comic line behind list */}
            <div className="absolute top-0 bottom-0 left-8 md:left-12 w-2 bg-dark -z-10"></div>
            
            {data.items.map((item, index) => (
              <div 
                key={item.id} 
                className={cn(
                  "comic-panel flex flex-col md:flex-row items-center gap-6 p-4 md:p-6 transition-transform hover:-translate-y-1 hover:shadow-[8px_8px_0px_0px_#0a0a0a]",
                  getRankColor(index)
                )}
              >
                {/* Rank Badge */}
                <div className="flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-full border-4 border-dark bg-white flex items-center justify-center shadow-[4px_4px_0px_0px_#0a0a0a] z-10 relative">
                  <div className="absolute -top-3 -right-3 rotate-12 bg-dark p-1 border-2 border-white rounded-full">
                    {getRankIcon(index)}
                  </div>
                  <span className="font-display text-4xl">{index + 1}</span>
                </div>

                {/* Thumbnail */}
                <div className="w-full md:w-32 aspect-[2/3] border-4 border-dark overflow-hidden bg-dark flex-shrink-0">
                   {item.imageThumbnail ? (
                      <img src={`data:image/jpeg;base64,${item.imageThumbnail}`} alt={item.titulo} className="w-full h-full object-cover" />
                   ) : (
                     <div className="w-full h-full bg-paper flex items-center justify-center">?</div>
                   )}
                </div>

                {/* Details */}
                <div className="flex-1 text-center md:text-left">
                  <h2 className="font-display text-3xl md:text-4xl leading-none mb-2">{item.titulo}</h2>
                  <p className="font-bold text-red uppercase text-xl mb-4">{item.editora}</p>
                  
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                     <span className="comic-badge bg-white">
                        {item.searchCount} BUSCAS
                     </span>
                     {item.averageRating !== undefined && (
                        <span className="comic-badge bg-cyan/20">
                          {Math.round(item.averageRating * 100)}% APROVAÇÃO
                        </span>
                     )}
                  </div>
                </div>

                {/* Action */}
                <div className="flex-shrink-0 w-full md:w-auto">
                   <Link href={`/gibi/${item.id}`} className="comic-button block text-center bg-white px-6 py-3 w-full">
                     VER MAIS
                   </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
