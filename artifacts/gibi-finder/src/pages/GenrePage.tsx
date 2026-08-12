// Explore.tsx's genre shelves ("Ação", "Aventura", ...) previously opened
// "Ver tudo" as a pure client-side state toggle — no distinct URL, so a
// genre couldn't be bookmarked, shared, or reached with the back button.
// This is that view promoted to a real route, plus the sort control the
// catalog-redesign proposal asked for (Explore's own "Ver tudo" had
// pagination already, but never a sort).
import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Loader2, AlertCircle, ChevronLeft, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { isFavorite, toggleFavorite, getFavorites } from "@/lib/favorites";
import { getLocalProgress, getLocalCompleted } from "@/lib/user-history";
import { getEmptySources, hasReadableSource } from "@/lib/empty-sources";
import { pickBestSource } from "@/lib/pick-best-source";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { CatalogCard, type CatalogItem as UnifiedCatalogItem } from "@/components/results/CatalogCard";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
// Matches Explore.tsx's own "Ver tudo" page size, for consistent pagination
// behavior between the two.
const PAGE_SIZE = 250;

type SortMode = "rating" | "recent" | "az";
const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: "rating", label: "Popular" },
  { id: "recent", label: "Recente" },
  { id: "az", label: "A–Z" },
];

const getReleaseTime = (date?: string) => {
  if (!date) return 0;
  const trimmed = String(date).trim();
  if (/^\d{4}$/.test(trimmed)) return new Date(`${trimmed}-01-01T00:00:00.000Z`).getTime();
  const time = new Date(trimmed).getTime();
  return Number.isFinite(time) ? time : 0;
};

