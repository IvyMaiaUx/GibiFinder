import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

interface UseReaderZoomOptions {
  /** Only bind gesture listeners while the reader is open. */
  enabled: boolean;
  /** Zoom resets to 1 whenever this key changes (e.g. chapter or mode change). */
  resetKey?: string;
  /** Maximum zoom factor (default 4x). */
  max?: number;
  /** Enable double-tap-to-zoom (default true). */
  doubleTap?: boolean;
  /** Scale a double-tap jumps to from fit (default 2.5x, capped by `max`). */
  doubleTapScale?: number;
  /**
   * Element whose bounding box pan is clamped against — ideally the actual
   * zoomed content, not the (often larger) scroll container: a page/spread
   * is frequently narrower than the container it's centered in, and
   * clamping against the container would let it be dragged partly or fully
   * out of view. Falls back to the scroll container when omitted.
   *
   * This element is also what the focal-point maths measures, so passing it
   * is what makes a pinch anchor properly.
   */
  contentRef?: RefObject<HTMLElement | null>;
}

interface Tr {
  z: number;
  x: number;
  y: number;
}

/** Geometry captured once per gesture so no frame forces a re-layout. */
interface Geom {
  /** Viewport position of the content's border box with no transform applied. */
  lx: number;
  ly: number;
  /** transform-origin in element-local, unscaled px. */
  ox: number;
  oy: number;
  /** Unscaled content size, for the pan bounds. */
  w: number;
  h: number;
  /** Viewport edges of the visible box the content is panned inside. */
  cl: number;
  cr: number;
  ct: number;
  cb: number;
}

/**
 * In-reader zoom driven by pointer gestures. Native pinch-zoom is unreliable
 * inside a fixed overlay and blocked in installed PWAs, so we drive it ourselves.
 *
 * Applies via CSS `transform: scale()`, not the `zoom` property — `zoom` changes
 * the element's layout box on every move, forcing a full reflow per frame, which
 * reads as janky mid-gesture. `transform` is compositor-only (GPU).
 *
 * Because `transform` doesn't grow the layout box the way `zoom` did, native
 * `overflow: auto` scrolling can no longer reach the part of a zoomed page that
 * extends past the viewport — so this hook also tracks `pan`, clamped so the
 * content can't be dragged off-screen.
 *
 * Focal point
 * -----------
 * A pinch keeps the content point that started under the fingers under the
 * fingers, rather than growing from a fixed origin and merely following the
 * midpoint's drift. With `transform: translate(pan) scale(z)` about an origin
 * `O`, an element-local point `p` lands at:
 *
 *     screen = L + pan + O + (p - O) * z
 *
 * where `L` is the element's untransformed viewport position. Solving for `p`
 * at the current scale and re-solving `pan` at the new one anchors it:
 *
 *     p    = O + (f - L - pan - O) / z
 *     pan' = f - L - O - (p - O) * z'
 *
 * `O` is read from the computed style rather than assumed, because the callers
 * use different origins ("center top" for the cascade column, "left top" for a
 * split spread, centre for a single page) and each needs its own maths.
 *
 * `L` is recovered from the live rect instead of `offsetLeft`, so it is correct
 * regardless of which element is positioned or how it is nested:
 *
 *     rect.left = L + pan + O * (1 - z)   =>   L = rect.left - pan - O * (1 - z)
 *
 * Performance
 * -----------
 * Geometry is measured once per gesture (a `getBoundingClientRect()` per frame
 * forces a synchronous layout), the live transform lives in a ref that handlers
 * read synchronously, and React state is coalesced to at most one update per
 * animation frame instead of two per pointer event.
 */
