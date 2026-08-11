import { Link } from "wouter";
import type { ComponentProps } from "react";
import { prefetchRoute } from "@/lib/route-prefetch";

type Props = ComponentProps<typeof Link>;

// Drop-in replacement for wouter's <Link> that also warms the destination
// route's lazy chunk on hover (desktop) or touchstart (mobile — fires
// before the tap completes, buying a small head start). Only swapped in
// for the persistent nav (Header/BottomNav) — the handful of routes a
// user is most likely to hover/tap toward before actually navigating.
export function PrefetchLink({ href, onMouseEnter, onTouchStart, ...props }: Props) {
  const prefetch = () => { if (typeof href === "string") prefetchRoute(href); };
  return (
    <Link
      href={href}
      onMouseEnter={(e: React.MouseEvent) => { prefetch(); onMouseEnter?.(e); }}
      onTouchStart={(e: React.TouchEvent) => { prefetch(); onTouchStart?.(e); }}
      {...props}
    />
  );
}
