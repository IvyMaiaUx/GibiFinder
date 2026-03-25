import React, { useState } from "react";
import { Layout } from "@/components/Layout";
import { ComicResultCard } from "@/components/ComicResultCard";
import { useGetHistory } from "@workspace/api-client-react";
import { Search, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import type { HistoryItem } from "@workspace/api-client-react/src/generated/api.schemas";

export default function History() {
  const [titulo, setTitulo] = useState("");
  const [editora, setEditora] = useState("");
  const [debouncedTitulo, setDebouncedTitulo] = useState("");
  const [debouncedEditora, setDebouncedEditora] = useState("");
  
  const [selectedComic, setSelectedComic] = useState<HistoryItem | null>(null);

  // Debounce effect
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTitulo(titulo);
      setDebouncedEditora(editora);
    }, 500);
    return () => clearTimeout(handler);
  }, [titulo, editora]);

  const { data, isLoading } = useGetHistory({ 
    titulo: debouncedTitulo || undefined, 
    editora: debouncedEditora || undefined,
    limit: 50
  });

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-end gap-4 mb-8 border-b-8 border-dark pb-4">
          <h1 className="font-display text-5xl md:text-7xl text-white drop-shadow-[4px_4px_0px_#E63946] -rotate-2">
            ACERVO HISTÓRICO
          </h1>
          <div className="bg-white p-2 border-4 border-dark font-bold shadow-[4px_4px_0px_0px_#0a0a0a]">
            {data?.total || 0} REGISTROS
          </div>
        </div>

        {/* Filter Bar */}
        <div className="comic-panel p-4 flex flex-col md:flex-row gap-4 bg-yellow">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3.5 text-dark/50" size={20} />
            <input 
              type="text" 
              placeholder="Filtrar por Título..." 
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full comic-input pl-10 bg-white"
            />
          </div>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3.5 text-dark/50" size={20} />
            <input 
              type="text" 
              placeholder="Filtrar por Editora..." 
              value={editora}
              onChange={(e) => setEditora(e.target.value)}
              className="w-full comic-input pl-10 bg-white"
            />
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center p-12">
            <Loader2 className="w-12 h-12 animate-spin text-dark" strokeWidth={3} />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && data?.items.length === 0 && (
          <div className="comic-panel p-12 text-center bg-white">
            <h2 className="font-display text-4xl mb-2">VAZIO!</h2>
            <p className="font-bold text-xl text-dark/60">Nenhum gibi encontrado com esses filtros.</p>
          </div>
        )}

        {/* Grid */}
        {!isLoading && data && data.items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {data.items.map((item) => (
              <ComicResultCard 
                key={item.id} 
                comic={item} 
                mini 
                onClick={() => setSelectedComic(item)}
              />
            ))}
          </div>
        )}

        {/* Expansion Dialog */}
        <Dialog open={!!selectedComic} onOpenChange={(open) => !open && setSelectedComic(null)}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden bg-transparent border-none shadow-none">
            <DialogTitle className="sr-only">Detalhes do Gibi</DialogTitle>
            {selectedComic && (
              <ComicResultCard comic={{...selectedComic, encontrado: true}} />
            )}
          </DialogContent>
        </Dialog>

      </div>
    </Layout>
  );
}
