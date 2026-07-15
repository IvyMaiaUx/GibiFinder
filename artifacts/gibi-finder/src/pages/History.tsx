import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Link, useLocation } from "wouter";
import { Search, ChevronRight, FileX, Trash2, RotateCcw, BookOpen, Clock } from "lucide-react";
import { formatComicDate, cn } from "@/lib/utils";
import { getLocalHistory, removeFromLocalHistory, clearLocalHistory, type LocalHistoryItem } from "@/hooks/use-local-history";

interface ReadingHistoryItem {
  id: string;
  title: string;
  coverUrl?: string;
  chapterId: string;
  chapterNum: string;
  chapterTitle?: string;
  providerId: string;
  mangaId: string;
  language?: string;
  pageNumber: number;
  timestamp: number;
}

const TYPE_LABELS: Record<string, string> = {
  image: "📷 Imagem",
  text: "🔤 Descrição",
  character: "👤 Personagem",
  quote: "💬 Fala",
};

export default function History() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"search" | "reading">("search");
  
  // Search history states
  const [searchItems, setSearchItems] = useState<LocalHistoryItem[]>(() => getLocalHistory());
  
  // Reading history states
  const [readingItems, setReadingItems] = useState<ReadingHistoryItem[]>([]);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const [filter, setFilter] = useState("");
  const [filterInput, setFilterInput] = useState("");

  // Load reading history
  const loadReadingHistory = () => {
    try {
      const historyKey = "gibi-finder:reading-history";
      const list = JSON.parse(localStorage.getItem(historyKey) || "[]") as ReadingHistoryItem[];
      setReadingItems(list);
    } catch (err) {
      console.error("Failed to load reading history:", err);
    }
  };

  useEffect(() => {
    loadReadingHistory();
  }, []);

  const handleSearchFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setFilter(filterInput);
  };

  // Delete search item
  const handleDeleteSearch = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Remover esta busca do seu histórico?")) return;
    setSearchItems(removeFromLocalHistory(id));
  };

  // Clear all search history
  const handleClearAllSearch = () => {
    if (!window.confirm("Limpar todo o histórico de buscas? Isso não pode ser desfeito.")) return;
    clearLocalHistory();
    setSearchItems([]);
  };

  // Delete reading history item
  const handleDeleteReading = (item: ReadingHistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Remover este item do seu histórico de leitura?")) return;
    try {
      const historyKey = "gibi-finder:reading-history";
      const list = JSON.parse(localStorage.getItem(historyKey) || "[]") as ReadingHistoryItem[];
      const updated = list.filter(i => i.id !== item.id);
      localStorage.setItem(historyKey, JSON.stringify(updated));
      setReadingItems(updated);
    } catch (err) {
      console.error(err);
    }
  };

  // Clear all reading history
  const handleClearAllReading = () => {
    if (!window.confirm("Limpar todo o histórico de leitura? Isso não pode ser desfeito.")) return;
    try {
      localStorage.removeItem("gibi-finder:reading-history");
      setReadingItems([]);
    } catch (err) {
      console.error(err);
    }
  };

  // Resume reading
  const handleResume = (item: ReadingHistoryItem) => {
    const url = `/gibi/online?providerId=${item.providerId}&id=${encodeURIComponent(item.mangaId)}&title=${encodeURIComponent(item.title)}&coverUrl=${encodeURIComponent(item.coverUrl || "")}&resume=true`;
    setLocation(url);
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // Filter lists based on input
  const filteredSearches = filter
    ? searchItems.filter(
        (i) =>
          i.titulo.toLowerCase().includes(filter.toLowerCase()) ||
          i.revista.toLowerCase().includes(filter.toLowerCase()) ||
          (i.editora && i.editora.toLowerCase().includes(filter.toLowerCase()))
      )
    : searchItems;

  const filteredReading = filter
    ? readingItems.filter(
        (i) =>
          i.title.toLowerCase().includes(filter.toLowerCase()) ||
          (i.chapterTitle && i.chapterTitle.toLowerCase().includes(filter.toLowerCase()))
      )
    : readingItems;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto pb-16">
        
        {/* Header section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <h1 className="font-display text-5xl text-black bg-secondary inline-block px-6 py-2 border-4 border-black comic-shadow transform -rotate-1">
              ARQUIVOS DO DETETIVE
            </h1>
            <p className="font-sans font-bold text-gray-500 mt-2 text-sm uppercase">
              Histórico salvo neste navegador • {activeTab === "search" ? `${searchItems.length} buscas` : `${readingItems.length} capítulos lidos`}
            </p>
          </div>

          <div className="flex gap-3 flex-col sm:flex-row items-stretch sm:items-center">
            
            {/* Search Filter input */}
            <form onSubmit={handleSearchFilter} className="flex">
              <input
                type="text"
                value={filterInput}
                onChange={(e) => setFilterInput(e.target.value)}
                placeholder="Filtrar histórico..."
                className="flex-1 font-sans font-bold p-3 border-y-4 border-l-4 border-black rounded-l-xl focus:outline-none min-w-0 w-44"
              />
              <button type="submit" className="bg-primary text-white p-3 border-4 border-black rounded-r-xl comic-hover">
                <Search strokeWidth={3} className="w-5 h-5" />
              </button>
            </form>

            {/* Clear All button */}
            {activeTab === "search" && searchItems.length > 0 && (
              <button
                onClick={handleClearAllSearch}
                className="flex items-center justify-center gap-2 border-4 border-black px-4 py-2 bg-white text-black font-display text-sm hover:bg-red-100 transition-colors"
              >
                <RotateCcw className="w-4 h-4" strokeWidth={3} />
                LIMPAR BUSCAS
              </button>
            )}

            {activeTab === "reading" && readingItems.length > 0 && (
              <button
                onClick={handleClearAllReading}
                className="flex items-center justify-center gap-2 border-4 border-black px-4 py-2 bg-white text-black font-display text-sm hover:bg-red-100 transition-colors"
              >
                <RotateCcw className="w-4 h-4" strokeWidth={3} />
                LIMPAR LEITURAS
              </button>
            )}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b-4 border-black mb-8">
          <button
            onClick={() => { setActiveTab("search"); setFilter(""); setFilterInput(""); }}
            className={cn(
              "px-6 py-2.5 font-display text-lg tracking-wider border-t-4 border-x-4 border-black rounded-t-xl transition-all mr-2 relative top-[4px] z-10",
              activeTab === "search" ? "bg-white text-black" : "bg-muted/40 text-gray-500 hover:bg-muted/70"
            )}
          >
            🔍 HISTÓRICO DE BUSCAS
          </button>
          <button
            onClick={() => { setActiveTab("reading"); setFilter(""); setFilterInput(""); }}
            className={cn(
              "px-6 py-2.5 font-display text-lg tracking-wider border-t-4 border-x-4 border-black rounded-t-xl transition-all relative top-[4px] z-10",
              activeTab === "reading" ? "bg-white text-black" : "bg-muted/40 text-gray-500 hover:bg-muted/70"
            )}
          >
            📖 HISTÓRICO DE LEITURA
          </button>
        </div>

        {/* ==================== TAB 1: SEARCH HISTORY ==================== */}
        {activeTab === "search" && (
          filteredSearches.length === 0 ? (
            <div className="bg-white border-4 border-dashed border-black p-16 rounded-xl text-center flex flex-col items-center">
              <FileX className="w-16 h-16 text-gray-400 mb-4" strokeWidth={2} />
              <p className="font-display text-3xl text-gray-500 uppercase">Nenhuma busca encontrada</p>
              <p className="font-sans font-bold text-gray-400 mt-2">
                Suas buscas ficam salvas apenas localmente neste navegador.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSearches.map((item) => (
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
                        <span className="text-primary font-bold flex items-center text-xs">
                          VER RESULTADOS <ChevronRight className="w-4 h-4 ml-1" strokeWidth={3} />
                        </span>
                      </div>
                    </div>
                  </Link>

                  <button
                    onClick={(e) => handleDeleteSearch(item.id, e)}
                    title="Remover do histórico"
                    className="absolute top-2 left-2 z-10 bg-white border-4 border-black p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100"
                  >
                    <Trash2 className="w-4 h-4 text-primary" strokeWidth={3} />
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {/* ==================== TAB 2: READING HISTORY ==================== */}
        {activeTab === "reading" && (
          filteredReading.length === 0 ? (
            <div className="bg-white border-4 border-dashed border-black p-16 rounded-xl text-center flex flex-col items-center">
              <FileX className="w-16 h-16 text-gray-400 mb-4" strokeWidth={2} />
              <p className="font-display text-3xl text-gray-500 uppercase">Nenhum capítulo lido</p>
              <p className="font-sans font-bold text-gray-400 mt-2">
                Comece a ler alguma obra pelo catálogo e ela será registrada aqui cronologicamente!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredReading.map((item) => {
                const imgKey = `hist-${item.id}`;
                return (
                  <div key={item.id} className="relative group">
                    <div
                      onClick={() => handleResume(item)}
                      className="cursor-pointer block bg-white border-4 border-black rounded-xl overflow-hidden comic-shadow comic-hover h-full flex flex-col"
                    >
                      <div className="h-48 bg-muted relative border-b-4 border-black">
                        {item.coverUrl && !brokenImages[imgKey] ? (
                          <img
                            src={item.coverUrl}
                            alt={item.title}
                            className="w-full h-full object-cover"
                            onError={() => setBrokenImages(prev => ({ ...prev, [imgKey]: true }))}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-display text-5xl text-white/20 select-none bg-gradient-to-br from-zinc-900 to-zinc-950">
                            {item.title.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="absolute top-2 right-2 bg-white font-sans font-extrabold text-2xs px-2 py-1 border border-black rounded flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          {formatDate(item.timestamp)}
                        </div>
                        {item.language && (
                          <div className="absolute bottom-2 left-2 bg-black text-white font-sans font-extrabold text-3xs px-2 py-0.5 rounded border border-black">
                            {item.language.toUpperCase() === "PT" || item.language.toUpperCase() === "PT-BR" ? "PT 🇧🇷" : "EN 🇺🇸"}
                          </div>
                        )}
                      </div>
                      
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <h3 className="font-display text-2xl leading-tight mb-1 group-hover:text-primary transition-colors line-clamp-1">
                            {item.title}
                          </h3>
                          <div className="flex items-center gap-1.5 text-sm font-bold text-gray-600 font-sans mt-2">
                            <BookOpen className="w-4 h-4 text-primary" />
                            <span className="line-clamp-1">
                              Capítulo {item.chapterNum} {item.chapterTitle ? `- ${item.chapterTitle}` : ""}
                            </span>
                          </div>
                          <p className="font-sans font-extrabold text-3xs text-gray-400 mt-1 uppercase">
                            Fonte: {item.providerId.toUpperCase()} • Pág: {item.pageNumber}
                          </p>
                        </div>

                        <div className="mt-4 pt-4 border-t border-dashed border-black/10 flex items-center justify-end">
                          <span className="text-primary font-bold flex items-center text-xs group-hover:translate-x-1 transition-transform">
                            ABRIR LEITOR <ChevronRight className="w-4 h-4 ml-1" strokeWidth={3} />
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleDeleteReading(item, e)}
                      title="Remover do histórico"
                      className="absolute top-2 left-2 z-10 bg-white border-4 border-black p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100"
                    >
                      <Trash2 className="w-4 h-4 text-primary" strokeWidth={3} />
                    </button>
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
