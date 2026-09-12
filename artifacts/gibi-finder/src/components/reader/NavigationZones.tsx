import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavigationZonesProps {
  /** The viewport element the pointer is tracked over. */
  containerRef: RefObject<HTMLElement | null>;
  /** Zones only mean anything while the image is at its fit level. */
  enabled: boolean;
  /** Whether a click on that side would actually go somewhere. */
  leftActive: boolean;
  rightActive: boolean;
}

/**
 * The discreet ‹ › affordance over the reading area.
 *
 * Purely visual, and deliberately `pointer-events: none` end to end: the click
 * itself is resolved inside MediaViewport, from the engine's own click event.
 * An overlay that swallowed pointers would also swallow the drag that pans a
 * magnified page — the exact conflict between navigation and image
 * manipulation this reader is built to avoid.
 *
 * Hover is therefore tracked by listening on the viewport instead of relying on
 * `:hover`, and the zone state only ever changes when the pointer crosses from
 * one third into another, so a mouse sweeping across the page costs at most two
 * renders of this small component and none of the reader around it.
 */
export function NavigationZones({ containerRef, enabled, leftActive, rightActive }: NavigationZonesProps) {
  const [side, setSide] = useState<"left" | "right" | null>(null);
  const sideRef = useRef<"left" | "right" | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    // Touch has no hover, and showing the chevrons on tap would just flash
    // them at the moment the page is already turning.
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) return;

    const set = (next: "left" | "right" | null) => {
      if (sideRef.current === next) return;
      sideRef.current = next;
      setSide(next);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const box = element.getBoundingClientRect();
      const x = event.clientX - box.left;
      set(x < box.width * 0.33 ? "left" : x > box.width * 0.67 ? "right" : null);
    };
    const onLeave = () => set(null);

    element.addEventListener("pointermove", onMove, { passive: true });
    element.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
      set(null);
    };
  }, [containerRef]);

  const show = (which: "left" | "right") =>
    enabled && side === which && (which === "left" ? leftActive : rightActive);

  return (
    <div className="absolute inset-0 pointer-events-none z-[5]" aria-hidden="true">
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-[22%] flex items-center pl-3 transition-opacity duration-200",
          "bg-gradient-to-r from-black/25 to-transparent",
          show("left") ? "opacity-100" : "opacity-0",
        )}
      >
        <ChevronLeft className="w-9 h-9 text-white/85 drop-shadow-md" strokeWidth={2} />
      </div>
      <div
        className={cn(
          "absolute inset-y-0 right-0 w-[22%] flex items-center justify-end pr-3 transition-opacity duration-200",
          "bg-gradient-to-l from-black/25 to-transparent",
          show("right") ? "opacity-100" : "opacity-0",
        )}
      >
        <ChevronRight className="w-9 h-9 text-white/85 drop-shadow-md" strokeWidth={2} />
      </div>
    </div>
  );
}
