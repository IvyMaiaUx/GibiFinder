import { RefObject, useEffect, useRef, useState } from "react";

interface UseReaderZoomOptions {
  /** Only bind gesture listeners while the reader is open. */
  enabled: boolean;
  /** Zoom resets to 1 whenever this key changes (e.g. chapter or mode change). */
  resetKey?: string;
  /** Maximum zoom factor (default 4x). */
  max?: number;
  /** Enable double-tap-to-zoom (default true). */
  doubleTap?: boolean;
}

/**
 * In-reader zoom driven by touch gestures. Native pinch-zoom is unreliable inside
 * a fixed overlay and blocked in installed PWAs, so we drive a CSS `zoom` value
 * ourselves. Extracted (Phase 1) from MangaDexReader so any reader mode can reuse it.
 *
 * - two-finger pinch (non-passive listener so the gesture is preventable)
 * - double-tap toggles 1x / 2.5x
 *
 * The live zoom is read from a ref inside the listeners so they never re-attach
 * mid-gesture (which would break a continuous pinch).
 */
export function useReaderZoom(
  scrollRef: RefObject<HTMLElement | null>,
  { enabled, resetKey, max = 4, doubleTap = true }: UseReaderZoomOptions,
) {
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Reset zoom on chapter / mode change.
  useEffect(() => {
    setZoom(1);
  }, [resetKey]);

  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;

    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let lastTap = 0;
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const clamp = (v: number) => Math.min(max, Math.max(1, v));

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchStartDist = dist(e.touches);
        pinchStartZoom = zoomRef.current;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDist > 0) {
        e.preventDefault();
        setZoom(clamp(pinchStartZoom * (dist(e.touches) / pinchStartDist)));
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchStartDist = 0;
      if (doubleTap && e.changedTouches.length === 1 && e.touches.length === 0) {
        const now = Date.now();
        if (now - lastTap < 300) {
          setZoom(zoomRef.current > 1 ? 1 : Math.min(2.5, max));
          lastTap = 0;
        } else {
          lastTap = now;
        }
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled, resetKey, scrollRef, max, doubleTap]);

  return { zoom, setZoom };
}