export default function GenrePage() {
  const [, params] = useRoute("/explorar/genero/:genre");
  const genre = decodeURIComponent(params?.genre || "");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  useDocumentMeta({
    title: genre ? `${genre} — Catálogo` : "Catálogo por gênero",
    description: genre ? `Todos os títulos de ${genre} no catálogo do Gibi Finder.` : undefined,
  });

  const [items, setItems] = useState<UnifiedCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("rating");
  const [page, setPage] = useState(1);
  const [isNsfw, setIsNsfw] = useState(() => document.documentElement.classList.contains("nsfw"));
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [favVersion, setFavVersion] = useState(0);

  useEffect(() => {
    const onNsfw = () => setIsNsfw(document.documentElement.classList.contains("nsfw"));
    window.addEventListener("nsfw-change", onNsfw);
    return () => window.removeEventListener("nsfw-change", onNsfw);
  }, []);

  useEffect(() => {
    if (!genre) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPage(1);
    fetch(`${BASE}/api/providers/by-genre?genre=${encodeURIComponent(genre)}&nsfw=${isNsfw}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data: UnifiedCatalogItem[]) => { if (!cancelled) setItems(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) { setItems([]); setError("Não foi possível carregar este gênero agora."); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [genre, isNsfw]);

  const empties = getEmptySources();
  const readableItems = items.filter(i => hasReadableSource(i.sources, empties));

  // Read / reading / favorite badges — same derivation as Explore.tsx, so a
  // card looks identical whether it's reached from a shelf row or this page.
  const keyOf = (providerId: string, mangaId: string) => `${providerId}:${mangaId}`;
  const completedForBadge = getLocalCompleted();
  const completedChapterKeys = new Set(completedForBadge.map(c => `${c.providerId}|${c.mangaId}|${c.chapterId}`));
  const readingKeys = new Set(
    Object.values(getLocalProgress())
      .filter((p): p is NonNullable<typeof p> => !!p?.providerId && !!p?.mangaId)
      .filter(p => !completedChapterKeys.has(`${p.providerId}|${p.mangaId}|${p.chapterId}`))
      .map(p => keyOf(p.providerId!, p.mangaId!))
  );
  const readKeys = new Set(completedForBadge.map(c => keyOf(c.providerId, c.mangaId)));
  void favVersion; // re-derive favorites below on toggle
  const favKeys = new Set(getFavorites().map(f => keyOf(f.providerId, f.mangaId)));
  const statusOf = (item: UnifiedCatalogItem): "reading" | "read" | undefined => {
    if (item.sources?.some(s => readingKeys.has(keyOf(s.providerId, s.id)))) return "reading";
    if (item.sources?.some(s => readKeys.has(keyOf(s.providerId, s.id)))) return "read";
    return undefined;
  };

  const sorted = [...readableItems].sort((a, b) => {
    if (sort === "recent") return getReleaseTime(b.releaseDate) - getReleaseTime(a.releaseDate);
    if (sort === "az") return (a.title || "").localeCompare(b.title || "", "pt-BR");
    return (b.rating ?? 0) - (a.rating ?? 0);
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openItem = async (item: UnifiedCatalogItem) => {
    if ((item.sources?.length ?? 0) > 1) setOpeningId(item.id);
    const src = await pickBestSource(item.sources);
    setOpeningId(null);
    if (!src) return;
    setLocation(`/gibi/online?providerId=${src.providerId}&id=${encodeURIComponent(src.id)}&title=${encodeURIComponent(item.title)}&coverUrl=${encodeURIComponent(item.coverUrl || "")}&description=${encodeURIComponent(item.description || "")}`);
  };

  const handleToggleFav = (item: UnifiedCatalogItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const src = item.sources?.[0];
    if (!src) return;
    toggleFavorite({ providerId: src.providerId, mangaId: src.id, title: item.title, coverUrl: item.coverUrl, description: item.description }, user?.id);
    setFavVersion(v => v + 1);
  };

  const goToPage = (p: number) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16 select-none">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setLocation("/explorar")}
          className="inline-flex items-center gap-1 bg-white text-black font-display text-sm uppercase px-3 py-2 border-4 border-black rounded-lg comic-shadow-sm hover:bg-secondary transition-colors"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={3} /> Voltar
        </button>
        <h1 className="font-display text-2xl sm:text-3xl text-black uppercase line-clamp-1">{genre || "Gênero"}</h1>
        {!loading && <span className="font-sans text-xs font-bold text-gray-500">{sorted.length} títulos</span>}
        {loading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <ArrowUpDown className="w-4 h-4 text-gray-400" strokeWidth={2.5} />
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.id}
            onClick={() => { setSort(opt.id); setPage(1); }}
            className={cn(
              "font-display text-xs uppercase px-3 py-1.5 border-2 border-black rounded-full transition-all",
              sort === opt.id ? "bg-primary text-white" : "bg-white text-black hover:bg-secondary"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border-4 border-black text-black font-bold p-4 flex flex-wrap items-center gap-3">
          <AlertCircle className="w-6 h-6 text-primary shrink-0" /> <span className="flex-1 min-w-[200px]">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-24 text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <h3 className="font-display text-2xl">CARREGANDO...</h3>
        </div>
      ) : sorted.length === 0 && !error ? (
        <div className="py-20 text-center border-4 border-dashed border-black bg-white rounded-xl">
          <p className="font-display text-2xl text-gray-400">NENHUM QUADRINHO ENCONTRADO</p>
          <p className="font-sans font-bold text-gray-500 mt-1">Não há títulos de "{genre}" no catálogo no momento.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
            {pageItems.map(item => {
              const src = item.sources?.[0];
              return (
                <CatalogCard
                  key={item.id}
                  item={item}
                  onOpen={() => openItem(item)}
                  onToggleFav={(e) => handleToggleFav(item, e)}
                  favorited={!!src && isFavorite(src.providerId, src.id)}
                  status={statusOf(item)}
                  loading={openingId === item.id}
                  full
                />
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-wrap justify-center items-center gap-2 pt-4 font-sans">
              <button disabled={page === 1} onClick={() => goToPage(page - 1)} className="px-3 py-1.5 border-2 border-black rounded font-bold bg-white text-black hover:bg-secondary disabled:opacity-40 disabled:hover:bg-white">&lt;</button>
              {Array.from({ length: totalPages }).map((_, idx) => {
                const p = idx + 1;
                return (
                  <button key={p} onClick={() => goToPage(p)} className={cn("w-9 h-9 border-2 border-black rounded font-bold transition-all", page === p ? "bg-secondary text-black scale-110 font-black" : "bg-white text-gray-700 hover:bg-muted")}>{p}</button>
                );
              })}
              <button disabled={page === totalPages} onClick={() => goToPage(page + 1)} className="px-3 py-1.5 border-2 border-black rounded font-bold bg-white text-black hover:bg-secondary disabled:opacity-40 disabled:hover:bg-white">&gt;</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
