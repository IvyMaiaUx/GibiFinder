import { Link } from "wouter";
import type { ComponentProps } from "react";
import { prefetchRoute } from "@/lib/route-prefetch";

type Props = ComponentProps<typeof Link> & {
  href?: string;
  onMouseEnter?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onTouchStart?: (e: React.TouchEvent<HTMLAnchorElement>) => void;
  [key: string]: any;
};

// Drop-in replacement for wouter's <Link> that also warms the destination
// route's lazy chunk on hover (desktop) or touchstart (mobile — fires
// before the tap completes, buying a small head start). Only swapped in
// for the persistent nav (Header/BottomNav) — the handful of routes a
// user is most likely to hover/tap toward before actually navigating.
export function PrefetchLink({ href, to, onMouseEnter, onTouchStart, ...props }: any) {
  const dest = href || to;
  const prefetch = () => { if (typeof dest === "string") prefetchRoute(dest); };
  return (
    <Link
      {...(href ? { href } : { to })}
      onMouseEnter={(e: any) => { prefetch(); onMouseEnter?.(e); }}
      onTouchStart={(e: any) => { prefetch(); onTouchStart?.(e); }}
      {...props}
    />
  );
}
