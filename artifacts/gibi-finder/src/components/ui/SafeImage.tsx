import { useState, useEffect } from "react";
import { ImageOff } from "lucide-react";
import { proxyCoverUrl } from "@/lib/utils";
import { bumpStat } from "@/components/reader/readerStats";

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt: string;
  className?: string;
  /** Fired when a real src was given but every load attempt failed (broken cover). */
  onBroken?: () => void;
  /** Requests a server-resized thumbnail at this width (px) via the image
      proxy — pass the card/thumbnail's actual render width, not the source's
      full resolution. Omit for full-size covers (hero, detail pages). */
  width?: number;
}

export function SafeImage({ src, alt, className, onLoad, onBroken, width, ...props }: SafeImageProps) {
  // Lazy-init with the proxied URL so the <img> renders on first paint without
  // going through an intermediate undefined→url transition (eliminates the brief
  // white/placeholder flash when the component mounts or remounts).
  const [currentSrc, setCurrentSrc] = useState<string | undefined>(() => src ? proxyCoverUrl(src, width) : undefined);
  const [retryStage, setRetryStage] = useState<0 | 1 | 2>(0); // 0: proxied, 1: original direct, 2: failed placeholder

  useEffect(() => {
    if (src) {
      setCurrentSrc(proxyCoverUrl(src, width));
      setRetryStage(0);
    } else {
      setCurrentSrc(undefined);
      setRetryStage(2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, width]);

  const handleError = () => {
    if (retryStage === 0 && src) {
      // Stage 1 failed (proxy). Fall back to Stage 2 (original URL directly in browser)
      bumpStat("retried");
      setCurrentSrc(src);
      setRetryStage(1);
    } else {
      // Stage 2 also failed. Go to Stage 3 (placeholder)
      bumpStat("failed");
      setRetryStage(2);
      if (src) onBroken?.(); // had a URL but it never loaded → broken cover
    }
  };

  if (retryStage === 2 || !currentSrc) {
    // A blank gradient box with just the title's first letter used to stand
    // in for a missing cover — at catalog-card size (~120-160px) it reads
    // as a rendering bug, not "this one just has no cover art". A dashed
    // "no photo" panel + short label makes clear it's an expected, known
    // state. Icon size is relative (%) so it scales with the card; the
    // label stays a small fixed size since it needs to stay legible rather
    // than shrink toward unreadable on the smallest catalog thumbnails.
    //
    // retryStage reaches 2 two different ways — no `src` was ever given, or
    // a real `src` was given and every attempt to load it failed — and
    // collapsing both into "Sem capa" quietly hid the second, actually
    // broken case. `src` (the prop, not `currentSrc`) still holds which one
    // this is, so the label can say which it actually is.
    const isBroken = retryStage === 2 && !!src;
    return (
      <div className={`${className || "w-full h-full"} relative flex flex-col items-center justify-center gap-[6%] overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-950 border border-dashed border-white/10 select-none p-[8%]`}>
        <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(white_1px,transparent_1px)] [background-size:10px_10px]" />
        <ImageOff className="relative w-[26%] h-[26%] min-w-4 min-h-4 text-white/30 shrink-0" strokeWidth={1.5} />
        <span className="relative font-display text-[9px] text-white/55 uppercase tracking-wide text-center line-clamp-2 leading-tight">
          {isBroken ? "Capa indisponível" : (alt || "Sem capa")}
        </span>
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      decoding="async"
      {...props}
      onLoad={(e) => { bumpStat("loaded"); onLoad?.(e); }}
      onError={handleError}
    />
  );
}
