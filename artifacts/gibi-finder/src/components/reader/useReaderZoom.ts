import { RefObject, useEffect, useRef, useState } from "react";

interface UseReaderZoomOptions {
  /** Only bind gesture listeners while the reader is open. */
  enabled: boolean;
  /** Zoom resets to 1 whenever this key changes (e.g. chapter or mode change). */
  resetKey?: string;
  /** Maximum zoom factor (default 4x). */
  max?: number;
  /**
   * Element whose bounding box pan is clamped against — ideally the actual
   * zoomed content, not the (often larger) scroll container: a page/spread
   * is frequently narrower than the container it's centered in, and
   * clamping against the container would let it be dragged partly or fully
   * out of view. Falls back to the scroll container when omitted.
   */
  contentRef?: RefObject<HTMLElement | null>;
}

/**
 * In-reader zoom driven by touch gestures. Native pinch-zoom is unreliable inside
 * a fixed overlay and blocked in installed PWAs, so we drive the zoom ourselves.
 * Extracted (Phase 1) from MangaDexReader so any reader mode can reuse it.
 *
 * Applies via CSS `transform: scale()`, not the `zoom` property — `zoom` changes
 * the element's layout box on every touchmove, forcing a full reflow per frame,
 * which reads as janky/"stuck" mid-gesture. `transform` is compositor-only (GPU),
 * so it stays smooth continuously tracking a pinch — same technique apps like
 * Instagram/Facebook use for their photo zoom.
 *
 * Because `transform` doesn't grow the layout box the way `zoom` did, native
 * `overflow: auto` scrolling can no longer reach the part of a zoomed page that
 * extends past the viewport — so this hook also tracks `pan` (one-finger drag
 * once zoomed), clamped so the content can't be dragged entirely off-screen.
 *
 * - two-finger pinch changes zoom (growing from each usage's own fixed
 *   transform-origin) and pans by however far the pinch's own midpoint moves
 *   on screen — not a pixel-perfect "keep this exact point under the fingers"
 *   anchor (that needs knowing the transformed element's untransformed layout
 *   position too, which this hook doesn't have), but tracks a pinch closely
 *   enough to feel natural without that complexity.
 * - one-finger drag pans once zoomed in
 * (non-passive listeners so both gestures are preventable)
 *
 * Live zoom/pan are read from refs inside the listeners so they never re-attach
 * mid-gesture (which would break a continuous pinch or drag).
 */
export function useReaderZoom(
  scrollRef: RefObject<HTMLElement | null>,
  { enabled, resetKey, max = 4, contentRef }: UseReaderZoomOptions,
) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  // Reset zoom/pan on chapter / mode change.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [resetKey]);

  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;

    const clampZoom = (v: number) => Math.min(max, Math.max(1, v));
    // Once zoomed, the content is `zoom`x its own size — panning past half
    // that overhang in either direction would drag it fully off-screen.
    // Measured against contentRef (the actual zoomed content) when given —
    // the scroll container is frequently larger than the content centered
    // inside it, which would let it be dragged out of view before hitting
    // this container-sized bound.
    const clampPan = (p: { x: number; y: number }, z: number) => {
      const target = contentRef?.current || el;
      const rect = target.getBoundingClientRect();
      // Some usages apply the zoom transform directly to contentRef's own
      // element (its rect is then already zoom×'d), others apply it to a
      // child while contentRef points at a stable, untransformed wrapper
      // (its rect is already the natural 1x size). Detect which one we got
      // by checking whether this element currently carries the scale — if
      // so, back that factor out first so the overhang math below always
      // works in unscaled units regardless of which pattern the caller used.
      const isSelfTransformed = target.style.transform.includes("scale(");
      const unzoom = isSelfTransformed ? zoomRef.current : 1;
      const width = rect.width / unzoom;
      const height = rect.height / unzoom;
      const maxX = (width * (z - 1)) / 2;
      const maxY = (height * (z - 1)) / 2;
      return {
        x: Math.min(maxX, Math.max(-maxX, p.x)),
        y: Math.min(maxY, Math.max(-maxY, p.y)),
      };
    };
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    });

    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let pinchStartPan = { x: 0, y: 0 };
    let pinchStartMid = { x: 0, y: 0 };
    let dragStart: { x: number; y: number } | null = null;
    let dragStartPan = { x: 0, y: 0 };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchStartDist = dist(e.touches);
        pinchStartZoom = zoomRef.current;
        pinchStartPan = panRef.current;
        pinchStartMid = mid(e.touches);
        dragStart = null;
      } else if (e.touches.length === 1 && zoomRef.current > 1) {
        dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        dragStartPan = panRef.current;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDist > 0) {
        e.preventDefault();
        const newZoom = clampZoom(pinchStartZoom * (dist(e.touches) / pinchStartDist));
        // Scale grows from the element's own transform-origin (fixed, set
        // where each usage applies this hook's `zoom`); pan tracks the pinch
        // midpoint's own on-screen movement on top of that — simpler than
        // (and avoids the math error of) trying to keep the exact point
        // under the fingers pixel-anchored, which would need this hook to
        // know the transformed element's untransformed layout position too.
        const nowMid = mid(e.touches);
        const panX = pinchStartPan.x + (nowMid.x - pinchStartMid.x);
        const panY = pinchStartPan.y + (nowMid.y - pinchStartMid.y);
        setZoom(newZoom);
        setPan(clampPan({ x: panX, y: panY }, newZoom));
      } else if (e.touches.length === 1 && dragStart && zoomRef.current > 1) {
        e.preventDefault();
        const dx = e.touches[0].clientX - dragStart.x;
        const dy = e.touches[0].clientY - dragStart.y;
        setPan(clampPan({ x: dragStartPan.x + dx, y: dragStartPan.y + dy }, zoomRef.current));
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchStartDist = 0;
      if (e.touches.length === 1 && zoomRef.current > 1) {
        // Lifting one finger out of a pinch leaves exactly one touch still
        // down — start a drag from here instead of waiting for a fresh
        // touchstart, so pinch-then-continue-with-one-finger keeps panning.
        dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        dragStartPan = panRef.current;
      } else if (e.touches.length < 1) {
        dragStart = null;
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
  }, [enabled, resetKey, scrollRef, contentRef, max]);

  // Re-clamp pan whenever zoom changes via the +/- buttons (not just gestures)
  // so a manual zoom-out doesn't leave the pan offset stranded out of bounds.
  useEffect(() => {
    const el = contentRef?.current || scrollRef.current;
    if (!el) return;
    setPan(p => {
      const rect = el.getBoundingClientRect();
      // Same self-transformed detection as clampPan above — by the time this
      // effect runs the DOM (and zoomRef) already reflect the new `zoom`, so
      // dividing a self-transformed rect by it still correctly recovers the
      // unscaled size.
      const unzoom = el.style.transform.includes("scale(") ? zoom : 1;
      const width = rect.width / unzoom;
      const height = rect.height / unzoom;
      const maxX = (width * (zoom - 1)) / 2;
      const maxY = (height * (zoom - 1)) / 2;
      const x = Math.min(maxX, Math.max(-maxX, p.x));
      const y = Math.min(maxY, Math.max(-maxY, p.y));
      return x === p.x && y === p.y ? p : { x, y };
    });
  }, [zoom, scrollRef, contentRef]);

  return { zoom, setZoom, pan, setPan };
}
