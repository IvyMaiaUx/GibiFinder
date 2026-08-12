import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, Compass, Play, Star, BookOpen, ChevronLeft, Filter, X, Search } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { SafeImage } from "@/components/ui/SafeImage";
import { isFavorite, toggleFavorite, getFavorites } from "@/lib/favorites";
import { getLocalProgress, getLocalCompleted } from "@/lib/user-history";
import { getGenreBasedSuggestions } from "@/lib/recommendations";
import { getEmptySources, hasReadableSource } from "@/lib/empty-sources";
import { pickBestSource } from "@/lib/pick-best-source";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { CatalogCard, CatalogRow as Row, type CatalogItem as UnifiedCatalogItem } from "@/components/results/CatalogCard";

interface RowData {
  key: string;
  title: string;
  items: UnifiedCatalogItem[];
  /** Overrides what "Ver tudo" opens (defaults to the title as a franchise). */
  seeAllTerm?: string;
  seeAllKind?: "genre" | "franchise";
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const ADULT_PROVIDERS = ["eightmuses", "hentai-home", "hentai-fox", "hentai2read", "hq-desejo", "insta-hentai", "mega-hentai", "mega-hq", "meu-hentai", "my-manga-comics", "nhentai", "quadrinhos-de-sexo", "quadrinhos-eroticos", "universo-hentai", "hentai-teca", "sombras-de-hentai", "superhentais", "hentaidatia", "muitohentai", "tankou-hentai"];
const ADULT_GENRES = ["hentai", "ecchi", "doujinshi", "erótico", "erotica", "adulto", "adult"];

// Preferred genre rows, in display order (only shown if there are enough items).
const FEATURED_GENRES = ["Ação", "Aventura", "Comédia", "Romance", "Drama", "Fantasia", "Terror", "Sobrenatural", "Super-Herói", "Shounen", "Seinen"];
// Source/type markers — not real genres, kept out of the genre rows (they have
// their own type tabs: Mangás / HQs / Gibis).
const EXCLUDED_GENRES = new Set(["biblioteca", "nacional", "gibi nacional", "drive", "hq", "catalogo", "sharepoint", "infantil"]);
// Genre tag data comes straight from provider scrapes with zero curation — a
// handful of WordPress HQ sources tag every chapter with the publisher name,
// a creator byline, or SEO download-page boilerplate instead of (or
// alongside) an actual genre, and those were leaking into the genre chips/
// rows as if they were real categories. Filtered out via isRealGenre() below:
//  - anything with a digit (years, issue numbers, "the boys #31", "baixar hq
//    lanterna verde 2025" — no real genre tag carries one)
//  - known SEO/download-page substrings
//  - a denylist of publisher/imprint names and recurring creator bylines
//  - franchise/character names (cross-checked against FRANCHISES below, so a
//    title never doubles as its own "genre")
const GENRE_SEO_SUBSTRINGS = ["download", "baixar", "ler online", "webp", "hqs ", "cbr", " pdf"];
const NON_GENRE_DENYLIST = new Set([
  "marvel", "marvel comics", "dc", "dc comics", "dc all in", "image comics",
  "dynamite entertainment", "idw publishing", "internet archive", "quadrinhos",
  "matt fraction", "karla pacheco", "pere perez", "jorge jimenez", "cory walker",
  "robert kirkman", "garth ennis", "garth ennis br", "darick robertson", "alex ross",
  "brian michael bendis", "gabrielle dell'otto", "laura martin", "leinil francis yu",
  "mark morales", "troy peteri", "kurt busiek", "ryan sook", "mattia de iulis",
  "paulo siqueira", "steve darnall", "arif prianto", "giuseppe cafaro", "marguerite bennett",
  "the boys", "billy butcher", "hughie campbell", "vought", "witchblade",
  "mark grayson", "spider-woman", "mulher-aranha", "frank castle br",
  "caverna do dragao", "dungeons & dragons", "mestre dos magos",
  "diana", "bobby", "eric", "hank", "presto", "sheila", "uni",
  "justiceiro", "vingador", "invasao skrull", "universo absoluto", "universo compartilhado",
]);
// Franchise/character rows (mostly for HQs, where genre tags are sparse).
const FRANCHISES = [
  "Batman", "Superman", "Homem-Aranha", "Spider-Man", "X-Men", "Vingadores", "Avengers",
  "The Boys", "Mulher-Maravilha", "Homem de Ferro", "Thor", "Hulk", "Flash",
  "Lanterna Verde", "Demolidor", "Wolverine", "Venom", "Deadpool", "Liga da Justiça",
  "Capitão América", "Pantera Negra", "Coringa", "Turma da Mônica",
];
const MIN_FRANCHISE_ITEMS = 2;
// Hentai subgenres highlighted when +18 mode is on.
const ADULT_FEATURED_GENRES = ["Yaoi", "Yuri", "Lolicon", "Shotacon", "Bakunyū", "Futanari", "Incesto", "Netorare", "Hentai", "Ecchi"];
// Curated rows fetched on demand for the HQ and Gibi tabs (their catalog is
// sparse, so we search each series/character to populate real rows).
const HQ_SERIES = ["Batman", "Superman", "Homem-Aranha", "X-Men", "Vingadores", "Liga da Justiça", "Star Wars", "The Boys", "Coringa", "Mulher-Maravilha", "Lanterna Verde", "Flash", "Aquaman", "Capitão América", "Homem de Ferro", "Thor", "Hulk", "Wolverine", "Deadpool", "Pantera Negra", "Venom", "Demolidor", "Quarteto Fantástico", "Guardiões da Galáxia", "Justiceiro"];
const GIBI_SERIES = ["Turma da Mônica", "Turma da Mônica Jovem", "Mônica", "Cebolinha", "Magali", "Cascão", "Chico Bento", "Almanaque", "Pelezinho", "Ronaldinho Gaúcho", "Menino Maluquinho"];
const MIN_ROW_ITEMS = 4;
// How many items a shelf row shows before the user has to open "Ver tudo".
// Every row already has a full paginated view behind that button, so this is
// purely about how much of a first impression each shelf gives up front.
const ROW_DISPLAY_CAP = 30;

const HQ_PROVIDER_IDS = ["comicextra", "jon-domingues", "batcave", "multiverso-hq", "mega-hq", "hq-desejo"];
const GIBI_PROVIDER_IDS = ["biblioteca-br"];
// Brazilian-gibi title hints — keep Turma da Mônica / Disney out of the HQ tab
// even when the crawl mistagged the item's genre as "HQ".
const GIBI_TITLE_HINTS = ["monica", "mônica", "cebolinha", "magali", "cascao", "cascão", "chico bento", "almanaque", "almanacão", "tmj", "turma da", "turma do", "penadinho", "pelezinho", "ronaldinho", "menino maluquinho", "disney", "mickey", "pato donald", "tio patinhas", "luluzinha", "recruta zero", "senninha", "piteco", "horacio", "bidu", "ze carioca", "zé carioca", "pateta", "sitio do picapau", "sítio do picapau", "picapau", "pica-pau", "narizinho", "xaveco", "franjinha", "do bidu", "chico bento moço", "mundo de tio patinhas"];
const typeOf = (item: UnifiedCatalogItem): "manga" | "hq" | "gibi" => {
  const provs = (item.sources || []).map(s => s.providerId);
  const genres = (item.genres || []).map(g => g.toLowerCase());
  // Manual admin reclassification wins over everything.
  const forced = (item as unknown as { forcedType?: string }).forcedType;
  if (forced === "hq" || forced === "gibi" || forced === "manga") return forced;
  // A gibi title hint always wins, regardless of provider — fixes Turma da
  // Mônica / Disney showing in the HQ tab even when served by an HQ provider.
  const t = (item.title || "").toLowerCase();
  if (GIBI_TITLE_HINTS.some(k => t.includes(k))) return "gibi";
  if (provs.some(p => GIBI_PROVIDER_IDS.includes(p))) {
    return genres.includes("hq") ? "hq" : "gibi";
  }
  if (provs.some(p => HQ_PROVIDER_IDS.includes(p))) return "hq";
  return "manga";
};

// "Continue lendo" items come from local progress and carry no genres, so we
// classify them by provider + the same Brazilian-gibi title hint.
const typeOfContinue = (item: { providerId: string; title?: string }): "manga" | "hq" | "gibi" => {
  const t = (item.title || "").toLowerCase();
  if (GIBI_TITLE_HINTS.some(k => t.includes(k))) return "gibi";
  if (GIBI_PROVIDER_IDS.includes(item.providerId)) return "hq";
  if (HQ_PROVIDER_IDS.includes(item.providerId)) return "hq";
  return "manga";
};

const isAdultItem = (item: UnifiedCatalogItem) => {
  if (item.isAdult) return true;
  if (item.sources?.some(s => ADULT_PROVIDERS.includes(s.providerId))) return true;
  if (item.genres?.some(g => ADULT_GENRES.includes(g.toLowerCase()))) return true;
  return false;
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const isRealGenre = (g: string) => {
  const n = norm(g);
  if (!n || /\d/.test(g)) return false;
  if (n.endsWith(" br")) return false;
  if (GENRE_SEO_SUBSTRINGS.some(s => n.includes(s))) return false;
  if (NON_GENRE_DENYLIST.has(n)) return false;
  if (FRANCHISES.some(f => norm(f) === n)) return false;
  return true;
};

function ContinueCard({ item, onClick }: { item: { title: string; coverUrl?: string; chapterNum?: string }; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative w-32 sm:w-40 shrink-0 snap-start bg-white border-4 border-black rounded-xl overflow-hidden text-left comic-shadow-sm hover:translate-y-[-4px] hover:shadow-[6px_6px_0_rgba(0,0,0,1)] transition-all"
    >
      <div className="relative aspect-[3/4] bg-zinc-950 border-b-4 border-black overflow-hidden">
        <SafeImage src={item.coverUrl} alt={item.title} width={320} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
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

export default function Explore() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  useDocumentMeta({
    title: "Explorar gibis, mangás e HQs",
    description: "Explore o catálogo completo de gibis, mangás e HQs do Gibi Finder por tipo, editora e gênero.",
    path: "/explorar",
  });
  const [popular, setPopular] = useState<UnifiedCatalogItem[]>([]);
  const [latest, setLatest] = useState<UnifiedCatalogItem[]>([]);
  const [typeFilter, setTypeFilter] = useState<"all" | "manga" | "hq" | "gibi">(() => {
    // Restore the tab when returning from a work detail ("Voltar para Explorar").
    const t = new URLSearchParams(window.location.search).get("tab");
    return (t === "hq" || t === "gibi" || t === "manga") ? t : "all";
  });
  const [curatedRows, setCuratedRows] = useState<RowData[]>([]);
  const [curatedLoading, setCuratedLoading] = useState(false);
  const [viewAllGenre, setViewAllGenre] = useState<string | null>(null);
  const [viewAllKind, setViewAllKind] = useState<"genre" | "franchise">("genre");
  // Genre "Ver tudo" now goes to a real route (GenrePage.tsx) — bookmarkable/
  // shareable, and gets a sort control the old client-state toggle never
  // had. Franchise rows (Batman, Homem-Aranha, ...) keep the original
  // in-page toggle below; the catalog-redesign proposal only asked for a
  // dedicated genre page, and franchise browsing doesn't have the same
  // "share this exact list" use case a genre does.
  const openViewAll = (value: string, kind: "genre" | "franchise") => {
    if (kind === "genre") {
      setLocation(`/explorar/genero/${encodeURIComponent(value)}`);
      return;
    }
    setSelectedGenreKeys(new Set());
    setViewAllKind(kind);
    setViewAllGenre(value);
    window.scrollTo({ top: 0 });
  };
  // Genre facet filter (à la Pluma Comics' "Filtros" panel) — multi-select,
  // combined with the type tab (manga/hq/gibi) already active. Only makes
  // sense where genre tags actually exist (HQ/Gibi tabs use curated
  // franchise rows instead, so the panel is hidden/cleared there).
  const [showFilters, setShowFilters] = useState(false);
  const [genreSearch, setGenreSearch] = useState("");
  const [selectedGenreKeys, setSelectedGenreKeys] = useState<Set<string>>(new Set());
  const [genreFilterItems, setGenreFilterItems] = useState<UnifiedCatalogItem[]>([]);
  const [genreFilterLoading, setGenreFilterLoading] = useState(false);
  const [genreFilterPage, setGenreFilterPage] = useState(1);
  const toggleGenre = (g: string) => {
    setViewAllGenre(null);
    const k = norm(g);
    setSelectedGenreKeys(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const clearGenreFilters = () => setSelectedGenreKeys(new Set());
  const [viewAllItems, setViewAllItems] = useState<UnifiedCatalogItem[]>([]);
  const [viewAllLoading, setViewAllLoading] = useState(false);
  const [viewAllPage, setViewAllPage] = useState(1);
  const VIEW_ALL_PAGE_SIZE = 250;
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
      // Titles whose current chapter is already finished belong in "Já Lidos",
      // not "Continue lendo".
      const completedKeys = new Set(
        getLocalCompleted().map(c => `${c.providerId}|${c.mangaId}|${c.chapterId}`)
      );
      const items = Object.values(progress)
        .filter((p): p is NonNullable<typeof p> => !!p && !!p.mangaId && !!p.providerId)
        .filter(p => !completedKeys.has(`${p.providerId}|${p.mangaId}|${p.chapterId}`))
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
    // Backstop against a provider hanging: each provider is already capped at
    // ~12s server-side, but this guarantees the UI always reaches a terminal
    // state instead of spinning indefinitely if the request itself stalls.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const [pRes, lRes] = await Promise.all([
        fetch(`${BASE}/api/providers/catalog?listType=popular&nsfw=${nsfw}`, { signal: controller.signal }),
        fetch(`${BASE}/api/providers/catalog?listType=latest&nsfw=${nsfw}`, { signal: controller.signal }),
      ]);
      if (!pRes.ok || !lRes.ok) throw new Error();
      setPopular(await pRes.json() as UnifiedCatalogItem[]);
      setLatest(await lRes.json() as UnifiedCatalogItem[]);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "AbortError"
          ? "O catálogo demorou demais para responder. Tente novamente."
          : "Não foi possível carregar o catálogo agora. Tente novamente mais tarde."
      );
      setPopular([]);
      setLatest([]);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCatalog(isNsfw); }, [isNsfw, loadCatalog]);

