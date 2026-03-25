import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Link } from "wouter";
import { Search, ChevronRight, FileX, Trash2, RotateCcw } from "lucide-react";
import { formatComicDate } from "@/lib/utils";
import { getLocalHistory, removeFromLocalHistory, clearLocalHistory, type LocalHistoryItem } from "@/hooks/use-local-history";

const TYPE_LABELS: Record<string, string> = {
  image: "📷 Imagem",
  text: "🔤 Texto",
  character: "👤 Personagem",
  quote: "💬 Fala",
};

export default function History() {
  const [items, setItems] = useState<LocalHistoryItem[]>(() => getLocalHistory());
  const [filter, setFilter] = useState("");
  const [filterInput, setFilterInput] = useState("");

  const filtered = filter
    ? items.filter(
        (i) =>
          i.titulo.toLowerCase().includes(filter.toLowerCase()) ||
          i.revista.toLowerCase().includes(filter.toLowerCase()) ||
          i.editora.toLowerCase().includes(filter.toLowerCase())
      )
    : items;

  const handleDelete = (id: string) => {
    if (!window.confirm("Remover esta busca do seu histórico?")) return;
    setItems(removeFromLocalHistory(id));
  };

  const handleClearAll = () => {
    if (!window.confirm("Limpar todo o histórico? Isso não pode ser desfeito.")) return;
    clearLocalHistory();
    setItems([]);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilter(filterInput);
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <h1 className="font-display text-5xl text-black bg-secondary inline-block px-6 py-2 border-4 border-black comic-shadow transform -rotate-1">
              ARQUIVOS DO DETETIVE
            </h1>
            <p className="font-sans font-bold text-gray-500 mt-2 text-sm">
              Histórico salvo neste navegador • {items.length} busca{items.length !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex gap-3 flex-col sm:flex-row">
            <form onSubmit={handleSearch} className="flex">
              <input
                type="text"
                value={filterInput}
                onChange={(e) => setFilterInput(e.target.value)}
                placeholder="Filtrar..."
                className="flex-1 font-sans font-bold p-3 border-y-4 border-l-4 border-black rounded-l-xl focus:outline-none min-w-0 w-40"
              />
              <button type="submit" className="bg-primary text-white p-3 border-4 border-black rounded-r-xl comic-hover">
                <Search strokeWidth={3} className="w-5 h-5" />
              </button>
            </form>

            {items.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-2 border-4 border-black px-4 py-2 font-display text-base hover:bg-red-100 transition-colors"
                title="Limpar tudo"
              >
                <RotateCcw className="w-4 h-4" strokeWidth={3} />
                LIMPAR TUDO
              </button>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="bg-white border-4 border-dashed border-black p-16 rounded-xl text-center flex flex-col items-center">
            <FileX className="w-16 h-16 text-gray-400 mb-4" strokeWidth={2} />
            <p className="font-display text-3xl text-gray-500">NENHUMA BUSCA AINDA</p>
            <p className="font-sans font-bold text-gray-400 mt-2">
              Seu histórico fica salvo só aqui neste navegador.
              <br />Faça uma busca e ela aparecerá aqui!
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border-4 border-dashed border-black p-16 rounded-xl text-center">
            <p className="font-display text-3xl text-gray-500">NENHUM RESULTADO</p>
            <p className="font-sans font-bold text-gray-400 mt-2">Nenhuma busca bate com o filtro "{filter}".</p>
            <button onClick={() => { setFilter(""); setFilterInput(""); }} className="mt-4 font-display text-primary underline">
              Limpar filtro
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((item) => (
              <div key={item.id} className="relative group">
                <Link
                  href={`/gibi/${item.id}`}
                  className="block bg-white border-4 border-black rounded-xl overflow-hidden comic-shadow comic-hover h-full flex flex-col"
                >
                  <div className="h-48 bg-muted relative border-b-4 border-black">
                    <img
                      src={item.images?.[0] || `${import.meta.env.BASE_URL}images/comic-placeholder.png`}
                      alt={item.titulo || "Gibi"}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `${import.meta.env.BASE_URL}images/comic-placeholder.png`;
                      }}
                    />
                    <div className="absolute top-2 right-2 bg-white font-sans font-extrabold text-xs px-2 py-1 border-2 border-black rounded">
                      {formatComicDate(item.created_at)}
                    </div>
                    {item.search_type && (
                      <div className="absolute bottom-2 left-2 bg-black text-white font-sans font-bold text-xs px-2 py-0.5 rounded">
                        {TYPE_LABELS[item.search_type] || item.search_type}
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <h3 className="font-display text-2xl leading-tight mb-1 group-hover:text-primary transition-colors">
                      {item.titulo || item.revista || "Desconhecido"}
                    </h3>
                    <p className="font-sans font-bold text-gray-500 text-sm">
                      {[item.editora, item.ano].filter(Boolean).join(" · ")}
                    </p>
                    <div className="mt-auto pt-4 flex items-center justify-end">
                      <span className="text-primary font-bold flex items-center">
                        Ver <ChevronRight className="w-4 h-4 ml-1" strokeWidth={3} />
                      </span>
                    </div>
                  </div>
                </Link>

                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(item.id); }}
                  title="Remover do histórico"
                  className="absolute top-2 left-2 z-10 bg-white border-4 border-black p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100"
                >
                  <Trash2 className="w-4 h-4 text-primary" strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
