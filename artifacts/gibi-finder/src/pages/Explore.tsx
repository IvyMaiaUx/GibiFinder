import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { Loader2, AlertCircle, Compass, Star, ChevronLeft, ChevronRight, Play, BookOpen, CheckCircle2, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { SafeImage } from "@/components/ui/SafeImage";
import { isFavorite, toggleFavorite, getFavorites } from "@/lib/favorites";
import { getLocalProgress, getLocalCompleted } from "@/lib/user-history";
import { getEmptySources, hasReadableSource } from "@/lib/empty-sources";
import { useAuth } from "@/hooks/use-auth";

interface CatalogSource {
  providerId: string;
  id: string;
  title: string;
}

interface UnifiedCatalogItem {
  id: string;
  title: string;
  coverUrl?: string;
  description?: string;
  rating?: number;
  genres?: string[];
  isAdult?: boolean;
  sources: CatalogSource[];
}

interface RowData {
  key: string;
  title: string;
  items: UnifiedCatalogItem[];
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const ADULT_PROVIDERS = ["eightmuses", "hentai-home", "hentai-fox", "hentai2read", "hq-desejo", "insta-hentai", "mega-hentai", "my-manga-comics", "nhentai", "quadrinhos-de-sexo", "quadrinhos-eroticos", "universo-hentai", "hentai-teca", "sombras-de-hentai"];
const ADULT_GENRES = ["hentai", "ecchi", "doujinshi", "erótico", "erotica", "adulto", "adult"];

// Preferred genre rows, in display order (only shown if there are enough items).
const FEATURED_GENRES = ["Nacional", "Infantil", "Biblioteca", "Ação", "Aventura", "Comédia", "Romance", "Terror", "Super-Herói", "Shounen", "Seinen", "Fantasia"];
const MIN_ROW_ITEMS = 4;

const isAdultItem = (item: UnifiedCatalogItem) => {
  if (item.isAdult) return true;
  if (item.sources?.some(s => ADULT_PROVIDERS.includes(s.providerId))) return true;
  if (item.genres?.some(g => ADULT_GENRES.includes(g.toLowerCase()))) return true;
  return false;
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function ContinueCard({ item, onClick }: { item: { title: string; coverUrl?: string; chapterNum?: string }; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative w-32 sm:w-40 shrink-0 bg-white border-4 border-black rounded-xl overflow-hidden text-left comic-shadow-sm hover:translate-y-[-4px] hover:shadow-[6px_6px_0_rgba(0,0,0,1)] transition-all"
    >
      <div className="relative aspect-[3/4] bg-zinc-950 border-b-4 border-black overflow-hidden">
        <SafeImage src={item.coverUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
        <span className="absolute bottom-1 left-1 bg-primary text-white text-3xs font-display px-1.5 py-0.5 border border-black rounded flex items-center gap-1">
          <BookOpen className="w-3 h-3" /> Cap. {item.chapterNum ?? "?"}
        </span>
      </div>
      <div className="p-2">
        <h4 className="font-display text-xs sm:text-sm text-black leading-tight line-clamp-2 group-hover:text-primary">{item.title}</h4>
      </div>
    </button>
  );
}

function CatalogCard({ item, onOpen, onToggleFav, favorited, status, full }: {
  item: UnifiedCatalogItem;
  onOpen: () => void;
  onToggleFav: (e: React.MouseEvent) => void;
  favorited: boolean;
  status?: "reading" | "read";
  full?: boolean;
}) {
  return (
    <div
      onClick={onOpen}
      className={cn(
        "group relative cursor-pointer bg-white border-4 border-black rounded-xl overflow-hidden comic-shadow-sm hover:translate-y-[-4px] hover:shadow-[6px_6px_0_rgba(0,0,0,1)] hover:bg-yellow-50 transition-all",
        full ? "w-full" : "w-32 sm:w-40 shrink-0"
      )}
    >
      <div className="relative aspect-[3/4] bg-zinc-950 border-b-4 border-black overflow-hidden">
        <SafeImage src={item.coverUrl} alt={item.title} className={cn("w-full h-full object-cover group-hover:scale-105 transition-transform", status && "opacity-90")} loading="lazy" />
        {status && (
          <span className={cn(
            "absolute top-1.5 left-1.5 flex items-center gap-0.5 text-white text-3xs font-display px-1.5 py-0.5 border border-black rounded",
            status === "reading" ? "bg-primary" : "bg-emerald-600"
          )}>
            {status === "reading" ? <><BookOpen className="w-2.5 h-2.5" /> LENDO</> : <><CheckCircle2 className="w-2.5 h-2.5" /> LIDO</>}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleFav}
          className={cn(
            "absolute top-1.5 right-1.5 p-1.5 border-2 border-black rounded-full transition-colors shadow-[2px_2px_0_rgba(0,0,0,1)]",
            favorited ? "bg-secondary text-black" : "bg-white/90 text-gray-500 hover:bg-secondary hover:text-black"
          )}
          title={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        >
          <Star className={cn("w-3.5 h-3.5", favorited && "fill-black")} strokeWidth={3} />
        </button>
        {item.rating !== undefined && (
          <span className="absolute bottom-1 left-1 flex items-center gap-0.5 bg-[#FFD166] text-black px-1.5 py-0.5 border border-black rounded font-display text-2xs font-black">
            <Star className="w-2.5 h-2.5 fill-black" strokeWidth={2.5} /> {(item.rating / 2).toFixed(1)}
          </span>
        )}
      </div>
      <div className="p-2">
        <h4 className="font-display text-xs sm:text-sm text-black leading-tight line-clamp-2 group-hover:text-primary">{item.title}</h4>
      </div>
    </div>
  );
}

function Row({ title, children, onSeeAll }: { title: string; children: React.ReactNode; onSeeAll?: () => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xl sm:text-2xl text-black uppercase truncate">{title}</h3>
        <div className="flex items-center gap-1 shrink-0">
          {onSeeAll && (
            <button onClick={onSeeAll} className="font-display text-xs uppercase text-primary hover:underline px-2 py-1">
              Ver tudo →
            </button>
          )}
          <div className="hidden sm:flex gap-1">
            <button onClick={() => scrollBy(-1)} className="p-1.5 border-2 border-black rounded bg-white hover:bg-secondary transition-colors" aria-label="Anterior">
              <ChevronLeft className="w-4 h-4" strokeWidth={3} />
            </button>
            <button onClick={() => scrollBy(1)} className="p-1.5 border-2 border-black rounded bg-white hover:bg-secondary transition-colors" aria-label="Próximo">
              <ChevronRight className="w-4 h-4" strokeWidth={3} />
            </button>
          </div>
        </div>
      </div>
      <div ref={scrollerRef} className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 -mx-1 px-1 scroll-smooth [scrollbar-width:thin]">
        {children}
      </div>
    </section>
  );
}

export default function Explore() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [popular, setPopular] = useState<UnifiedCatalogItem[]>([]);
  const [latest, setLatest] = useState<UnifiedCatalogItem[]>([]);
  const [viewAllGenre, setViewAllGenre] = useState<string | null>(null);
  const [viewAllItems, setViewAllItems] = useState<UnifiedCatalogItem[]>([]);
  const [viewAllLoading, setViewAllLoading] = useState(false);
  const [continueItems, setContinueItems] = useState<{ providerId: string; mangaId: string; title: string; coverUrl?: string; chapterNum?: string; updatedAt: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favVersion, setFavVersion] = useState(0);
  const [isNsfw, setIsNsfw] = useState(() => document.documentElement.classList.contains("nsfw"));

  useEffect(() => {
    const onNsfw = () => setIsNsfw(document.documentElement.classList.contains("nsfw"));
    window.addEventListener("nsfw-change", onNsfw);
    return () => window.removeEventListener("nsfw-change", onNsfw);
  }, []);

  // Load "continue reading" from local progress.
  useEffect(() => {
    try {
      const progress = getLocalProgress();
      const items = Object.values(progress)
        .filter((p): p is NonNullable<typeof p> => !!p && !!p.mangaId && !!p.providerId)
        .map(p => ({
          providerId: p.providerId!,
          mangaId: p.mangaId!,
          title: p.title,
          coverUrl: p.coverUrl,
          chapterNum: p.chapterNum,
          updatedAt: p.updatedAt ? new Date(p.updatedAt).getTime() : 0,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 20);
      setContinueItems(items);
    } catch { /* ignore */ }
  }, []);

  const loadCatalog = useCallback(async (nsfw: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, lRes] = await Promise.all([
        fetch(`${BASE}/api/providers/catalog?listType=popular&nsfw=${nsfw}`),
        fetch(`${BASE}/api/providers/catalog?listType=latest&nsfw=${nsfw}`),
      ]);
      if (!pRes.ok || !lRes.ok) throw new Error();
      setPopular(await pRes.json() as UnifiedCatalogItem[]);
      setLatest(await lRes.json() as UnifiedCatalogItem[]);
    } catch {
      setError("Não foi possível carregar o catálogo agora. Tente novamente mais tarde.");
      setPopular([]);
      setLatest([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCatalog(isNsfw); }, [isNsfw, loadCatalog]);

  // On "Ver tudo": fetch a large set for that genre on demand (keeps the initial
  // catalog light). Local matches show instantly; fetched ones merge in.
  useEffect(() => {
    if (!viewAllGenre) { setViewAllItems([]); return; }
    let cancelled = false;
    setViewAllLoading(true);
    fetch(`${BASE}/api/providers/by-genre?genre=${encodeURIComponent(viewAllGenre)}&nsfw=${isNsfw}`)
      .then(r => (r.ok ? r.json() : []))
      .then((data: UnifiedCatalogItem[]) => { if (!cancelled) setViewAllItems(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setViewAllItems([]); })
      .finally(() => { if (!cancelled) setViewAllLoading(false); });
    return () => { cancelled = true; };
  }, [viewAllGenre, isNsfw]);

  const openItem = (item: UnifiedCatalogItem) => {
    const src = item.sources?.[0];
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

  const empties = getEmptySources();
  const matchesNsfw = (item: UnifiedCatalogItem) =>
    (isNsfw ? isAdultItem(item) : !isAdultItem(item)) && hasReadableSource(item.sources, empties);

  const filteredPopular = popular.filter(matchesNsfw);
  const filteredLatest = latest.filter(matchesNsfw);

  // Featured/hero: the highest-rated popular item that has a cover + description.
  const hero = filteredPopular.find(i => i.coverUrl && i.description) || filteredPopular[0];

  // Build genre rows from the union of popular + latest.
  const allItems = [...filteredPopular, ...filteredLatest];
  const byId = new Map<string, UnifiedCatalogItem>();
  for (const it of allItems) if (!byId.has(it.id)) byId.set(it.id, it);
  const uniqueItems = Array.from(byId.values());

  // Read / reading / favorite status (for badges + suggestions), keyed by source.
  const keyOf = (providerId: string, mangaId: string) => `${providerId}:${mangaId}`;
  const readingKeys = new Set(
    Object.values(getLocalProgress())
      .filter((p): p is NonNullable<typeof p> => !!p?.providerId && !!p?.mangaId)
      .map(p => keyOf(p.providerId!, p.mangaId!))
  );
  const readKeys = new Set(getLocalCompleted().map(c => keyOf(c.providerId, c.mangaId)));
  const favKeys = new Set(getFavorites().map(f => keyOf(f.providerId, f.mangaId)));
  const interactedKeys = new Set([...readingKeys, ...readKeys, ...favKeys]);

  const statusOf = (item: UnifiedCatalogItem): "reading" | "read" | undefined => {
    if (item.sources?.some(s => readingKeys.has(keyOf(s.providerId, s.id)))) return "reading";
    if (item.sources?.some(s => readKeys.has(keyOf(s.providerId, s.id)))) return "read";
    return undefined;
  };
  const isInteracted = (item: UnifiedCatalogItem) =>
    item.sources?.some(s => interactedKeys.has(keyOf(s.providerId, s.id)));

  // Suggestions: rank the genres the user engaged with, then recommend unseen
  // catalog titles in those genres.
  const genreScore = new Map<string, number>();
  for (const it of uniqueItems) {
    if (!isInteracted(it)) continue;
    for (const g of it.genres || []) genreScore.set(norm(g), (genreScore.get(norm(g)) || 0) + 1);
  }
  const topGenres = [...genreScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
  const suggestions = topGenres.length === 0 ? [] : uniqueItems
    .filter(it => !isInteracted(it) && (it.genres || []).some(g => topGenres.includes(norm(g))))
    .map(it => ({ it, score: (it.genres || []).filter(g => topGenres.includes(norm(g))).length + (it.rating || 0) / 20 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(x => x.it);

  // Dynamic genre list: featured genres first, then every other genre that has
  // enough items — so the catalog surfaces all available genres, not just a fixed set.
  const genreCounts = new Map<string, { display: string; count: number }>();
  for (const it of uniqueItems) {
    for (const g of it.genres || []) {
      const k = norm(g);
      if (!k) continue;
      const e = genreCounts.get(k) || { display: g, count: 0 };
      e.count += 1;
      genreCounts.set(k, e);
    }
  }
  const featuredNorm = new Set(FEATURED_GENRES.map(norm));
  const extraGenres = [...genreCounts.entries()]
    .filter(([k, v]) => !featuredNorm.has(k) && v.count >= MIN_ROW_ITEMS)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([, v]) => v.display);
  const allGenres = [...FEATURED_GENRES, ...extraGenres];

  const itemsInGenre = (genre: string) => uniqueItems.filter(i => (i.genres || []).some(g => norm(g) === norm(genre)));

  const genreRows: RowData[] = [];
  const usedInGenreRows = new Set<string>();
  for (const genre of allGenres) {
    // Each title lands in at most one genre row, so the same manga doesn't repeat
    // across several categories.
    const items = itemsInGenre(genre).filter(i => !usedInGenreRows.has(i.id));
    if (items.length >= MIN_ROW_ITEMS) {
      const rowItems = items.slice(0, 20);
      rowItems.forEach(i => usedInGenreRows.add(i.id));
      genreRows.push({ key: `g-${genre}`, title: genre, items: rowItems });
    }
  }

  // Merge instant local matches with the on-demand fetched set for "Ver tudo".
  const viewAllList = (() => {
    if (!viewAllGenre) return [] as UnifiedCatalogItem[];
    const base = itemsInGenre(viewAllGenre);
    const seenT = new Set(base.map(i => (i.title || "").toLowerCase().trim()));
    const extra = viewAllItems.filter(i => {
      const t = (i.title || "").toLowerCase().trim();
      if (!t || seenT.has(t)) return false;
      if (!isNsfw && isAdultItem(i)) return false;
      seenT.add(t);
      return true;
    });
    return [...base, ...extra];
  })();

  void favVersion; // re-render favorites on toggle

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-16 select-none">
        {/* Hero */}
        {hero && !loading && !viewAllGenre && (
          <div className={cn(
            "relative overflow-hidden border-4 border-black rounded-2xl comic-shadow",
            isNsfw ? "bg-zinc-950" : "bg-primary"
          )}>
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(white_1px,transparent_1px)] [background-size:8px_8px] pointer-events-none" />
            <div className="relative flex flex-col sm:flex-row items-center gap-5 p-5 sm:p-8">
              <SafeImage src={hero.coverUrl} alt={hero.title} className="w-32 h-48 sm:w-40 sm:h-60 object-cover border-4 border-black rounded-lg shrink-0 comic-shadow-sm" />
              <div className="min-w-0 text-white">
                <span className="inline-flex items-center gap-1 font-display text-xs uppercase bg-secondary text-black px-2 py-0.5 border-2 border-black rounded mb-2">
                  <Compass className="w-3.5 h-3.5" strokeWidth={3} /> Destaque
                </span>
                <h2 className="font-display text-3xl sm:text-5xl tracking-wide uppercase drop-shadow-[2px_2px_0_black] leading-tight line-clamp-2">{hero.title}</h2>
                <p className="font-sans font-bold text-sm text-white/90 mt-2 line-clamp-3 max-w-xl">{hero.description || "Um dos títulos mais buscados do momento."}</p>
                <div className="flex gap-3 mt-4">
                  <button onClick={() => openItem(hero)} className="inline-flex items-center gap-2 bg-white text-black font-display text-sm uppercase px-5 py-2.5 border-4 border-black rounded-lg comic-shadow-sm hover:bg-secondary transition-colors">
                    <Play className="w-4 h-4 fill-current" strokeWidth={3} /> Ler agora
                  </button>
                  <button onClick={(e) => handleToggleFav(hero, e)} className={cn(
                    "inline-flex items-center gap-2 font-display text-sm uppercase px-4 py-2.5 border-4 border-black rounded-lg comic-shadow-sm transition-colors",
                    hero.sources[0] && isFavorite(hero.sources[0].providerId, hero.sources[0].id) ? "bg-secondary text-black" : "bg-white/10 text-white hover:bg-white/20"
                  )}>
                    <Star className={cn("w-4 h-4", hero.sources[0] && isFavorite(hero.sources[0].providerId, hero.sources[0].id) && "fill-black")} strokeWidth={3} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border-4 border-black text-black font-bold p-4 flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-primary shrink-0" /> <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="py-24 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <h3 className="font-display text-2xl">CARREGANDO O CATÁLOGO...</h3>
          </div>
        ) : viewAllGenre ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setViewAllGenre(null)}
                className="inline-flex items-center gap-1 bg-white text-black font-display text-sm uppercase px-3 py-2 border-4 border-black rounded-lg comic-shadow-sm hover:bg-secondary transition-colors"
              >
                <ChevronLeft className="w-4 h-4" strokeWidth={3} /> Voltar
              </button>
              <h2 className="font-display text-2xl sm:text-3xl text-black uppercase">{viewAllGenre}</h2>
              <span className="font-sans text-xs font-bold text-gray-500">{viewAllList.length} títulos</span>
              {viewAllLoading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5 sm:gap-4">
              {viewAllList.map(item => {
                const src = item.sources?.[0];
                return (
                  <CatalogCard key={`all-${item.id}`} item={item} onOpen={() => openItem(item)} onToggleFav={(e) => handleToggleFav(item, e)} favorited={!!src && isFavorite(src.providerId, src.id)} status={statusOf(item)} full />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Continue reading */}
            {continueItems.length > 0 && (
              <Row title="▶ Continue lendo">
                {continueItems.map(item => (
                  <ContinueCard
                    key={`${item.providerId}-${item.mangaId}`}
                    item={item}
                    onClick={() => setLocation(`/gibi/online?providerId=${item.providerId}&id=${encodeURIComponent(item.mangaId)}&title=${encodeURIComponent(item.title)}&coverUrl=${encodeURIComponent(item.coverUrl || "")}&resume=true`)}
                  />
                ))}
              </Row>
            )}

            {suggestions.length >= MIN_ROW_ITEMS && (
              <Row title="✨ Sugestões pra você">
                {suggestions.map(item => {
                  const src = item.sources?.[0];
                  return (
                    <CatalogCard key={`sug-${item.id}`} item={item} onOpen={() => openItem(item)} onToggleFav={(e) => handleToggleFav(item, e)} favorited={!!src && isFavorite(src.providerId, src.id)} status={statusOf(item)} />
                  );
                })}
              </Row>
            )}

            {filteredPopular.length > 0 && (
              <Row title="🔥 Mais populares">
                {filteredPopular.slice(0, 20).map(item => {
                  const src = item.sources?.[0];
                  return (
                    <CatalogCard key={item.id} item={item} onOpen={() => openItem(item)} onToggleFav={(e) => handleToggleFav(item, e)} favorited={!!src && isFavorite(src.providerId, src.id)} status={statusOf(item)} />
                  );
                })}
              </Row>
            )}

            {filteredLatest.length > 0 && (
              <Row title="🆕 Novidades">
                {filteredLatest.slice(0, 20).map(item => {
                  const src = item.sources?.[0];
                  return (
                    <CatalogCard key={`new-${item.id}`} item={item} onOpen={() => openItem(item)} onToggleFav={(e) => handleToggleFav(item, e)} favorited={!!src && isFavorite(src.providerId, src.id)} status={statusOf(item)} />
                  );
                })}
              </Row>
            )}

            {genreRows.map(row => (
              <Row key={row.key} title={row.title} onSeeAll={() => { setViewAllGenre(row.title); window.scrollTo({ top: 0 }); }}>
                {row.items.map(item => {
                  const src = item.sources?.[0];
                  return (
                    <CatalogCard key={`${row.key}-${item.id}`} item={item} onOpen={() => openItem(item)} onToggleFav={(e) => handleToggleFav(item, e)} favorited={!!src && isFavorite(src.providerId, src.id)} status={statusOf(item)} />
                  );
                })}
              </Row>
            ))}

            {!error && filteredPopular.length === 0 && filteredLatest.length === 0 && (
              <div className="py-20 text-center border-4 border-dashed border-black bg-white rounded-xl">
                <p className="font-display text-2xl text-gray-400">NENHUM QUADRINHO ENCONTRADO</p>
                <p className="font-sans font-bold text-gray-500 mt-1">Nenhum provedor retornou dados no momento.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
