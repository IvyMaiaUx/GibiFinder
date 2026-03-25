import { Link } from "wouter";
import { ExternalLink, Star } from "lucide-react";
import type { ComicResult } from "@workspace/api-client-react/src/generated/api.schemas";
import { cn } from "@/lib/utils";

interface ComicCardProps {
  result: ComicResult;
  isMain?: boolean;
}

export function ComicCard({ result, isMain = false }: ComicCardProps) {
  const imageUrl = result.images?.[0] || `${import.meta.env.BASE_URL}images/comic-placeholder.png`;
  const confianca = result.confianca ? Math.round(result.confianca) : 0;

  return (
    <div className={cn(
      "bg-white flex flex-col sm:flex-row overflow-hidden",
      isMain ? "comic-border comic-shadow" : "border-4 border-black rounded-xl"
    )}>
      {/* Cover Image Area */}
      <div className={cn(
        "bg-muted relative border-b-4 sm:border-b-0 sm:border-r-4 border-black shrink-0",
        isMain ? "w-full sm:w-64 md:w-80 h-80 sm:h-auto" : "w-full sm:w-40 h-48 sm:h-auto"
      )}>
        <img 
          src={imageUrl} 
          alt={result.titulo || "Capa do Gibi"} 
          className="w-full h-full object-cover"
        />
        
        {isMain && (
          <div className="absolute top-4 left-[-10px] bg-primary text-white font-display text-xl px-4 py-1 border-4 border-black transform -rotate-6 shadow-[4px_4px_0_rgba(0,0,0,1)]">
            RESULTADO PRINCIPAL
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className={cn("flex flex-col flex-1", isMain ? "p-6 md:p-8" : "p-4")}>
        <div className="flex-1">
          {/* Header */}
          <div className="flex justify-between items-start gap-4 mb-4">
            <div>
              <h3 className={cn(
                "font-display tracking-wider text-black leading-tight",
                isMain ? "text-4xl mb-2" : "text-2xl mb-1"
              )}>
                {result.titulo || result.revista || "Gibi Desconhecido"}
              </h3>
              <p className="font-sans font-bold text-gray-600 text-lg uppercase tracking-wide">
                {result.editora} {result.ano ? `• ${result.ano}` : ""}
              </p>
            </div>
            
            {/* Confidence Badge */}
            {isMain && (
              <div className="hidden sm:flex flex-col items-center bg-secondary p-3 border-4 border-black rounded-xl shrink-0 comic-shadow-sm transform rotate-3">
                <Star className="w-8 h-8 text-black fill-black mb-1" />
                <span className="font-display text-2xl leading-none">{confianca}%</span>
                <span className="font-sans font-extrabold text-xs uppercase">Certeza</span>
              </div>
            )}
          </div>

          {/* Details Grid */}
          <div className={cn(
            "grid gap-x-6 gap-y-3 font-sans",
            isMain ? "grid-cols-1 md:grid-cols-2 mt-6" : "grid-cols-1 mt-4"
          )}>
            {result.revista && (
              <div>
                <span className="text-gray-500 font-bold text-sm uppercase">Revista</span>
                <p className="font-bold text-black">{result.revista}</p>
              </div>
            )}
            
            {result.pagina && (
              <div>
                <span className="text-gray-500 font-bold text-sm uppercase">Página</span>
                <p className="font-bold text-black">{result.pagina}</p>
              </div>
            )}

            {result.personagens && result.personagens.length > 0 && (
              <div className={cn(isMain && "md:col-span-2")}>
                <span className="text-gray-500 font-bold text-sm uppercase">Personagens</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {result.personagens.map((p, i) => (
                    <span key={i} className="bg-muted px-2 py-1 text-sm font-bold border-2 border-black rounded-md">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {isMain && result.descricao && (
              <div className="md:col-span-2 mt-2">
                <span className="text-gray-500 font-bold text-sm uppercase">Descrição</span>
                <p className="font-medium text-gray-800 border-l-4 border-secondary pl-4 mt-1">
                  {result.descricao}
                </p>
              </div>
            )}

          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t-4 border-dashed border-gray-200 flex justify-end">
          <Link 
            href={`/gibi/${result.id}`}
            className="flex items-center gap-2 font-display text-xl text-primary hover:text-black transition-colors"
          >
            PÁGINA PÚBLICA
            <ExternalLink className="w-5 h-5" strokeWidth={3} />
          </Link>
        </div>
      </div>
    </div>
  );
}
