import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from "react";
import type { Rect, TileSourceSpecifier, Viewer } from "openseadragon";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { forgetPageImage, loadPageImage, type PageImage } from "./imageCache";

/**
 * MediaViewport — the reader's dedicated image surface.
 *
 * Why an engine instead of `transform: scale()`
 * ---------------------------------------------
 * The previous page-mode reader scaled a DOM <img> and tracked pan by hand.
 * That works until the interactions have to compose: a pinch that is also a
 * drag, a wheel anchored on the cursor, bounds that stay honest when the page
 * is taller than the viewport, a spread scaling as one piece. Each of those was
 * a separate fix in the old hook. OpenSeadragon already solves the whole set —
 * springs, constraints, focal-point zoom, pinch — against a canvas that never
 * touches document layout, which is the actual requirement here: zoom must not
 * change any element's width, height or scroll geometry.
 *
 * Full-resolution images are handed straight to it (`type: "image"`); no Deep
 * Zoom, no tiles, no change to how pages are fetched.
 *
 * What is deliberately NOT OpenSeadragon's
 * ----------------------------------------
 * - Wheel zoom. OSD's own scroll-to-zoom steps by a fixed factor per event,
 *   which a trackpad (dozens of tiny events per flick) turns into a runaway.
 *   Ours is proportional to the normalised delta, so a mouse notch is one
 *   comfortable step and a trackpad glide is continuous.
 * - Double click. OSD zooms in on every double click; a reader wants a toggle
 *   between fit and a close-up of the exact point clicked.
 * - Single click. It belongs to the reader's navigation zones, not to zooming.
 * - Keyboard. Handled once by the reader for the whole overlay, so OSD's own
 *   arrow / +/- bindings are unhooked to stop two handlers fighting.
 *
 * React state
 * -----------
 * Nothing about the live transform lives in React. Zoom and pan run inside the
 * engine; the only things that escape are a throttled zoom readout written
 * straight into a DOM node and an `atFit` boolean that flips at most once per
 * gesture. No component re-renders while a pinch or a drag is in flight.
 */

export type ViewportFit = "page" | "width" | "height";

export interface ViewportItem {
  /** Stable identity for the page (its index is fine). */
  key: string;
  /** The provider's page URL. Proxying and fallback are handled internally. */
  url: string;
  /** Show only one half of the image — the manual spread split. */
  half?: "first" | "second" | null;
}

export interface MediaViewportHandle {
  zoomIn(): void;
  zoomOut(): void;
  /** Back to the current fit, centred, animated. */
  reset(): void;
  isAtFit(): boolean;
}

interface MediaViewportProps {
  /** One item for a single page, two for a double spread (visual order). */
  items: ViewportItem[];
  fit: ViewportFit;
  /** Ceiling for zoom, as a multiple of the fit level. */
  maxZoomRatio: number;
  /** Keep the current zoom/pan across an item change instead of re-fitting. */
  preserveView?: boolean;
  /** A quick click on the left / centre / right third, only while at fit. */
  onZone?: (zone: 0 | 1 | 2) => void;
  /** A touch swipe, only when the image itself has no horizontal travel left. */
  onSwipe?: (dir: -1 | 1) => void;
  /** Fires when the viewport enters or leaves the fit level. */
  onFitChange?: (atFit: boolean) => void;
  /** True while a pointer is down — lets the chrome hold still during a gesture. */
  onGesture?: (active: boolean) => void;
  /** Natural size of a page, as soon as it is known. */
  onMeta?: (key: string, width: number, height: number) => void;
  /** Live zoom readout is written here as text — no re-render per frame. */
  zoomLabelRef?: RefObject<HTMLElement | null>;
  background?: string;
  className?: string;
  ariaLabel?: string;
}

type OSDNamespace = typeof import("openseadragon");

