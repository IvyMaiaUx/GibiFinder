import { useState, useCallback } from "react";
import { useGetHistory } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Link } from "wouter";
import { Search, ChevronRight, FileX, Trash2 } from "lucide-react";
import { formatComicDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const STORAGE_KEY = "gibi_admin_key";

export default function History() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [titulo, setTitulo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const adminKey = localStorage.getItem(STORAGE_KEY) || "";
  const isAdmin = !!adminKey;

  const { data, isLoading, error } = useGetHistory({
    limit: 50,
    titulo: searchQuery || undefined,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(titulo);
  };

  const handleDelete = useCallback(async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Remover esta busca do histórico?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${BASE}/api/history/${id}`, {
        method: "DELETE",
        headers: { "x-admin-key": adminKey },
      });
      if (!res.ok) throw new Error();
      await queryClient.invalidateQueries({ queryKey: ["getHistory"] });
      toast({ title: "Busca removida do histórico." });
    } catch {
      toast({ title: "Erro ao remover", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }, [adminKey, queryClient, toast]);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <h1 className="font-display text-5xl text-black bg-secondary inline-block px-6 py-2 border-4 border-black comic-shadow transform -rotate-1">
            ARQUIVOS DO DETETIVE
          </h1>

          <form onSubmit={handleSearch} className="flex max-w-sm w-full">
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Filtrar por título..."
              className="flex-1 font-sans font-bold p-3 border-y-4 border-l-4 border-black rounded-l-xl focus:outline-none"
            />
            <button
              type="submit"
              className="bg-primary text-white p-3 border-4 border-black rounded-r-xl comic-hover"
            >
              <Search strokeWidth={3} />
            </button>
          </form>
        </div>

        {isLoading ? (
          <div className="py-20 text-center">
            <div className="inline-block animate-spin font-display text-6xl text-primary">?</div>
            <p className="font-display text-2xl mt-4">BUSCANDO NOS ARQUIVOS...</p>
          </div>
        ) : error ? (
          <div className="bg-destructive/10 border-4 border-destructive p-8 rounded-xl text-center">
            <p className="font-display text-2xl text-destructive">Ocorreu um erro ao carregar o histórico.</p>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="bg-white border-4 border-dashed border-black p-16 rounded-xl text-center flex flex-col items-center">
            <FileX className="w-16 h-16 text-gray-400 mb-4" strokeWidth={2} />
            <p className="font-display text-3xl text-gray-500">NENHUM GIBI ENCONTRADO</p>
            <p className="font-sans font-bold text-gray-400 mt-2">Sua estante de buscas está vazia ou o filtro não retornou resultados.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.items.map((item) => (
              <div key={item.id} className="relative group">
                <Link
                  href={`/gibi/${item.id}`}
                  className="block bg-white border-4 border-black rounded-xl overflow-hidden comic-shadow comic-hover flex flex-col h-full"
                >
                  <div className="h-48 bg-muted relative border-b-4 border-black">
                    <img
                      src={item.images?.[0] || `${import.meta.env.BASE_URL}images/comic-placeholder.png`}
                      alt={item.titulo || "Gibi"}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 bg-white font-sans font-extrabold text-xs px-2 py-1 border-2 border-black rounded">
                      {formatComicDate(item.created_at)}
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <h3 className="font-display text-2xl leading-tight mb-1 group-hover:text-primary transition-colors">
                      {item.titulo || item.revista || "Desconhecido"}
                    </h3>
                    <p className="font-sans font-bold text-gray-500 text-sm mb-4">
                      {item.editora}
                    </p>
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex gap-2">
                        <span className="text-xs font-bold bg-green-100 text-green-800 px-2 py-1 border-2 border-green-800 rounded">
                          👍 {item.correct_count || 0}
                        </span>
                      </div>
                      <span className="text-primary font-bold flex items-center">
                        Ver <ChevronRight className="w-4 h-4 ml-1" strokeWidth={3} />
                      </span>
                    </div>
                  </div>
                </Link>

                {isAdmin && (
                  <button
                    onClick={(e) => handleDelete(e, item.id)}
                    disabled={deletingId === item.id}
                    title="Remover do histórico"
                    className="absolute top-2 left-2 z-10 bg-white border-4 border-black p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary hover:text-white disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={3} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
