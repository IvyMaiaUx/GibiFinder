// Compact clickable catalog card + horizontal scroll row — extracted from
// Explore.tsx (where these were originally local-only) so Home.tsx and
// ResultDetail.tsx can render the same "genre-based suggestions" /
// "similar titles" rows without duplicating the markup.
import { useRef } from "react";
import { ChevronLeft, ChevronRight, Star, BookOpen, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeImage } from "@/components/ui/SafeImage";

export interface CatalogSource {
  providerId: string;
  id: string;
  title: string;
}

export interface CatalogItem {
  id: string;
  title: string;
  coverUrl?: string;
  description?: string;
  rating?: number;
  genres?: string[];
  isAdult?: boolean;
  releaseDate?: string;
  sources: CatalogSource[];
}

export function CatalogCard({ item, onOpen, onToggleFav, favorited, status, full, loading }: {
  item: CatalogItem;
  onOpen: () => void;
  onToggleFav?: (e: React.MouseEvent) => void;
  favorited?: boolean;
  status?: "reading" | "read";
  full?: boolean;
  /** True while comparing this item's sources to pick the one with the most
      chapters (see lib/pick-best-source.ts) — most titles have a single
      source and never hit this, so it's a rare, brief overlay. */
  loading?: boolean;
}) {
  return (
    // A native <button> drives onOpen (was a clickable <div> — unreachable and
    // uninvokable by keyboard). The favorite star is a sibling <button>, not
    // nested inside it: two interactive elements can't nest in valid HTML,
    // and browsers silently mis-parse (and mis-handle clicks on) a button
    // inside a button. This wrapping <div> keeps the same relative/group
    // positioning context so both buttons still lay out identically.
    <div
      className={cn(
        "group relative bg-white border-4 border-black rounded-xl overflow-hidden comic-shadow-sm hover:translate-y-[-4px] hover:shadow-[6px_6px_0_rgba(0,0,0,1)] hover:bg-yellow-50 transition-all",
        full ? "w-full" : "w-32 sm:w-40 shrink-0 snap-start"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={loading}
        aria-busy={loading}
        className="block w-full text-left cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-secondary disabled:cursor-wait"
      >
        <div className="relative aspect-[3/4] bg-zinc-950 border-b-4 border-black overflow-hidden">
          <SafeImage src={item.coverUrl} alt={item.title} width={320} className={cn("w-full h-full object-cover group-hover:scale-105 transition-transform", (status || loading) && "opacity-90")} loading="lazy" />
          {loading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-white animate-spin" strokeWidth={3} />
            </div>
          )}
          {status && (
            <span className={cn(
              "absolute top-1.5 left-1.5 flex items-center gap-0.5 text-white text-3xs font-display px-1.5 py-0.5 border border-black rounded",
              status === "reading" ? "bg-primary" : "bg-emerald-600"
            )}>
              {status === "reading" ? <><BookOpen className="w-2.5 h-2.5" /> LENDO</> : <><CheckCircle2 className="w-2.5 h-2.5" /> LIDO</>}
            </span>
          )}
          {item.rating !== undefined && (
            <span className="absolute bottom-1 left-1 flex items-center gap-0.5 bg-[#FFD166] text-black px-1.5 py-0.5 border border-black rounded font-display text-2xs font-black">
              <Star className="w-2.5 h-2.5 fill-black" strokeWidth={2.5} /> {(item.rating / 2).toFixed(1)}
            </span>
          )}
        </div>
        <div className="p-2">
          <h4 className="font-display text-xs sm:text-sm text-black leading-tight line-clamp-2 group-hover:text-primary">{item.title}</h4>
        </div>
      </button>
      {onToggleFav && (
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
      )}
    </div>
  );
}

export function CatalogRow({ title, children, onSeeAll }: { title: string; children: React.ReactNode; onSeeAll?: () => void }) {
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
      {/* snap-x + overscroll-x-contain: without these, a touch swipe drags
          the row to an arbitrary stop mid-card (feels "off"/floaty) and can
          bleed into the page's own scroll/edge-swipe-back gesture. */}
      <div ref={scrollerRef} className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 -mx-1 px-1 scroll-smooth snap-x snap-mandatory overscroll-x-contain [scrollbar-width:thin]">
        {children}
      </div>
    </section>
  );
}