  // HQ/Gibi tabs use curated franchise rows (sparse genre tags there) — the
  // genre filter panel doesn't apply, so drop any active selection.
  useEffect(() => {
    if (typeFilter === "hq" || typeFilter === "gibi") {
      setSelectedGenreKeys(new Set());
      setShowFilters(false);
      setGenreSearch("");
    }
  }, [typeFilter]);

  // HQ / Gibi tabs: fetch curated series/character rows on demand (their catalog
  // is sparse, so we search each one to build real rows).
  useEffect(() => {
    if (typeFilter !== "hq" && typeFilter !== "gibi") { setCuratedRows([]); return; }
    const series = typeFilter === "hq" ? HQ_SERIES : GIBI_SERIES;
    let cancelled = false;
    setCuratedRows([]);
    setCuratedLoading(true);

    // Lead with a "Todos os HQs / Gibis" row (the whole curated library of this
    // type), whose "Ver tudo" opens the full paginated set.
    const allTag = typeFilter === "hq" ? "HQ" : "Gibi Nacional";
    const allTitle = typeFilter === "hq" ? "📚 Todos os HQs" : "📚 Todos os Gibis";
    fetch(`${BASE}/api/providers/by-genre?genre=${encodeURIComponent(allTag)}&nsfw=${isNsfw}`)
      .then(r => (r.ok ? r.json() : []))
      .then((items: UnifiedCatalogItem[]) => {
        if (cancelled) return;
        const list = (Array.isArray(items) ? items : []).filter(i => typeOf(i) === typeFilter);
        if (list.length > 0) {
          setCuratedRows(prev => [
            { key: "all", title: allTitle, items: list.slice(0, ROW_DISPLAY_CAP), seeAllTerm: allTag, seeAllKind: "genre" },
            ...prev.filter(r => r.key !== "all"),
          ]);
        }
      })
      .catch(() => { /* ignore */ });

    // Completeness first: HQ rows include the HQ providers (Batcave, Jon Domingues,
    // etc.) so franchises like Coringa / Lanterna Verde / Justiceiro — which live
    // there, not in the Drive library — don't vanish. Gibi is Drive-only (fast).
    const scope = typeFilter === "hq"
      ? [...HQ_PROVIDER_IDS, ...GIBI_PROVIDER_IDS].join(",")
      : GIBI_PROVIDER_IDS.join(",");

    const fetchSeries = (term: string) =>
      fetch(`${BASE}/api/providers/search?query=${encodeURIComponent(term)}&nsfw=${isNsfw}&providers=${encodeURIComponent(scope)}`)
        .then(r => (r.ok ? r.json() : []))
        .then((items: UnifiedCatalogItem[]) => ({
          key: `c-${term}`,
          title: term,
          items: (Array.isArray(items) ? items : [])
            .filter(i => typeOf(i) === typeFilter)
            .slice(0, ROW_DISPLAY_CAP),
        }))
        .catch(() => ({ key: `c-${term}`, title: term, items: [] as UnifiedCatalogItem[] }));

    (async () => {
      // Bigger batches now that each search is cheap (scoped). Rows still stream in.
      const BATCH = 8;
      for (let i = 0; i < series.length && !cancelled; i += BATCH) {
        const rows = await Promise.all(series.slice(i, i + BATCH).map(fetchSeries));
        if (cancelled) return;
        setCuratedRows(prev => [...prev, ...rows.filter(r => r.items.length > 0)]);
      }
      if (!cancelled) setCuratedLoading(false);
    })();
    return () => { cancelled = true; };
  }, [typeFilter, isNsfw]);