/** Zoom a double click jumps to, as a multiple of the fit level. */
const DOUBLE_CLICK_SCALE = 2.5;
/** OSD's double-click window. A zone click waits this out before it navigates. */
const DOUBLE_CLICK_MS = 220;
/** Gap between the two pages of a spread, in viewport units (page height = 1). */
const SPREAD_GAP = 0.012;
/** Below this the spinner never appears — a cached page swaps faster than this. */
const SPINNER_DELAY_MS = 180;

function MediaViewportInner(
  {
    items,
    fit,
    maxZoomRatio,
    preserveView = false,
    onZone,
    onSwipe,
    onFitChange,
    onGesture,
    onMeta,
    zoomLabelRef,
    background = "var(--rd-bg, #0b0b0d)",
    className,
    ariaLabel,
  }: MediaViewportProps,
  ref: Ref<MediaViewportHandle>,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const osdRef = useRef<OSDNamespace | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const [engineReady, setEngineReady] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [showSpinner, setShowSpinner] = useState(false);
  const [attempt, setAttempt] = useState(0);

  /** Zoom level at the current fit — every ratio in here is relative to this. */
  const baseZoomRef = useRef(1);
  const atFitRef = useRef(true);
  /**
   * Whether the reader *asked* to be at fit, as opposed to happening to be
   * there right now. The two differ for the length of an animation, and a
   * resize arriving in that window must not mistake a spring in mid-flight for
   * "the user has zoomed in" — that is what used to freeze a rotation halfway
   * into the transition it was playing.
   */
  const wantsFitRef = useRef(true);
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  /** Bounds carried across an item change when `preserveView` is on. */
  const keptBoundsRef = useRef<Rect | null>(null);

  // Handlers are attached once, for the life of the viewer, and read the
  // current props from here — re-attaching them on every render would mean
  // tearing the engine's event wiring down mid-gesture.
  const propsRef = useRef({ items, fit, maxZoomRatio, preserveView, onZone, onSwipe, onFitChange, onGesture, onMeta, zoomLabelRef });
  propsRef.current = { items, fit, maxZoomRatio, preserveView, onZone, onSwipe, onFitChange, onGesture, onMeta, zoomLabelRef };

  const signature = items.map(item => `${item.key}|${item.url}|${item.half ?? ""}`).join("~");

  /* ---------------------------------------------------------------- geometry */

  /**
   * The rectangle the current fit shows. Fit Page is the content itself; Fit
   * Width is a viewport-shaped box as wide as the content, anchored at its top
   * (a comic page is read downwards, so the top is where it should start).
   */
  const fitRect = useCallback((): Rect | null => {
    const viewer = viewerRef.current;
    const osd = osdRef.current;
    if (!viewer || !osd || viewer.world.getItemCount() === 0) return null;
    const home = viewer.world.getHomeBounds();
    const aspect = viewer.viewport.getAspectRatio();
    switch (propsRef.current.fit) {
      case "width":
        return new osd.Rect(home.x, home.y, home.width, home.width / aspect);
      case "height": {
        const width = home.height * aspect;
        return new osd.Rect(home.x + (home.width - width) / 2, home.y, width, home.height);
      }
      default:
        return home;
    }
  }, []);

  /**
   * The zoom `fitBounds` will land on, computed rather than read back: after an
   * animated fit the spring has not arrived yet, and everything downstream (the
   * zoom ceiling, the readout, the at-fit test) needs the destination, not the
   * frame currently on screen.
   */
  const zoomForRect = useCallback((rect: Rect): number => {
    const viewer = viewerRef.current;
    if (!viewer) return 1;
    const aspect = viewer.viewport.getAspectRatio();
    const effectiveWidth = rect.width / rect.height >= aspect ? rect.width : rect.height * aspect;
    return effectiveWidth > 0 ? 1 / effectiveWidth : 1;
  }, []);

  /**
   * Zoom ceiling. At least the user's preference (a multiple of fit), but never
   * below 1:1 with the page's own pixels — a low-resolution scan should still
   * be inspectable at its real size — and never so far past it that the reader
   * ends up lost in a mush of upscaled pixels.
   */
  const updateZoomLimits = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.world.getItemCount() === 0) return;
    const home = viewer.viewport.getHomeZoom();
    if (!(home > 0)) return;
    let nativeRatio = 1;
    try {
      const native = viewer.viewport.imageToViewportZoom(1);
      if (native > 0) nativeRatio = native / home;
    } catch { /* content size not known yet */ }
    const ratio = Math.min(10, Math.max(propsRef.current.maxZoomRatio, Math.min(nativeRatio, 8)));
    (viewer.viewport as unknown as { maxZoomLevel: number }).maxZoomLevel = home * ratio;
  }, []);

  const applyFit = useCallback((immediately: boolean) => {
    const viewer = viewerRef.current;
    const rect = fitRect();
    if (!viewer || !rect) return;
    wantsFitRef.current = true;
    baseZoomRef.current = zoomForRect(rect);
    viewer.viewport.fitBounds(rect, immediately);
    viewer.viewport.applyConstraints(immediately);
  }, [fitRect, zoomForRect]);

  /** Does the image still have somewhere to go on each axis? */
  const slack = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.world.getItemCount() === 0) return { x: false, y: false };
    const world = viewer.world.getHomeBounds();
    const view = viewer.viewport.getBounds(true);
    return {
      x: world.width - view.width > Math.max(world.width, view.width) * 0.01,
      y: world.height - view.height > Math.max(world.height, view.height) * 0.01,
    };
  }, []);

  const updateCursor = useCallback(() => {
    const element = viewerRef.current?.canvas as HTMLElement | undefined;
    if (!element) return;
    if (draggingRef.current) {
      element.style.cursor = "grabbing";
      return;
    }
    const reach = slack();
    element.style.cursor = reach.x || reach.y ? "grab" : "default";
  }, [slack]);

  /* ------------------------------------------------------------ engine setup */

  useEffect(() => {
    let disposed = false;

    void (async () => {
      const module = await import("openseadragon");
      const osd = ((module as unknown as { default?: OSDNamespace }).default ?? (module as unknown as OSDNamespace));
      if (disposed || !hostRef.current) return;
      osdRef.current = osd;

      const viewer = osd({
        element: hostRef.current,
        // Every built-in control is off: the reader draws its own chrome.
        showNavigationControl: false,
        showNavigator: false,
        showSequenceControl: false,
        showZoomControl: false,
        showHomeControl: false,
        showFullPageControl: false,
        showRotationControl: false,
        // Pages come through the app's own image proxy (same origin), so an
        // anonymous request is CORS-clean and the drawer can use them freely.
        crossOriginPolicy: "Anonymous",
        // Motion: quick enough to feel direct, slow enough not to snap.
        animationTime: 0.28,
        springStiffness: 8.5,
        blendTime: 0.08,
        alwaysBlend: false,
        immediateRender: true,
        imageSmoothingEnabled: true,
        // The page can never be dragged out of view, and never drifts on release.
        visibilityRatio: 1,
        constrainDuringPan: true,
        homeFillsViewer: false,
        // Zooming out stops at Fit Page; the ceiling is set per page in
        // updateZoomLimits, so the pixel-ratio cap must not get there first.
        minZoomImageRatio: 1,
        maxZoomPixelRatio: Infinity,
        autoResize: true,
        preserveImageSizeOnResize: false,
        dblClickTimeThreshold: DOUBLE_CLICK_MS,
        gestureSettingsMouse: {
          clickToZoom: false,
          dblClickToZoom: false,
          scrollToZoom: false,
          dragToPan: true,
          flickEnabled: false,
          pinchToZoom: false,
          pinchRotate: false,
        },
        gestureSettingsTouch: {
          clickToZoom: false,
          dblClickToZoom: false,
          scrollToZoom: false,
          dragToPan: true,
          // Off on purpose — the reader drives the pinch itself (see the
          // canvas-pinch handler) so it can anchor on the real finger midpoint.
          pinchToZoom: false,
          zoomToRefPoint: true,
          pinchRotate: false,
          // No momentum. A flick keeps moving the page after the fingers are
          // gone, which for a pinch means the release nudges the view off the
          // point that was just being zoomed into — the page shifting on its
          // own after the gesture ended. Predictable beats fancy here.
          flickEnabled: false,
        },
        gestureSettingsPen: {
          clickToZoom: false,
          dblClickToZoom: false,
          scrollToZoom: false,
          dragToPan: true,
          flickEnabled: false,
          pinchToZoom: false,
        },
      });
      viewerRef.current = viewer;

      // The reader owns the keyboard for the whole overlay. Leaving OSD's own
      // bindings live would mean arrows and +/- being handled twice whenever
      // the canvas happened to hold focus.
      const tracker = (viewer as unknown as { innerTracker?: Record<string, unknown> }).innerTracker;
      if (tracker) {
        tracker.keyDownHandler = null;
        tracker.keyUpHandler = null;
        tracker.keyHandler = null;
        tracker.keyPressHandler = null;
      }

      /* --------------------------------------------------- zoom / pan feedback */

      const publish = () => {
        rafRef.current = null;
        const live = viewerRef.current;
        if (!live || live.world.getItemCount() === 0) return;
        const base = baseZoomRef.current || live.viewport.getHomeZoom();
        const ratio = base > 0 ? live.viewport.getZoom(true) / base : 1;
        const label = propsRef.current.zoomLabelRef?.current;
        if (label) label.textContent = `${Math.round(ratio * 100)}%`;
        const atFit = ratio <= 1.02;
        if (atFit !== atFitRef.current) {
          atFitRef.current = atFit;
          propsRef.current.onFitChange?.(atFit);
        }
        updateCursor();
      };
      const schedulePublish = () => {
        if (rafRef.current !== null) return;
        rafRef.current = requestAnimationFrame(publish);
      };
      // `animation` is the per-frame event; `zoom` and `pan` fire once per
      // command, when the *target* is set, not while the spring travels to it.
      // Listening only to those left the readout — and the at-fit flag derived
      // from it — stuck at whatever the zoom happened to be the instant the
      // command was issued, i.e. permanently mid-transition.
      viewer.addHandler("animation", schedulePublish);
      viewer.addHandler("animation-finish", schedulePublish);
      viewer.addHandler("zoom", schedulePublish);
      viewer.addHandler("pan", schedulePublish);

      /* -------------------------------------------------------------- wheel zoom */

      const onWheel = (event: WheelEvent) => {
        const live = viewerRef.current;
        const ns = osdRef.current;
        if (!live || !ns || live.world.getItemCount() === 0) return;
        // Always ours: left alone, a ctrl+wheel would zoom the whole document
        // and a plain wheel would scroll the page behind the overlay.
        event.preventDefault();
        let delta = event.deltaY;
        if (event.deltaMode === 1) delta *= 16;                                     // lines
        else if (event.deltaMode === 2) delta *= live.viewport.getContainerSize().y; // pages
        // A trackpad emits a burst of small deltas, a mouse one large one.
        // Scaling by the delta keeps both proportional; the clamp stops a
        // single violent event (or a trackpad pinch) jumping several steps.
        delta = Math.max(-160, Math.min(160, delta));
        const factor = Math.exp(-delta * 0.0022);
        wantsFitRef.current = false;
        const focal = focalFromClient(event.clientX, event.clientY);
        if (!focal) return;
        live.viewport.zoomBy(factor, focal, false);
        live.viewport.applyConstraints(false);
      };
      viewer.element.addEventListener("wheel", onWheel, { passive: false });

      /**
       * Viewport point under a client (screen) coordinate, measured from the
       * element's live rect. Everything anchored — wheel, pinch, double click —
       * goes through this one conversion, which measures exact: a zoom driven
       * from it leaves the content under the pointer within a pixel. The
       * coordinates OpenSeadragon puts on its own gesture events were landing
       * about 36px off inside this overlay, which on a pinch reads as the page
       * creeping away from the fingers as it grows.
       */
      const focalFromClient = (clientX: number, clientY: number) => {
        const ns = osdRef.current;
        const live = viewerRef.current;
        if (!ns || !live) return null;
        const box = live.element.getBoundingClientRect();
        return live.viewport.pointFromPixel(new ns.Point(clientX - box.left, clientY - box.top), true);
      };

      /* ------------------------------------------------- click / double click */

      let zoneTimer: ReturnType<typeof setTimeout> | undefined;
      const cancelZoneClick = () => {
        if (zoneTimer) {
          clearTimeout(zoneTimer);
          zoneTimer = undefined;
        }
      };

      viewer.addHandler("canvas-click", event => {
        event.preventDefaultAction = true;
        if (!event.quick) return;      // a drag, not a click
        if (!atFitRef.current) return; // magnified: taps belong to the image
        const width = viewer.element.clientWidth || 1;
        const x = event.position.x;
        const zone: 0 | 1 | 2 = x < width * 0.33 ? 0 : x > width * 0.67 ? 2 : 1;
        // Held for the double-click window: the first click of a
        // double-click-to-zoom must not also turn the page. The cost is a
        // fifth of a second on tap-to-turn, the same trade every viewer that
        // carries both gestures makes.
        cancelZoneClick();
        zoneTimer = setTimeout(() => {
          zoneTimer = undefined;
          propsRef.current.onZone?.(zone);
        }, DOUBLE_CLICK_MS + 20);
      });

      // The pinch is driven here rather than by OpenSeadragon's own handler,
      // for one measured reason: OSD anchors it on the midpoint it derives from
      // its element-offset maths, which inside this overlay sits a constant
      // ~36px above the fingers — so the page slid upward as it grew, by more
      // the harder you pinched. Anchoring on the midpoint of the raw pointer
      // positions instead lands it on the fingers. The zoom itself is still
      // OpenSeadragon's (zoomBy about a viewport point, with its constraints);
      // only the focal point is ours. `pinchToZoom` is off in
      // gestureSettingsTouch so the two can never both act.
      viewer.addHandler("canvas-pinch", event => {
        event.preventDefaultPanAction = true;
        event.preventDefaultZoomAction = true;
        const live = viewerRef.current;
        if (!live || live.world.getItemCount() === 0) return;
        const [first, second] = [...livePointers.values()];
        if (!first || !second || !event.lastDistance) return;
        wantsFitRef.current = false;
        const mid = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
        const focal = focalFromClient(mid.x, mid.y);
        if (!focal) return;
        // Follow the midpoint as it travels, so a pinch that also slides moves
        // the page along with the fingers.
        if (lastPinchMid) {
          const from = focalFromClient(lastPinchMid.x, lastPinchMid.y);
          if (from) live.viewport.panBy(from.minus(focal), true);
        }
        lastPinchMid = mid;
        // Zoom, then put the focal point back where it was. OpenSeadragon's own
        // zoom-point correction does not take on the immediate path a pinch
        // uses — measured, the focal slipped by exactly (factor - 1) x its
        // distance from the viewport centre, i.e. the correction contributed
        // nothing and the gesture behaved as a centre zoom. Closing the loop
        // here instead of relying on that internal keeps the content under the
        // fingers to the pixel, whatever the engine does.
        const beforePx = live.viewport.pixelFromPoint(focal, true);
        live.viewport.zoomBy(event.distance / event.lastDistance, focal, true);
        const afterPx = live.viewport.pixelFromPoint(focal, true);
        const slip = afterPx.minus(beforePx);
        if (slip.x || slip.y) {
          live.viewport.panBy(live.viewport.deltaPointsFromPixels(slip, true), true);
        }
        live.viewport.applyConstraints(true);
      });

      viewer.addHandler("canvas-double-click", event => {
        event.preventDefaultAction = true;
        cancelZoneClick();
        const live = viewerRef.current;
        if (!live || live.world.getItemCount() === 0) return;
        const base = baseZoomRef.current || live.viewport.getHomeZoom();
        if (live.viewport.getZoom(true) > base * 1.05) {
          applyFit(false);
          return;
        }
        wantsFitRef.current = false;
        const source = event.originalEvent as MouseEvent | undefined;
        const focal = source && typeof source.clientX === "number"
          ? focalFromClient(source.clientX, source.clientY)
          : live.viewport.pointFromPixel(event.position, true);
        if (!focal) return;
        const target = Math.min(live.viewport.getMaxZoom(), base * DOUBLE_CLICK_SCALE);
        live.viewport.zoomTo(target, focal, false);
        live.viewport.applyConstraints(false);
      });

      /* ------------------------------------------------------ swipe navigation */

      // The rule that keeps navigation and image manipulation apart: a swipe is
      // a page turn only while the image has no horizontal travel of its own.
      // The moment it does — any zoom past a width-filling fit — the same
      // gesture is a pan, and the page must not change under it.
      const pointers = new Set<number>();
      /** Live client position of every pointer that is down, for the pinch midpoint. */
      const livePointers = new Map<number, { x: number; y: number }>();
      let lastPinchMid: { x: number; y: number } | null = null;
      let swipe: { x: number; y: number; t: number; id: number } | null = null;
      let multiTouch = false;

      const onPointerMove = (event: PointerEvent) => {
        if (livePointers.has(event.pointerId)) {
          livePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        }
      };

      const onPointerDown = (event: PointerEvent) => {
        pointers.add(event.pointerId);
        livePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size < 2) lastPinchMid = null;
        draggingRef.current = true;
        updateCursor();
        propsRef.current.onGesture?.(true);
        if (pointers.size > 1) {
          multiTouch = true;
          swipe = null;
          return;
        }
        multiTouch = false;
        swipe = event.pointerType === "mouse"
          ? null
          : { x: event.clientX, y: event.clientY, t: performance.now(), id: event.pointerId };
      };

      const onPointerUp = (event: PointerEvent) => {
        pointers.delete(event.pointerId);
        livePointers.delete(event.pointerId);
        lastPinchMid = null;
        if (pointers.size > 0) return;
        draggingRef.current = false;
        updateCursor();
        propsRef.current.onGesture?.(false);
        const start = swipe;
        const wasMultiTouch = multiTouch;
        swipe = null;
        multiTouch = false;
        if (!start || wasMultiTouch || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (performance.now() - start.t > 700) return;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (slack().x) return;
        propsRef.current.onSwipe?.(dx < 0 ? 1 : -1);
      };

      // Capture phase, and never preventDefault: this only observes the stream
      // OpenSeadragon is already handling, so panning and pinching are
      // untouched by it.
      const host = viewer.element;
      host.addEventListener("pointerdown", onPointerDown, true);
      host.addEventListener("pointermove", onPointerMove, true);
      host.addEventListener("pointerup", onPointerUp, true);
      host.addEventListener("pointercancel", onPointerUp, true);

      /* ------------------------------------------------------------ resize */

      // "after-resize", not "resize": OpenSeadragon raises `resize` from inside
      // Viewport.resize() *before* it re-applies the pre-resize bounds on its
      // very next line, so anything a `resize` handler fits gets overwritten a
      // moment later and the viewport quietly keeps the zoom it had at the old
      // size.
      //
      // And coalesced, not immediate. A window resize — a phone rotating above
      // all — arrives as a burst of events with half-settled layouts in
      // between, and a fit computed against one of those intermediate container
      // sizes is wrong by whatever the layout was mid-flight; OpenSeadragon
      // then carries that wrong zoom forward through its own bounds
      // conversions. Rotating to landscape used to land at about 3x for exactly
      // that reason. So: one fit, once the size has stopped moving.
      let refitTimer: ReturnType<typeof setTimeout> | undefined;
      const settleResize = () => {
        refitTimer = undefined;
        const live = viewerRef.current;
        if (!live || live.world.getItemCount() === 0) return;
        // Re-fit when fit is where the reader asked to be; otherwise keep the
        // magnified view and only bring the limits and bounds back in line.
        if (wantsFitRef.current) applyFit(false);
        else {
          const rect = fitRect();
          if (rect) baseZoomRef.current = zoomForRect(rect);
          live.viewport.applyConstraints(true);
        }
        updateZoomLimits();
        schedulePublish();
      };
      viewer.addHandler("after-resize", () => {
        if (refitTimer) clearTimeout(refitTimer);
        refitTimer = setTimeout(settleResize, 90);
      });

      setEngineReady(true);

      cleanupRef.current = () => {
        if (refitTimer) clearTimeout(refitTimer);
        cancelZoneClick();
        host.removeEventListener("pointerdown", onPointerDown, true);
        host.removeEventListener("pointermove", onPointerMove, true);
        host.removeEventListener("pointerup", onPointerUp, true);
        host.removeEventListener("pointercancel", onPointerUp, true);
        host.removeEventListener("wheel", onWheel);
      };
    })();

    return () => {
      disposed = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      cleanupRef.current?.();
      cleanupRef.current = null;
      try {
        viewerRef.current?.destroy();
      } catch { /* already torn down */ }
      viewerRef.current = null;
      setEngineReady(false);
    };
    // Built once and kept for the life of the component — a page change swaps
    // the image inside this instance, it never rebuilds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------------------------------- opening */

  useEffect(() => {
    if (!engineReady) return;
    const viewer = viewerRef.current;
    const osd = osdRef.current;
    const current = propsRef.current.items;
    if (!viewer || !osd || current.length === 0) return;

    let cancelled = false;
    setStatus("loading");
    const spinner = setTimeout(() => {
      if (!cancelled) setShowSpinner(true);
    }, SPINNER_DELAY_MS);

    const settle = (next: "ready" | "error") => {
      clearTimeout(spinner);
      setShowSpinner(false);
      setStatus(next);
    };

    // Sizes first, always. Opening before they are known means laying the page
    // (or a spread) out at a guess and correcting it a frame later, which is
    // exactly the visible jump this viewport exists to stop.
    Promise.all(current.map(item => loadPageImage(item.url)))
      .then(metas => {
        if (cancelled) return;
        metas.forEach((meta, index) => propsRef.current.onMeta?.(current[index].key, meta.width, meta.height));

        keptBoundsRef.current = propsRef.current.preserveView && viewer.world.getItemCount() > 0
          ? viewer.viewport.getBounds(true)
          : null;

        viewer.addOnceHandler("open", () => {
          if (cancelled) return;
          const rect = fitRect();
          if (rect) baseZoomRef.current = zoomForRect(rect);
          const kept = keptBoundsRef.current;
          if (kept) {
            wantsFitRef.current = false;
            viewer.viewport.fitBounds(kept, true);
            viewer.viewport.applyConstraints(true);
          } else {
            applyFit(true);
          }
          updateZoomLimits();
          settle("ready");
          const base = baseZoomRef.current || viewer.viewport.getHomeZoom();
          const atFit = base > 0 ? viewer.viewport.getZoom(true) / base <= 1.02 : true;
          if (atFit !== atFitRef.current) {
            atFitRef.current = atFit;
            propsRef.current.onFitChange?.(atFit);
          }
          updateCursor();
        });
        viewer.addOnceHandler("open-failed", () => {
          if (!cancelled) settle("error");
        });

        viewer.open(buildSpecs(osd, current, metas));
      })
      .catch(() => {
        if (!cancelled) settle("error");
      });

    return () => {
      cancelled = true;
      clearTimeout(spinner);
    };
    // `signature` stands in for `items`, so an identical list re-created by a
    // parent render never re-opens the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineReady, signature, attempt, applyFit, fitRect, zoomForRect, updateZoomLimits, updateCursor]);

  /* ------------------------------------------------------------ fit changes */

  useEffect(() => {
    if (status !== "ready") return;
    applyFit(false);
    updateZoomLimits();
    // Only when the fit itself changes — the open path already fitted once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);

  /* ------------------------------------------------------------- public API */

  const stepZoom = useCallback((factor: number) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.world.getItemCount() === 0) return;
    wantsFitRef.current = false;
    viewer.viewport.zoomBy(factor, undefined, false);
    viewer.viewport.applyConstraints(false);
  }, []);

  useImperativeHandle(ref, (): MediaViewportHandle => ({
    zoomIn: () => stepZoom(1.5),
    zoomOut: () => stepZoom(1 / 1.5),
    reset: () => applyFit(false),
    isAtFit: () => atFitRef.current,
  }), [stepZoom, applyFit]);

  const retry = () => {
    for (const item of items) forgetPageImage(item.url);
    setAttempt(value => value + 1);
  };

  return (
    <div className={cn("relative w-full h-full overflow-hidden", className)} style={{ background }}>
      <div
        ref={hostRef}
        className="absolute inset-0"
        // Scoped to this element only: the browser's own pan/zoom is taken over
        // where the image is, and nowhere else in the app.
        style={{ touchAction: "none" }}
        role="img"
        aria-label={ariaLabel}
      />

      {showSpinner && status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="w-6 h-6 animate-spin opacity-60" style={{ color: "var(--rd-text, #fff)" }} />
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="font-sans font-bold text-sm" style={{ color: "var(--rd-text, #fff)" }}>
            Não foi possível carregar esta página.
          </p>
          <button
            onClick={retry}
            className="flex items-center gap-2 px-4 py-2 rounded-full border font-sans font-bold text-xs"
            style={{ background: "var(--rd-surface)", color: "var(--rd-text)", borderColor: "var(--rd-border)" }}
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={2.5} /> Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Lay the page (or the two pages of a spread) out in viewport coordinates,
 * normalised to one unit tall so both halves of a spread share a baseline no
 * matter how their scans differ.
 *
 * A split page is the same image with a `clip`: half the pixels, no second
 * request, and — unlike the CSS crop it replaces — the engine's own bounds, fit
 * and zoom limits all describe the half actually being looked at.
 */
function buildSpecs(osd: OSDNamespace, items: ViewportItem[], metas: PageImage[]): TileSourceSpecifier[] {
  const specs: TileSourceSpecifier[] = [];
  let x = 0;
  items.forEach((item, index) => {
    const meta = metas[index];
    const fullWidth = meta.width / meta.height;
    const visibleWidth = item.half ? fullWidth / 2 : fullWidth;
    const spec: TileSourceSpecifier = {
      tileSource: {
        type: "image",
        url: meta.src,
        buildPyramid: true,
        crossOriginPolicy: "Anonymous",
      },
      // `x` places the whole image; for a second half the visible part starts
      // half an image further right, so the image itself is shifted back.
      x: item.half === "second" ? x - fullWidth / 2 : x,
      y: 0,
      width: fullWidth,
    };
    if (item.half) {
      spec.clip = new osd.Rect(
        item.half === "second" ? meta.width / 2 : 0,
        0,
        meta.width / 2,
        meta.height,
      );
    }
    specs.push(spec);
    x += visibleWidth + SPREAD_GAP;
  });
  return specs;
}

export const MediaViewport = memo(forwardRef<MediaViewportHandle, MediaViewportProps>(MediaViewportInner));
