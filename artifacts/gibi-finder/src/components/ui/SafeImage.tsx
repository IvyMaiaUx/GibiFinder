import { useState, useEffect } from "react";
import { proxyCoverUrl } from "@/lib/utils";
import { bumpStat } from "@/components/reader/readerStats";

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt: string;
  className?: string;
  /** Fired when a real src was given but every load attempt failed (broken cover). */
  onBroken?: () => void;
}

export function SafeImage({ src, alt, className, onLoad, onBroken, ...props }: SafeImageProps) {
  const [currentSrc, setCurrentSrc] = useState<string | undefined>(undefined);
  const [retryStage, setRetryStage] = useState<0 | 1 | 2>(0); // 0: proxied, 1: original direct, 2: failed placeholder

  useEffect(() => {
    if (src) {
      setCurrentSrc(proxyCoverUrl(src));
      setRetryStage(0);
    } else {
      setCurrentSrc(undefined);
      setRetryStage(2);
    }
  }, [src]);

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
    return (
      <div className={`${className || "w-full h-full"} flex items-center justify-center font-display text-4xl text-white/20 select-none bg-gradient-to-br from-zinc-900 to-zinc-950`}>
        {(alt || "?").charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      {...props}
      onLoad={(e) => { bumpStat("loaded"); onLoad?.(e); }}
      onError={handleError}
    />
  );
}