  // On "Ver tudo": fetch a large set for that genre on demand (keeps the initial
  // catalog light). Local matches show instantly; fetched ones merge in.
  useEffect(() => {
    if (!viewAllGenre) { setViewAllItems([]); return; }
    let cancelled = false;
    setViewAllPage(1);
    setViewAllLoading(true);
    const endpoint = viewAllKind === "franchise"
      // "Ver tudo" queries ALL providers for completeness (rows stay scoped/fast).
      ? `${BASE}/api/providers/search?query=${encodeURIComponent(viewAllGenre)}&nsfw=${isNsfw}`
      : `${BASE}/api/providers/by-genre?genre=${encodeURIComponent(viewAllGenre)}&nsfw=${isNsfw}`;
    fetch(endpoint)
      .then(r => (r.ok ? r.json() : []))
      .then((data: UnifiedCatalogItem[]) => { if (!cancelled) setViewAllItems(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setViewAllItems([]); })
      .finally(() => { if (!cancelled) setViewAllLoading(false); });
    return () => { cancelled = true; };
  }, [viewAllGenre, viewAllKind, isNsfw]);

  const [openingId, setOpeningId] = useState<string | null>(null);

  const openItem = async (item: UnifiedCatalogItem) => {
    // A single source skips straight to it (no network round-trip). With
    // several, compare their chapter counts (pickBestSource) and open
    // whichever has the most — previously just took the first non-known-dead
    // source, which could land on a thin scrape when a fuller one existed.
    if ((item.sources?.length ?? 0) > 1) setOpeningId(item.id);
    const src = await pickBestSource(item.sources);
    setOpeningId(null);
    if (!src) return;
    setLocation(`/gibi/online?providerId=${src.providerId}&id=${encodeURIComponent(src.id)}&title=${encodeURIComponent(item.title)}&coverUrl=${encodeURIComponent(item.coverUrl || "")}&description=${encodeURIComponent(item.description || "")}&from=explore&tab=${typeFilter}`);
  };

  const handleToggleFav = (item: UnifiedCatalogItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const src = item.sources?.[0];
    if (!src) return;
    toggleFavorite({ providerId: src.providerId, mangaId: src.id, title: item.title, coverUrl: item.coverUrl, description: item.description }, user?.id);
    setFavVersion(v => v + 1);
  };

  const empties = getEmptySources();
  const matchesType = (item: UnifiedCatalogItem) => typeFilter === "all" || typeOf(item) === typeFilter;
  const matchesNsfw = (item: UnifiedCatalogItem) =>
    (isNsfw ? isAdultItem(item) : !isAdultItem(item)) && hasReadableSource(item.sources, empties) && matchesType(item);

  // Respect the active type tab (HQ / Gibi / Mangá) so, e.g., the HQ tab never
  // mixes in gibis or manga.
  const filteredPopular = popular.filter(i => matchesNsfw(i) && matchesType(i));
  const filteredLatest = latest.filter(i => matchesNsfw(i) && matchesType(i));

  // Featured/hero: the highest-rated popular item that has a cover + description.
  const hero = filteredPopular.find(i => i.coverUrl && i.description) || filteredPopular[0];

  // Build genre rows from the union of popular + latest.
  const allItems = [...filteredPopular, ...filteredLatest];
  const byId = new Map<string, UnifiedCatalogItem>();
  for (const it of allItems) if (!byId.has(it.id)) byId.set(it.id, it);
  const uniqueItems = Array.from(byId.values());

  // Read / reading / favorite status (for badges + suggestions), keyed by source.
  const keyOf = (providerId: string, mangaId: string) => `${providerId}:${mangaId}`;
  // Exclude progress entries whose current chapter is already completed so the
  // badge shows "LIDO" (not "LENDO") for a finished work — matching Colecao.tsx.
  const _completedForBadge = getLocalCompleted();
  const completedChapterKeysForBadge = new Set(
    _completedForBadge.map(c => `${c.providerId}|${c.mangaId}|${c.chapterId}`)
  );
  const readingKeys = new Set(
    Object.values(getLocalProgress())
      .filter((p): p is NonNullable<typeof p> => !!p?.providerId && !!p?.mangaId)
      .filter(p => !completedChapterKeysForBadge.has(`${p.providerId}|${p.mangaId}|${p.chapterId}`))
      .map(p => keyOf(p.providerId!, p.mangaId!))
  );
  const readKeys = new Set(_completedForBadge.map(c => keyOf(c.providerId, c.mangaId)));
  const favKeys = new Set(getFavorites().map(f => keyOf(f.providerId, f.mangaId)));
  const interactedKeys = new Set([...readingKeys, ...readKeys, ...favKeys]);

  const statusOf = (item: UnifiedCatalogItem): "reading" | "read" | undefined => {
    if (item.sources?.some(s => readingKeys.has(keyOf(s.providerId, s.id)))) return "reading";
    if (item.sources?.some(s => readKeys.has(keyOf(s.providerId, s.id)))) return "read";
    return undefined;
  };
  // Suggestions: rank the genres the user engaged with, then recommend unseen
  // catalog titles in those genres. Shared with Home.tsx/ResultDetail.tsx —
  // see lib/recommendations.ts.
  const suggestions = getGenreBasedSuggestions(uniqueItems, ROW_DISPLAY_CAP);

  // Dynamic genre list: featured genres first, then every other genre that has
  // enough items — so the catalog surfaces all available genres, not just a fixed set.
  const genreCounts = new Map<string, { display: string; count: number }>();
  for (const it of uniqueItems) {
    for (const g of it.genres || []) {
      if (!isRealGenre(g)) continue;
      const k = norm(g);
      if (!k) continue;
      const e = genreCounts.get(k) || { display: g, count: 0 };
      e.count += 1;
      genreCounts.set(k, e);
    }
  }
  const activeFeatured = isNsfw ? ADULT_FEATURED_GENRES : FEATURED_GENRES;
  const featuredNorm = new Set(activeFeatured.map(norm));
  const extraGenres = [...genreCounts.entries()]
    .filter(([k, v]) => !featuredNorm.has(k) && !EXCLUDED_GENRES.has(k) && v.count >= MIN_ROW_ITEMS)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([, v]) => v.display);
  const allGenres = [...activeFeatured, ...extraGenres];
  const selectedGenres = allGenres.filter(g => selectedGenreKeys.has(norm(g)));