export function useReaderZoom(
  scrollRef: RefObject<HTMLElement | null>,
  { enabled, resetKey, max = 4, doubleTap = true, doubleTapScale = 2.5, contentRef }: UseReaderZoomOptions,
) {
  const [tr, setTr] = useState<Tr>({ z: 1, x: 0, y: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  const trRef = useRef<Tr>({ z: 1, x: 0, y: 0 });
  const raf = useRef<number | null>(null);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flingRaf = useRef<number | null>(null);

  const clampZoom = useCallback((v: number) => Math.min(max, Math.max(1, v)), [max]);

  const target = useCallback(
    () => contentRef?.current || scrollRef.current,
    [contentRef, scrollRef],
  );

  /** Measure the content once per gesture */
  const measure = useCallback((): Geom | null => {
    const el = target();
    if (!el) return null;
    const { z, x, y } = trRef.current;
    const rect = el.getBoundingClientRect();

    const origin = getComputedStyle(el).transformOrigin.split(" ");
    const ox = parseFloat(origin[0] ?? "0") || 0;
    const oy = parseFloat(origin[1] ?? "0") || 0;

    const selfScaled = el.style.transform.includes("scale(");
    const w = selfScaled ? rect.width / z : rect.width;
    const h = selfScaled ? rect.height / z : rect.height;

    const crect = (scrollRef.current || el).getBoundingClientRect();

    return {
      lx: rect.left - x - ox * (1 - z),
      ly: rect.top - y - oy * (1 - z),
      ox,
      oy,
      w,
      h,
      cl: crect.left,
      cr: crect.right,
      ct: crect.top,
      cb: crect.bottom,
    };
  }, [target, scrollRef]);

  /** Clamped pan bounds so image edges cannot be dragged into empty screen space */
  const clampPan = useCallback((p: { x: number; y: number }, z: number, g: Geom | null) => {
    if (!g) return p;
    const axis = (v: number, l: number, o: number, size: number, near: number, far: number) => {
      const upper = near - l - o * (1 - z);
      const lower = far - l - o - (size - o) * z;
      if (lower > upper) return 0;
      return Math.min(upper, Math.max(lower, v));
    };
    return {
      x: axis(p.x, g.lx, g.ox, g.w, g.cl, g.cr),
      y: axis(p.y, g.ly, g.oy, g.h, g.ct, g.cb),
    };
  }, []);

  const triggerAnimation = useCallback((duration = 260) => {
    if (animTimer.current) clearTimeout(animTimer.current);
    setIsAnimating(true);
    animTimer.current = setTimeout(() => {
      setIsAnimating(false);
      animTimer.current = null;
    }, duration);
  }, []);

  const commit = useCallback((next: Tr, animate = false) => {
    if (flingRaf.current) {
      cancelAnimationFrame(flingRaf.current);
      flingRaf.current = null;
    }
    if (animate) {
      triggerAnimation(260);
    }
    trRef.current = next;
    if (raf.current !== null) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      setTr(trRef.current);
    });
  }, [triggerAnimation]);

  /** Scale about a viewport-space focal point, keeping that point anchored */
  const zoomAbout = useCallback(
    (nextZ: number, focal: { x: number; y: number } | null, g: Geom | null, animate = false) => {
      const cur = trRef.current;
      const z2 = clampZoom(nextZ);
      if (z2 <= 1.001) {
        commit({ z: 1, x: 0, y: 0 }, animate);
        return;
      }
      if (!g || !focal) {
        commit({ z: z2, ...clampPan({ x: cur.x, y: cur.y }, z2, g) }, animate);
        return;
      }
      const px = g.ox + (focal.x - g.lx - cur.x - g.ox) / cur.z;
      const py = g.oy + (focal.y - g.ly - cur.y - g.oy) / cur.z;
      const x = focal.x - g.lx - g.ox - (px - g.ox) * z2;
      const y = focal.y - g.ly - g.oy - (py - g.oy) * z2;
      commit({ z: z2, ...clampPan({ x, y }, z2, g) }, animate);
    },
    [clampZoom, clampPan, commit],
  );

  // Public setters
  const setZoom = useCallback((v: number | ((z: number) => number)) => {
    const next = typeof v === "function" ? v(trRef.current.z) : v;
    const g = measure();
    const focal = g ? { x: g.lx + g.ox, y: g.ly + g.oy } : null;
    zoomAbout(next, focal, g, true);
  }, [measure, zoomAbout]);

  const setPan = useCallback((v: { x: number; y: number } | ((p: { x: number; y: number }) => { x: number; y: number })) => {
    const cur = trRef.current;
    const next = typeof v === "function" ? v({ x: cur.x, y: cur.y }) : v;
    commit({ z: cur.z, ...clampPan(next, cur.z, measure()) });
  }, [clampPan, commit, measure]);

  // Reset zoom/pan on chapter / mode change.
  useEffect(() => {
    trRef.current = { z: 1, x: 0, y: 0 };
    setTr({ z: 1, x: 0, y: 0 });
    setIsAnimating(false);
  }, [resetKey]);

  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;

    const pts = new Map<number, { x: number; y: number }>();
    let geom: Geom | null = null;
    let startDist = 0;
    let startZoom = 1;
    let startMid = { x: 0, y: 0 };
    let startPan = { x: 0, y: 0 };
    let dragFrom: { x: number; y: number } | null = null;
    let dragPan = { x: 0, y: 0 };
    let lastTapAt = 0;
    let lastTapPos = { x: 0, y: 0 };
    let moved = false;
    let gestured = false;
    let swallowClickUntil = 0;

    let lastMoves: { x: number; y: number; t: number }[] = [];

    const two = () => {
      const [a, b] = [...pts.values()];
      if (!a || !b) return null;
      return {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    };

    const beginPinch = () => {
      if (flingRaf.current) {
        cancelAnimationFrame(flingRaf.current);
        flingRaf.current = null;
      }
      setIsAnimating(false);
      const g = two();
      if (!g) return;
      geom = measure();
      startDist = g.dist;
      startMid = g.mid;
      startZoom = trRef.current.z;
      startPan = { x: trRef.current.x, y: trRef.current.y };
      dragFrom = null;
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (flingRaf.current) {
        cancelAnimationFrame(flingRaf.current);
        flingRaf.current = null;
      }
      setIsAnimating(false);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
      lastMoves = [{ x: e.clientX, y: e.clientY, t: performance.now() }];

      if (pts.size === 1) gestured = false;
      if (pts.size === 2) {
        gestured = true;
        beginPinch();
      } else if (pts.size === 1 && trRef.current.z > 1.01) {
        geom = measure();
        dragFrom = { x: e.clientX, y: e.clientY };
        dragPan = { x: trRef.current.x, y: trRef.current.y };
        try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
    };

    const onMove = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      if (Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > 4) moved = true;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const now = performance.now();
      lastMoves.push({ x: e.clientX, y: e.clientY, t: now });
      if (lastMoves.length > 5) lastMoves.shift();

      if (pts.size >= 2 && startDist > 0) {
        const g = two();
        if (!g) return;
        e.preventDefault();

        // Rubber-band resistance when pinching past limits
        const rawScale = startZoom * (g.dist / startDist);
        let z2 = rawScale;
        if (rawScale < 1) {
          z2 = 1 - (1 - rawScale) * 0.4;
        } else if (rawScale > max) {
          z2 = max + (rawScale - max) * 0.3;
        }

        if (!geom) { commit({ z: z2, x: startPan.x, y: startPan.y }); return; }

        const px = geom.ox + (startMid.x - geom.lx - startPan.x - geom.ox) / startZoom;
        const py = geom.oy + (startMid.y - geom.ly - startPan.y - geom.oy) / startZoom;
        const x = g.mid.x - geom.lx - geom.ox - (px - geom.ox) * z2;
        const y = g.mid.y - geom.ly - geom.oy - (py - geom.oy) * z2;
        commit({ z: z2, x, y });
      } else if (dragFrom && trRef.current.z > 1.01) {
        e.preventDefault();
        if (moved) gestured = true;
        const x = dragPan.x + (e.clientX - dragFrom.x);
        const y = dragPan.y + (e.clientY - dragFrom.y);
        commit({ z: trRef.current.z, ...clampPan({ x, y }, trRef.current.z, geom) });
      }
    };

    const onUp = (e: PointerEvent) => {
      const had = pts.delete(e.pointerId);
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

      if (pts.size < 2 && startDist > 0) {
        startDist = 0;
        // Rubber-band snapback on pinch release
        const curZ = trRef.current.z;
        if (curZ < 1.05) {
          commit({ z: 1, x: 0, y: 0 }, true);
          gestured = true;
          swallowClickUntil = Date.now() + 450;
        } else if (curZ > max) {
          const g = geom || measure();
          zoomAbout(max, null, g, true);
          gestured = true;
          swallowClickUntil = Date.now() + 450;
        } else {
          const g = geom || measure();
          const curPan = { x: trRef.current.x, y: trRef.current.y };
          const clamped = clampPan(curPan, curZ, g);
          if (clamped.x !== curPan.x || clamped.y !== curPan.y) {
            commit({ z: curZ, ...clamped }, true);
          }
        }
      }

      if (pts.size === 1 && trRef.current.z > 1.01) {
        const [only] = [...pts.values()];
        if (only) {
          geom = geom || measure();
          dragFrom = { ...only };
          dragPan = { x: trRef.current.x, y: trRef.current.y };
        }
      } else if (pts.size === 0) {
        // Fling momentum on drag release
        if (dragFrom && moved && trRef.current.z > 1.05 && lastMoves.length >= 2) {
          const first = lastMoves[0];
          const last = lastMoves[lastMoves.length - 1];
          const dt = (last.t - first.t) / 1000;
          if (dt > 0.01 && dt < 0.3) {
            let vx = ((last.x - first.x) / dt) * 0.35;
            let vy = ((last.y - first.y) / dt) * 0.35;
            const speed = Math.hypot(vx, vy);
            if (speed > 150) {
              const g = geom || measure();
              const flingStep = () => {
                vx *= 0.92;
                vy *= 0.92;
                if (Math.hypot(vx, vy) < 15) {
                  flingRaf.current = null;
                  return;
                }
                const cur = trRef.current;
                const nextPan = clampPan({ x: cur.x + vx * 0.016, y: cur.y + vy * 0.016 }, cur.z, g);
                commit({ z: cur.z, ...nextPan });
                flingRaf.current = requestAnimationFrame(flingStep);
              };
              flingRaf.current = requestAnimationFrame(flingStep);
            }
          }
        }

        dragFrom = null;

        // Double-tap zoom toggle with Google Photos / FB smooth animation
        if (had && doubleTap && !moved) {
          const now = Date.now();
          const p = { x: e.clientX, y: e.clientY };
          const near = Math.hypot(p.x - lastTapPos.x, p.y - lastTapPos.y) < 45;
          if (now - lastTapAt < 320 && near) {
            const nextZ = trRef.current.z > 1.05 ? 1 : Math.min(max, doubleTapScale);
            zoomAbout(nextZ, nextZ > 1 ? p : null, measure(), true);
            gestured = true;
            lastTapAt = 0;
            swallowClickUntil = Date.now() + 450;
          } else {
            lastTapAt = now;
            lastTapPos = p;
          }
        }

        if (gestured) swallowClickUntil = Date.now() + 450;
        gestured = false;
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAbout(trRef.current.z * Math.exp(-e.deltaY * 0.0022), { x: e.clientX, y: e.clientY }, measure());
    };

    const onClickCapture = (ev: MouseEvent) => {
      if (Date.now() >= swallowClickUntil) return;
      swallowClickUntil = 0;
      ev.stopPropagation();
      ev.preventDefault();
    };

    const stopGesture = (ev: Event) => ev.preventDefault();

    el.addEventListener("click", onClickCapture, true);
    el.addEventListener("pointerdown", onDown, { passive: true });
    el.addEventListener("pointermove", onMove, { passive: false });
    el.addEventListener("pointerup", onUp, { passive: true });
    el.addEventListener("pointercancel", onUp, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", stopGesture);
    el.addEventListener("gesturechange", stopGesture);
    return () => {
      el.removeEventListener("click", onClickCapture, true);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", stopGesture);
      el.removeEventListener("gesturechange", stopGesture);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      if (animTimer.current !== null) clearTimeout(animTimer.current);
      if (flingRaf.current !== null) cancelAnimationFrame(flingRaf.current);
    };
  }, [enabled, resetKey, scrollRef, max, doubleTap, doubleTapScale, measure, clampZoom, clampPan, commit, zoomAbout]);

  const pan = useMemo(() => ({ x: tr.x, y: tr.y }), [tr.x, tr.y]);

  return { zoom: tr.z, setZoom, pan, setPan, isAnimating };
}
