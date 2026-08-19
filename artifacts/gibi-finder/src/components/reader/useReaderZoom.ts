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
  const trRef = useRef<Tr>({ z: 1, x: 0, y: 0 });
  const raf = useRef<number | null>(null);

  const clampZoom = useCallback((v: number) => Math.min(max, Math.max(1, v)), [max]);

  const target = useCallback(
    () => contentRef?.current || scrollRef.current,
    [contentRef, scrollRef],
  );

  /** Measure the content once — see the Performance note above. */
  const measure = useCallback((): Geom | null => {
    const el = target();
    if (!el) return null;
    const { z, x, y } = trRef.current;
    const rect = el.getBoundingClientRect();

    const origin = getComputedStyle(el).transformOrigin.split(" ");
    const ox = parseFloat(origin[0] ?? "0") || 0;
    const oy = parseFloat(origin[1] ?? "0") || 0;

    // Some callers put the transform on this very element (its rect is already
    // scaled), others point `contentRef` at a stable wrapper around the scaled
    // child (rect is natural size). Back the scale out only in the first case.
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

  /**
   * Bound the pan by where the scaled content's own edges land relative to the
   * container: every part of it has to be reachable, and no edge may be dragged
   * inside the container leaving a gap. With the transform written as
   * `translate(pan) scale(z)` about origin `O`, an edge sits at
   *
   *     top    = L + pan + O*(1 - z)          bottom = L + pan + O + (size - O)*z
   *
   * so `top <= container.top` and `bottom >= container.bottom` give the range
   * directly. When the scaled content is smaller than the container the two
   * bounds cross — nothing overflows, so it stays put at 0.
   *
   * This replaces `content*(z-1)/2`, which measured the content's overhang
   * against *itself* at 1x and assumed a centred origin. Both assumptions break
   * on a real page: a comic page is fitted to the width and is usually taller
   * than the viewport, so the old bound stopped the pan well short of the
   * bottom — zooming worked, dragging to the part you zoomed for did not. A
   * cover that fits on screen whole was the one case it got right, which is why
   * it alone behaved. The cascade and the PDF scale about `center top`, where a
   * symmetric bound is wrong in the other direction: it offered travel upwards,
   * where there is nothing, and cut it short downwards, where the page is.
   */
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

  /** Update the ref synchronously; coalesce the React render to one per frame. */
  const commit = useCallback((next: Tr) => {
    trRef.current = next;
    if (raf.current !== null) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      setTr(trRef.current);
    });
  }, []);

  /** Scale about a viewport-space focal point, keeping that point anchored. */
  const zoomAbout = useCallback((nextZ: number, focal: { x: number; y: number } | null, g: Geom | null) => {
    const cur = trRef.current;
    const z2 = clampZoom(nextZ);
    if (!g || !focal) {
      commit({ z: z2, ...clampPan({ x: cur.x, y: cur.y }, z2, g) });
      return;
    }
    const px = g.ox + (focal.x - g.lx - cur.x - g.ox) / cur.z;
    const py = g.oy + (focal.y - g.ly - cur.y - g.oy) / cur.z;
    const x = focal.x - g.lx - g.ox - (px - g.ox) * z2;
    const y = focal.y - g.ly - g.oy - (py - g.oy) * z2;
    commit({ z: z2, ...clampPan({ x, y }, z2, g) });
  }, [clampZoom, clampPan, commit]);

  // Public setters. Kept in the original `{ zoom, setZoom, pan, setPan }` shape
  // so the readers' markup does not change.
  const setZoom = useCallback((v: number | ((z: number) => number)) => {
    const next = typeof v === "function" ? v(trRef.current.z) : v;
    // Toolbar zooming has no finger to anchor to, so hold the content centre.
    const g = measure();
    const focal = g ? { x: g.lx + g.ox, y: g.ly + g.oy } : null;
    zoomAbout(next, focal, g);
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
    // A pinch or a drag ends with the browser synthesising a `click` from the
    // last finger lifted. Both readers turn the page from a click on their tap
    // zones, so without this every pinch — in *or* out — also flipped the page.
    let gestured = false;
    let swallowClickUntil = 0;

    const two = () => {
      const [a, b] = [...pts.values()];
      if (!a || !b) return null;
      return {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    };

    const beginPinch = () => {
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
      // Secondary mouse buttons keep opening the context menu.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;

      if (pts.size === 1) gestured = false;
      if (pts.size === 2) {
        gestured = true;
        beginPinch();
      } else if (pts.size === 1 && trRef.current.z > 1) {
        geom = measure();
        dragFrom = { x: e.clientX, y: e.clientY };
        dragPan = { x: trRef.current.x, y: trRef.current.y };
        try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      }
    };

    const onMove = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      if (Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > 6) moved = true;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pts.size >= 2 && startDist > 0) {
        const g = two();
        if (!g) return;
        // Non-passive, so the browser's own pinch never competes with ours.
        e.preventDefault();
        const z2 = clampZoom(startZoom * (g.dist / startDist));
        if (!geom) { commit({ z: z2, x: startPan.x, y: startPan.y }); return; }
        // Anchor on the ORIGINAL midpoint's content point, re-projected onto
        // where the fingers are now: pinch and drag then compose in one gesture.
        const px = geom.ox + (startMid.x - geom.lx - startPan.x - geom.ox) / startZoom;
        const py = geom.oy + (startMid.y - geom.ly - startPan.y - geom.oy) / startZoom;
        const x = g.mid.x - geom.lx - geom.ox - (px - geom.ox) * z2;
        const y = g.mid.y - geom.ly - geom.oy - (py - geom.oy) * z2;
        commit({ z: z2, ...clampPan({ x, y }, z2, geom) });
      } else if (dragFrom && trRef.current.z > 1) {
        e.preventDefault();
        if (moved) gestured = true;
        const x = dragPan.x + (e.clientX - dragFrom.x);
        const y = dragPan.y + (e.clientY - dragFrom.y);
        commit({ z: trRef.current.z, ...clampPan({ x, y }, trRef.current.z, geom) });
      }
    };

    const onUp = (e: PointerEvent) => {
      const had = pts.delete(e.pointerId);
      try { el.releasePointerCapture(e.pointerId); } catch { /* was not captured */ }

      if (pts.size < 2) startDist = 0;

      if (pts.size === 1 && trRef.current.z > 1) {
        // Lifting one finger out of a pinch leaves one touch down — continue as
        // a drag from here so panning is not interrupted.
        const [only] = [...pts.values()];
        if (only) {
          geom = geom || measure();
          dragFrom = { ...only };
          dragPan = { x: trRef.current.x, y: trRef.current.y };
        }
      } else if (pts.size === 0) {
        dragFrom = null;

        // Double-tap: zoom in to doubleTapScale (at tap position) when at 1x,
        // or reset to 1x when already zoomed in.
        if (had && doubleTap && !moved) {
          const now = Date.now();
          const p = { x: e.clientX, y: e.clientY };
          const near = Math.hypot(p.x - lastTapPos.x, p.y - lastTapPos.y) < 45;
          if (now - lastTapAt < 320 && near) {
            const nextZ = trRef.current.z > 1.05 ? 1 : Math.min(max, doubleTapScale);
            zoomAbout(nextZ, nextZ > 1 ? p : null, measure());
            gestured = true;
            lastTapAt = 0;
          } else {
            lastTapAt = now;
            lastTapPos = p;
          }
        }

        // The synthesised click arrives right after this; give it a window.
        if (gestured) swallowClickUntil = Date.now() + 450;
        gestured = false;
      }
    };

    // Trackpad pinch arrives as wheel+ctrlKey. A plain wheel is left alone so
    // the cascade keeps scrolling normally.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAbout(trRef.current.z * Math.exp(-e.deltaY * 0.0022), { x: e.clientX, y: e.clientY }, measure());
    };

    // Swallow the click a gesture leaves behind, before it reaches the tap
    // zones. Capture phase, so it never gets to the reader's own handler.
    const onClickCapture = (ev: MouseEvent) => {
      if (Date.now() >= swallowClickUntil) return;
      swallowClickUntil = 0;
      ev.stopPropagation();
      ev.preventDefault();
    };

    // Safari raises these for a pinch and would zoom the whole overlay.
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
    };
  }, [enabled, resetKey, scrollRef, max, doubleTap, doubleTapScale, measure, clampZoom, clampPan, commit, zoomAbout]);

  // Stable identity so consumers can depend on `pan` without re-running effects.
  const pan = useMemo(() => ({ x: tr.x, y: tr.y }), [tr.x, tr.y]);

  return { zoom: tr.z, setZoom, pan, setPan };
}