  // Multi-select genre filter: union of full results per selected genre
  // (each genre already has its own "Ver tudo" endpoint) — matches how
  // Pluma Comics' chip panel combines several genres at once, rather than
  // narrowing to titles that carry every selected tag.
  useEffect(() => {
    if (selectedGenres.length === 0) { setGenreFilterItems([]); return; }
    let cancelled = false;
    setGenreFilterPage(1);
    setGenreFilterLoading(true);
    Promise.all(selectedGenres.map(g =>
      fetch(`${BASE}/api/providers/by-genre?genre=${encodeURIComponent(g)}&nsfw=${isNsfw}`)
        .then(r => (r.ok ? r.json() : []))
        .catch(() => [] as UnifiedCatalogItem[])
    )).then(results => {
      if (cancelled) return;
      const byId = new Map<string, UnifiedCatalogItem>();
      for (const list of results) for (const it of (Array.isArray(list) ? list : [])) if (!byId.has(it.id)) byId.set(it.id, it);
      setGenreFilterItems(Array.from(byId.values()));
    }).finally(() => { if (!cancelled) setGenreFilterLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGenres.join("|"), isNsfw]);

  const itemsInGenre = (genre: string) => uniqueItems.filter(i => (i.genres || []).some(g => norm(g) === norm(genre)));
  const itemsInFranchise = (f: string) => uniqueItems.filter(i => norm(i.title).includes(norm(f)));

  // Franchise/character rows (Batman, Homem-Aranha, The Boys, ...).
  const franchiseRows: RowData[] = [];
  for (const f of FRANCHISES) {
    const items = itemsInFranchise(f);
    if (items.length >= MIN_FRANCHISE_ITEMS) franchiseRows.push({ key: `f-${f}`, title: f, items: items.slice(0, ROW_DISPLAY_CAP) });
  }

  const genreRows: RowData[] = [];
  const usedInGenreRows = new Set<string>();
  for (const genre of allGenres) {
    // Each title lands in at most one genre row, so the same manga doesn't repeat
    // across several categories.
    const items = itemsInGenre(genre).filter(i => !usedInGenreRows.has(i.id));
    if (items.length >= MIN_ROW_ITEMS) {
      const rowItems = items.slice(0, ROW_DISPLAY_CAP);
      rowItems.forEach(i => usedInGenreRows.add(i.id));
      genreRows.push({ key: `g-${genre}`, title: genre, items: rowItems });
    }
  }

  // Merge instant local matches with the on-demand fetched set for "Ver tudo".
  const viewAllList = (() => {
    if (!viewAllGenre) return [] as UnifiedCatalogItem[];
    const base = viewAllKind === "franchise" ? itemsInFranchise(viewAllGenre) : itemsInGenre(viewAllGenre);
    const seenT = new Set(base.map(i => (i.title || "").toLowerCase().trim()));
    const extra = viewAllItems.filter(i => {
      const t = (i.title || "").toLowerCase().trim();
      if (!t || seenT.has(t)) return false;
      if (!isNsfw && isAdultItem(i)) return false;
      if (!matchesType(i)) return false;
      seenT.add(t);
      return true;
    });
    return [...base, ...extra];
  })();

  // Instant local matches (already-loaded popular+latest) unioned with the
  // fetched full genre results, same pattern as viewAllList above.
  const genreFilterList = (() => {
    if (selectedGenres.length === 0) return [] as UnifiedCatalogItem[];
    const byId = new Map<string, UnifiedCatalogItem>();
    for (const g of selectedGenres) for (const it of itemsInGenre(g)) if (!byId.has(it.id)) byId.set(it.id, it);
    for (const it of genreFilterItems) if (!byId.has(it.id)) byId.set(it.id, it);
    return Array.from(byId.values()).filter(i => matchesNsfw(i));
  })();

  void favVersion; // re-render favorites on toggle

  return (
      <div className="max-w-6xl mx-auto space-y-8 pb-16 select-none">
        {/* Hero */}
        {hero && !loading && !viewAllGenre && (
          <div className={cn(
            "relative overflow-hidden border-4 border-black rounded-2xl comic-shadow",
            isNsfw ? "bg-zinc-950" : "bg-primary"
          )}>
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(white_1px,transparent_1px)] [background-size:8px_8px] pointer-events-none" />
            <div className="relative flex flex-col sm:flex-row items-center gap-5 p-5 sm:p-8">
              <SafeImage src={hero.coverUrl} alt={hero.title} width={320} className="w-32 h-48 sm:w-40 sm:h-60 object-cover border-4 border-black rounded-lg shrink-0 comic-shadow-sm" />
              <div className="min-w-0 text-white">
                <span className="inline-flex items-center gap-1 font-display text-xs uppercase bg-secondary text-black px-2 py-0.5 border-2 border-black rounded mb-2">
                  <Compass className="w-3.5 h-3.5" strokeWidth={3} /> Destaque
                </span>
                <h2 className="font-display text-3xl sm:text-5xl tracking-wide uppercase drop-shadow-[2px_2px_0_black] leading-tight line-clamp-2">{hero.title}</h2>
                <p className="font-sans font-bold text-sm text-white/90 mt-2 line-clamp-3 max-w-xl">{hero.description || "Um dos títulos mais buscados do momento."}</p>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => openItem(hero)}
                    disabled={openingId === hero.id}
                    className="inline-flex items-center gap-2 bg-white text-black font-display text-sm uppercase px-5 py-2.5 border-4 border-black rounded-lg comic-shadow-sm hover:bg-secondary transition-colors disabled:opacity-70 disabled:cursor-wait"
                  >
                    {openingId === hero.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" strokeWidth={3} />} Ler agora
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
          <div className="bg-red-50 border-4 border-black text-black font-bold p-4 flex flex-wrap items-center gap-3">
            <AlertCircle className="w-6 h-6 text-primary shrink-0" /> <span className="flex-1 min-w-[200px]">{error}</span>
            <button
              type="button"
              onClick={() => loadCatalog(isNsfw)}
              className="inline-flex items-center gap-2 bg-secondary text-black font-display text-sm uppercase px-4 py-2 border-4 border-black rounded-lg comic-shadow-sm hover:bg-yellow-400 transition-colors shrink-0"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Type tabs + genre filter panel */}
        {!viewAllGenre && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {([
                { id: "all", label: "Todos" },
                { id: "manga", label: "Mangás" },
                { id: "hq", label: "HQs" },
                { id: "gibi", label: "Gibis" },
              ] as const).map(t => (
                <button
                  key={t.id}
                  onClick={() => setTypeFilter(t.id)}
                  className={cn(
                    "font-display text-sm uppercase px-4 py-2 border-4 border-black rounded-lg transition-all",
                    typeFilter === t.id ? "bg-primary text-white comic-shadow-sm translate-y-[-1px]" : "bg-white text-black hover:bg-secondary"
                  )}
                >
                  {t.label}
                </button>
              ))}
              {typeFilter !== "hq" && typeFilter !== "gibi" && (
                <button
                  onClick={() => setShowFilters(v => { if (v) setGenreSearch(""); return !v; })}
                  className={cn(
                    "inline-flex items-center gap-1.5 font-display text-sm uppercase px-4 py-2 border-4 border-black rounded-lg transition-all sm:ml-auto",
                    showFilters || selectedGenres.length > 0 ? "bg-secondary text-black comic-shadow-sm" : "bg-white text-black hover:bg-secondary"
                  )}
                >
                  <Filter className="w-4 h-4" strokeWidth={3} />
                  Filtros{selectedGenres.length > 0 ? ` (${selectedGenres.length})` : ""}
                </button>
              )}
            </div>

            {showFilters && typeFilter !== "hq" && typeFilter !== "gibi" && (
              <div className="bg-white border-4 border-black rounded-xl p-4 comic-shadow-sm space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm uppercase text-black tracking-wide">Gêneros</h3>
                  {selectedGenres.length > 0 && (
                    <button onClick={clearGenreFilters} className="inline-flex items-center gap-1 font-sans text-xs font-bold text-gray-500 hover:text-primary transition-colors">
                      <X className="w-3.5 h-3.5" /> Limpar
                    </button>
                  )}
                </div>
                {allGenres.length > 8 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" strokeWidth={2.5} />
                    <input
                      type="text"
                      value={genreSearch}
                      onChange={(e) => setGenreSearch(e.target.value)}
                      placeholder="Buscar gênero..."
                      className="w-full font-sans text-sm pl-9 pr-8 py-2 border-2 border-black rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {genreSearch && (
                      <button
                        onClick={() => setGenreSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black"
                        title="Limpar busca"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {allGenres
                    .filter(g => !genreSearch.trim() || norm(g).includes(norm(genreSearch)))
                    .map(g => {
                      const active = selectedGenreKeys.has(norm(g));
                      return (
                        <button
                          key={g}
                          onClick={() => toggleGenre(g)}
                          className={cn(
                            "font-display text-xs uppercase px-3 py-1.5 border-2 border-black rounded-full transition-all",
                            active ? "bg-primary text-white" : "bg-white text-black hover:bg-secondary"
                          )}
                        >
                          {g}
                        </button>
                      );
                    })}
                  {genreSearch.trim() && !allGenres.some(g => norm(g).includes(norm(genreSearch))) && (
                    <p className="font-sans text-xs text-gray-400 py-1">Nenhum gênero encontrado.</p>
                  )}
                </div>
              </div>
            )}
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
            <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
              {viewAllList
                .slice((viewAllPage - 1) * VIEW_ALL_PAGE_SIZE, viewAllPage * VIEW_ALL_PAGE_SIZE)
                .map(item => {
                  const src = item.sources?.[0];
                  return (
                    <CatalogCard key={`all-${item.id}`} item={item} onOpen={() => openItem(item)} onToggleFav={(e) => handleToggleFav(item, e)} favorited={!!src && isFavorite(src.providerId, src.id)} status={statusOf(item)} loading={openingId === item.id} full />
                  );
                })}
            </div>

            {(() => {
              const totalPages = Math.ceil(viewAllList.length / VIEW_ALL_PAGE_SIZE);
              if (totalPages <= 1) return null;
              const go = (p: number) => { setViewAllPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); };
              return (
                <div className="flex flex-wrap justify-center items-center gap-2 pt-4 font-sans">
                  <button disabled={viewAllPage === 1} onClick={() => go(viewAllPage - 1)} className="px-3 py-1.5 border-2 border-black rounded font-bold bg-white text-black hover:bg-secondary disabled:opacity-40 disabled:hover:bg-white">&lt;</button>
                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const p = idx + 1;
                    return (
                      <button key={p} onClick={() => go(p)} className={cn("w-9 h-9 border-2 border-black rounded font-bold transition-all", viewAllPage === p ? "bg-secondary text-black scale-110 font-black" : "bg-white text-gray-700 hover:bg-muted")}>{p}</button>
                    );
                  })}
                  <button disabled={viewAllPage === totalPages} onClick={() => go(viewAllPage + 1)} className="px-3 py-1.5 border-2 border-black rounded font-bold bg-white text-black hover:bg-secondary disabled:opacity-40 disabled:hover:bg-white">&gt;</button>
                </div>
              );
            })()}
          </div>
        ) : selectedGenres.length > 0 ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={clearGenreFilters}
                className="inline-flex items-center gap-1 bg-white text-black font-display text-sm uppercase px-3 py-2 border-4 border-black rounded-lg comic-shadow-sm hover:bg-secondary transition-colors"
              >
                <ChevronLeft className="w-4 h-4" strokeWidth={3} /> Voltar
              </button>
              <h2 className="font-display text-2xl sm:text-3xl text-black uppercase line-clamp-1">{selectedGenres.join(" + ")}</h2>
              <span className="font-sans text-xs font-bold text-gray-500">{genreFilterList.length} títulos</span>
              {genreFilterLoading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
            </div>

            {genreFilterList.length === 0 && !genreFilterLoading ? (
              <div className="py-20 text-center border-4 border-dashed border-black bg-white rounded-xl">
                <p className="font-display text-2xl text-gray-400">NENHUM QUADRINHO ENCONTRADO</p>
                <p className="font-sans font-bold text-gray-500 mt-1">Tente combinar com outro gênero.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
                  {genreFilterList
                    .slice((genreFilterPage - 1) * VIEW_ALL_PAGE_SIZE, genreFilterPage * VIEW_ALL_PAGE_SIZE)
                    .map(item => {
                      const src = item.sources?.[0];
                      return (
                        <CatalogCard key={`gf-${item.id}`} item={item} onOpen={() => openItem(item)} onToggleFav={(e) => handleToggleFav(item, e)} favorited={!!src && isFavorite(src.providerId, src.id)} status={statusOf(item)} loading={openingId === item.id} full />
                      );
                    })}
                </div>

                {(() => {
                  const totalPages = Math.ceil(genreFilterList.length / VIEW_ALL_PAGE_SIZE);
                  if (totalPages <= 1) return null;
                  const go = (p: number) => { setGenreFilterPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); };
                  return (
                    <div className="flex flex-wrap justify-center items-center gap-2 pt-4 font-sans">
                      <button disabled={genreFilterPage === 1} onClick={() => go(genreFilterPage - 1)} className="px-3 py-1.5 border-2 border-black rounded font-bold bg-white text-black hover:bg-secondary disabled:opacity-40 disabled:hover:bg-white">&lt;</button>
                      {Array.from({ length: totalPages }).map((_, idx) => {
                        const p = idx + 1;
                        return (
                          <button key={p} onClick={() => go(p)} className={cn("w-9 h-9 border-2 border-black rounded font-bold transition-all", genreFilterPage === p ? "bg-secondary text-black scale-110 font-black" : "bg-white text-gray-700 hover:bg-muted")}>{p}</button>
                        );
                      })}
                      <button disabled={genreFilterPage === totalPages} onClick={() => go(genreFilterPage + 1)} className="px-3 py-1.5 border-2 border-black rounded font-bold bg-white text-black hover:bg-secondary disabled:opacity-40 disabled:hover:bg-white">&gt;</button>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Continue reading (+18 items only in +18 mode) */}
            {(() => {
              const visibleContinue = continueItems.filter(i =>
                ADULT_PROVIDERS.includes(i.providerId) === isNsfw &&
                (typeFilter === "all" || typeOfContinue(i) === typeFilter),
              );
              if (visibleContinue.length === 0) return null;
              return (
                <Row title="▶ Continue lendo">
                  {visibleContinue.map(item => (
                    <ContinueCard
                      key={`${item.providerId}-${item.mangaId}`}
                      item={item}
                      onClick={() => setLocation(`/gibi/online?providerId=${item.providerId}&id=${encodeURIComponent(item.mangaId)}&title=${encodeURIComponent(item.title)}&coverUrl=${encodeURIComponent(item.coverUrl || "")}&resume=true&from=explore&tab=${typeFilter}`)}
                    />
                  ))}
                </Row>
              );
            })()}

            {suggestions.filter(matchesType).length >= MIN_ROW_ITEMS && (
              <Row title="✨ Sugestões pra você">
                {suggestions.filter(matchesType).map(item => {
                  const src = item.sources?.[0];
                  return (
                    <CatalogCard key={`sug-${item.id}`} item={item} onOpen={() => openItem(item)} onToggleFav={(e) => handleToggleFav(item, e)} favorited={!!src && isFavorite(src.providerId, src.id)} status={statusOf(item)} loading={openingId === item.id} />
                  );
                })}
              </Row>
            )}

            {/* Curated series/character rows for HQ and Gibi tabs */}
            {(typeFilter === "hq" || typeFilter === "gibi") && curatedLoading && curatedRows.length === 0 && (
              <div className="py-8 text-center text-gray-500 font-display flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary" /> Carregando categorias...
              </div>
            )}
            {curatedRows.map(row => (
              <Row key={row.key} title={row.title} onSeeAll={() => openViewAll(row.seeAllTerm ?? row.title, row.seeAllKind ?? "franchise")}>
                {row.items.map(item => {
                  const src = item.sources?.[0];
                  return (
                    <CatalogCard key={`${row.key}-${item.id}`} item={item} onOpen={() => openItem(item)} onToggleFav={(e) => handleToggleFav(item, e)} favorited={!!src && isFavorite(src.providerId, src.id)} status={statusOf(item)} loading={openingId === item.id} />
                  );
                })}
              </Row>
            ))}

            {typeFilter !== "hq" && typeFilter !== "gibi" && franchiseRows.map(row => (
              <Row key={row.key} title={row.title} onSeeAll={() => openViewAll(row.title, "franchise")}>
                {row.items.map(item => {
                  const src = item.sources?.[0];
                  return (
                    <CatalogCard key={`${row.key}-${item.id}`} item={item} onOpen={() => openItem(item)} onToggleFav={(e) => handleToggleFav(item, e)} favorited={!!src && isFavorite(src.providerId, src.id)} status={statusOf(item)} loading={openingId === item.id} />
                  );
                })}
              </Row>
            ))}

            {typeFilter !== "hq" && typeFilter !== "gibi" && genreRows.map(row => (
              <Row key={row.key} title={row.title} onSeeAll={() => openViewAll(row.title, "genre")}>
                {row.items.map(item => {
                  const src = item.sources?.[0];
                  return (
                    <CatalogCard key={`${row.key}-${item.id}`} item={item} onOpen={() => openItem(item)} onToggleFav={(e) => handleToggleFav(item, e)} favorited={!!src && isFavorite(src.providerId, src.id)} status={statusOf(item)} loading={openingId === item.id} />
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
  );
}
