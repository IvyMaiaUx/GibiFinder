import { useRef, useEffect, useCallback } from "react";

export const TAP_DELAY_MS = 250;
export const WHEEL_COOLDOWN_MS = 350;

interface UseGestureViewportOptions {
  onTapZone?: (zone: "left" | "center" | "right") => void;
  onSwipePrev?: () => void;
  onSwipeNext?: () => void;
  isWebtoon?: boolean;
}

export function useGestureViewport(options: UseGestureViewportOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Latest ref pattern: keeps callbacks up-to-date without remounting event listeners
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  // Transform state stored in mutable refs to avoid React re-renders during active gestures
  // In Paginated mode: scale + translateX + translateY
  // In Webtoon mode: webtoonScale adjusts width (scale * 100%) and uses native scrollTop/scrollLeft
  const scaleRef = useRef(1);
  const translateXRef = useRef(0);
  const translateYRef = useRef(0);

  // Webtoon zoom state
  const webtoonScaleRef = useRef(1);

  // Active pointers tracker (for mouse, pen, and multi-touch)
  const activePointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());

  // Post-pinch flag to suppress swipe when fingers lift after pinching
  const wasPinchingRef = useRef(false);

  // Tap & Drag tracking refs
  const tapTimerRef = useRef<number | null>(null);
  const lastTapTimeRef = useRef(0);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialTranslateRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Pinch tracking
  const initialPinchDistRef = useRef(0);
  const initialPinchScaleRef = useRef(1);
  const initialPinchTranslateRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialPinchMidpointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialPinchScrollRef = useRef<{ left: number; top: number }>({ left: 0, top: 0 });

  // Wheel cooldown ref
  const lastWheelTimeRef = useRef(0);

  // Window width tracking to ignore height-only resize events (e.g. mobile Safari address bar collapse)
  const lastWindowWidthRef = useRef(typeof window !== "undefined" ? window.innerWidth : 1024);

  // Measure actual rendered image(s) bounds vs container to compute accurate pan bounds in paginated mode
  const getBounds = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) {
      return { maxTx: 0, maxTy: 0, containerRect: { width: 0, height: 0, left: 0, top: 0 }, contentW: 0, contentH: 0 };
    }

    const containerRect = container.getBoundingClientRect();
    const s = scaleRef.current;

    // In paginated mode, locate the active spread wrapper or rendered images to get the true unscaled content size
    const spreadWrapper = content.querySelector(".reader-spread-wrapper") as HTMLElement | null;
    let baseW = 0;
    let baseH = 0;

    if (spreadWrapper) {
      baseW = spreadWrapper.scrollWidth || spreadWrapper.offsetWidth;
      baseH = spreadWrapper.scrollHeight || spreadWrapper.offsetHeight;
    } else {
      // Fallback: measure all images inside content
      const imgs = content.querySelectorAll("img");
      if (imgs.length > 0) {
        let minLeft = Infinity;
        let maxRight = -Infinity;
        let minTop = Infinity;
        let maxBottom = -Infinity;

        imgs.forEach((img) => {
          const r = img.getBoundingClientRect();
          if (r.left < minLeft) minLeft = r.left;
          if (r.right > maxRight) maxRight = r.right;
          if (r.top < minTop) minTop = r.top;
          if (r.bottom > maxBottom) maxBottom = r.bottom;
        });

        if (minLeft < Infinity && s > 0) {
          // Calculate unscaled base dimensions
          baseW = (maxRight - minLeft) / s;
          baseH = (maxBottom - minTop) / s;
        }
      }
    }

    if (!baseW || !baseH) {
      baseW = content.offsetWidth || containerRect.width;
      baseH = content.offsetHeight || containerRect.height;
    }

    const renderedW = baseW * s;
    const renderedH = baseH * s;

    const maxTx = Math.max(0, (renderedW - containerRect.width) / 2);
    const maxTy = Math.max(0, (renderedH - containerRect.height) / 2);

    return { maxTx, maxTy, containerRect, contentW: renderedW, contentH: renderedH };
  }, []);

  // Apply transforms in Paginated mode
  const applyTransform = useCallback((animate = false) => {
    const el = contentRef.current;
    if (!el || callbacksRef.current.isWebtoon) return;
    if (animate) {
      el.style.transition = "transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)";
    } else {
      el.style.transition = "none";
    }
    el.style.transform = `translate3d(${translateXRef.current}px, ${translateYRef.current}px, 0) scale(${scaleRef.current})`;
  }, []);

  // Apply width zoom in Webtoon mode
  const applyWebtoonZoom = useCallback((newScale: number, anchorClientX?: number, anchorClientY?: number) => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const clampedScale = Math.min(Math.max(newScale, 1), 4);
    const oldScale = webtoonScaleRef.current;
    if (clampedScale === oldScale && clampedScale === 1) return;

    const containerRect = container.getBoundingClientRect();
    const clientX = anchorClientX !== undefined ? anchorClientX : containerRect.left + containerRect.width / 2;
    const clientY = anchorClientY !== undefined ? anchorClientY : containerRect.top + containerRect.height / 2;

    // Content coordinate before scale change
    const contentX = container.scrollLeft + (clientX - containerRect.left);
    const contentY = container.scrollTop + (clientY - containerRect.top);

    // Update width
    webtoonScaleRef.current = clampedScale;
    const webtoonFlow = content.querySelector(".reader-webtoon-flow") as HTMLElement | null;
    const targetElement = webtoonFlow || content;

    if (clampedScale <= 1) {
      targetElement.style.width = "100%";
      targetElement.style.maxWidth = "42rem"; // max-w-2xl
      targetElement.style.marginInline = "auto";
      content.style.alignItems = "center";
      container.style.overflowX = "hidden";
    } else {
      targetElement.style.width = `${clampedScale * 100}%`;
      targetElement.style.maxWidth = "none";
      targetElement.style.marginInline = "auto";
      content.style.alignItems = "flex-start";
      container.style.overflowX = "auto";
    }

    // Adjust scroll to keep the focal point stationary
    const ratio = clampedScale / oldScale;
    const newContentX = contentX * ratio;
    const newContentY = contentY * ratio;

    container.scrollLeft = newContentX - (clientX - containerRect.left);
    container.scrollTop = newContentY - (clientY - containerRect.top);
  }, []);

  // Reset zoom back to 1x
  const resetZoom = useCallback((animate = true) => {
    if (callbacksRef.current.isWebtoon) {
      applyWebtoonZoom(1);
    } else {
      scaleRef.current = 1;
      translateXRef.current = 0;
      translateYRef.current = 0;
      applyTransform(animate);
    }
  }, [applyTransform, applyWebtoonZoom]);

  // Set position to top (for fit-width on page turns in paginated mode)
  const setPositionToTop = useCallback(() => {
    if (callbacksRef.current.isWebtoon) {
      if (containerRef.current) containerRef.current.scrollTop = 0;
      return;
    }
    const { maxTy } = getBounds();
    translateYRef.current = maxTy;
    applyTransform(false);
  }, [getBounds, applyTransform]);

  // Clamp translation with smooth return when gesture ends in paginated mode
  const clampPanWithBounce = useCallback(() => {
    if (callbacksRef.current.isWebtoon) return;
    const { maxTx, maxTy } = getBounds();

    let clampedX = translateXRef.current;
    let clampedY = translateYRef.current;

    if (clampedX > maxTx) clampedX = maxTx;
    if (clampedX < -maxTx) clampedX = -maxTx;

    if (clampedY > maxTy) clampedY = maxTy;
    if (clampedY < -maxTy) clampedY = -maxTy;

    translateXRef.current = clampedX;
    translateYRef.current = clampedY;
    applyTransform(true);
  }, [getBounds, applyTransform]);

  // Keep touch-action synced dynamically with mode changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.style.touchAction = options.isWebtoon ? "pan-y" : "none";
  }, [options.isWebtoon]);

  // Reset zoom ONLY when window width changes or on orientationchange (ignore height changes from mobile address bars)
  useEffect(() => {
    const handleResize = () => {
      const currentWidth = window.innerWidth;
      if (currentWidth !== lastWindowWidthRef.current) {
        lastWindowWidthRef.current = currentWidth;
        resetZoom(false);
      }
    };
    const handleOrientation = () => {
      lastWindowWidthRef.current = window.innerWidth;
      resetZoom(false);
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleOrientation);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleOrientation);
    };
  }, [resetZoom]);

  // Pointer Events listeners registered ONCE
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let pointerStartX = 0;
    let pointerStartY = 0;
    let hasMovedSignificantly = false;

    const handlePointerDown = (e: PointerEvent) => {
      // Ignore right clicks
      if (e.button === 2) return;

      // Ignore interactive controls so buttons/links don't trigger gestures
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("button, a, input, select, textarea")) {
        return;
      }

      activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

      if (activePointersRef.current.size === 1) {
        pointerStartX = e.clientX;
        pointerStartY = e.clientY;
        hasMovedSignificantly = false;

        const isWebtoon = callbacksRef.current.isWebtoon;
        if (!isWebtoon) {
          const { maxTx, maxTy } = getBounds();
          const canPan = scaleRef.current > 1 || maxTx > 0 || maxTy > 0;

          if (canPan) {
            isDraggingRef.current = true;
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            initialTranslateRef.current = { x: translateXRef.current, y: translateYRef.current };
            try {
              container.setPointerCapture(e.pointerId);
            } catch {}
          }
        }
      } else if (activePointersRef.current.size === 2) {
        // Pinch gesture started
        wasPinchingRef.current = true;

        if (tapTimerRef.current) {
          window.clearTimeout(tapTimerRef.current);
          tapTimerRef.current = null;
        }
        isDraggingRef.current = false;

        const points = Array.from(activePointersRef.current.values());
        const p1 = points[0];
        const p2 = points[1];

        initialPinchDistRef.current = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);

        const isWebtoon = callbacksRef.current.isWebtoon;
        if (isWebtoon) {
          initialPinchScaleRef.current = webtoonScaleRef.current;
          initialPinchScrollRef.current = { left: container.scrollLeft, top: container.scrollTop };
        } else {
          initialPinchScaleRef.current = scaleRef.current;
          initialPinchTranslateRef.current = { x: translateXRef.current, y: translateYRef.current };

          const rect = container.getBoundingClientRect();
          initialPinchMidpointRef.current = {
            x: (p1.clientX + p2.clientX) / 2 - rect.left - rect.width / 2,
            y: (p1.clientY + p2.clientY) / 2 - rect.top - rect.height / 2,
          };
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!activePointersRef.current.has(e.pointerId)) return;
      activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

      const points = Array.from(activePointersRef.current.values());
      const isWebtoon = callbacksRef.current.isWebtoon;

      if (points.length === 1) {
        const dx = e.clientX - pointerStartX;
        const dy = e.clientY - pointerStartY;
        if (Math.hypot(dx, dy) > 8) {
          hasMovedSignificantly = true;
        }

        if (!isWebtoon) {
          const { maxTx, maxTy } = getBounds();
          const canPan = scaleRef.current > 1 || maxTx > 0 || maxTy > 0;

          if (canPan && isDraggingRef.current) {
            e.preventDefault();

            let rawX = initialTranslateRef.current.x + (e.clientX - dragStartRef.current.x);
            let rawY = initialTranslateRef.current.y + (e.clientY - dragStartRef.current.y);

            // Apply elastic rubber-band resistance when overdragging
            if (rawX > maxTx) rawX = maxTx + (rawX - maxTx) * 0.25;
            if (rawX < -maxTx) rawX = -maxTx + (rawX + maxTx) * 0.25;

            if (rawY > maxTy) rawY = maxTy + (rawY - maxTy) * 0.25;
            if (rawY < -maxTy) rawY = -maxTy + (rawY + maxTy) * 0.25;

            translateXRef.current = rawX;
            translateYRef.current = rawY;
            applyTransform(false);
          }
        }
      } else if (points.length === 2 && initialPinchDistRef.current > 0) {
        e.preventDefault();
        hasMovedSignificantly = true;

        const p1 = points[0];
        const p2 = points[1];
        const currentDist = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
        const factor = currentDist / initialPinchDistRef.current;
        const s0 = initialPinchScaleRef.current;
        const newScale = Math.min(Math.max(s0 * factor, 1), 4);

        if (isWebtoon) {
          const midX = (p1.clientX + p2.clientX) / 2;
          const midY = (p1.clientY + p2.clientY) / 2;
          applyWebtoonZoom(newScale, midX, midY);
        } else {
          const rect = container.getBoundingClientRect();
          const currentMidX = (p1.clientX + p2.clientX) / 2 - rect.left - rect.width / 2;
          const currentMidY = (p1.clientY + p2.clientY) / 2 - rect.top - rect.height / 2;

          const deltaScale = newScale / s0;
          const m0x = initialPinchMidpointRef.current.x;
          const m0y = initialPinchMidpointRef.current.y;

          scaleRef.current = newScale;
          translateXRef.current = initialPinchTranslateRef.current.x * deltaScale + (currentMidX - m0x * deltaScale);
          translateYRef.current = initialPinchTranslateRef.current.y * deltaScale + (currentMidY - m0y * deltaScale);

          applyTransform(false);
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      try {
        if (container.hasPointerCapture(e.pointerId)) {
          container.releasePointerCapture(e.pointerId);
        }
      } catch {}

      activePointersRef.current.delete(e.pointerId);

      const isWebtoon = callbacksRef.current.isWebtoon;

      if (activePointersRef.current.size === 1) {
        if (!isWebtoon) {
          // Transition remaining finger to drag seamlessly without jump
          const remaining = Array.from(activePointersRef.current.values())[0];
          isDraggingRef.current = true;
          dragStartRef.current = { x: remaining.clientX, y: remaining.clientY };
          initialTranslateRef.current = { x: translateXRef.current, y: translateYRef.current };
          initialPinchDistRef.current = 0;
        }
      } else if (activePointersRef.current.size === 0) {
        isDraggingRef.current = false;
        initialPinchDistRef.current = 0;

        const hadPinch = wasPinchingRef.current;
        // Reset pinch suppression flag only once all fingers are lifted
        wasPinchingRef.current = false;

        if (!isWebtoon) {
          const { maxTx, maxTy } = getBounds();
          const canPan = scaleRef.current > 1 || maxTx > 0 || maxTy > 0;

          if (canPan) {
            clampPanWithBounce();
          } else if (scaleRef.current < 1) {
            resetZoom(true);
          }
        }

        // Single tap vs Double tap handling (never trigger tap or swipe if pinch was active)
        if (!hadPinch && !hasMovedSignificantly) {
          const now = Date.now();
          const timeSinceLastTap = now - lastTapTimeRef.current;
          const rect = container.getBoundingClientRect();
          const tapX = pointerStartX - rect.left;
          const tapY = pointerStartY - rect.top;

          if (timeSinceLastTap < TAP_DELAY_MS) {
            // DOUBLE TAP DETECTED
            if (tapTimerRef.current) {
              window.clearTimeout(tapTimerRef.current);
              tapTimerRef.current = null;
            }
            lastTapTimeRef.current = 0;

            if (isWebtoon) {
              if (webtoonScaleRef.current > 1) {
                applyWebtoonZoom(1);
              } else {
                applyWebtoonZoom(2.5, pointerStartX, pointerStartY);
              }
            } else {
              if (scaleRef.current > 1) {
                resetZoom(true);
              } else {
                const targetScale = 2.5;
                scaleRef.current = targetScale;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                translateXRef.current = (centerX - tapX) * targetScale;
                translateYRef.current = (centerY - tapY) * targetScale;
                applyTransform(true);
              }
            }
          } else {
            // Wait for tap delay to verify it is NOT a double tap
            lastTapTimeRef.current = now;

            tapTimerRef.current = window.setTimeout(() => {
              tapTimerRef.current = null;
              const currentScale = isWebtoon ? webtoonScaleRef.current : scaleRef.current;
              if (currentScale === 1) {
                const ratio = tapX / rect.width;
                if (ratio < 0.33) {
                  callbacksRef.current.onTapZone?.("left");
                } else if (ratio > 0.67) {
                  callbacksRef.current.onTapZone?.("right");
                } else {
                  callbacksRef.current.onTapZone?.("center");
                }
              }
            }, TAP_DELAY_MS);
          }
        } else if (!hadPinch && !isWebtoon && scaleRef.current === 1) {
          // Horizontal swipe detection in paginated mode at 1x
          const dx = e.clientX - pointerStartX;
          const dy = e.clientY - pointerStartY;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx > 0) {
              callbacksRef.current.onSwipePrev?.();
            } else {
              callbacksRef.current.onSwipeNext?.();
            }
          }
        }
      }
    };

    const handlePointerCancel = (e: PointerEvent) => {
      activePointersRef.current.delete(e.pointerId);
      if (activePointersRef.current.size === 0) {
        isDraggingRef.current = false;
        initialPinchDistRef.current = 0;
        wasPinchingRef.current = false;
        if (!callbacksRef.current.isWebtoon) {
          clampPanWithBounce();
        }
      }
    };

    // Wheel navigation: in paginated mode, update lastWheelTimeRef on EVERY event to prevent trackpad inertia page flipping
    const handleWheel = (e: WheelEvent) => {
      if (callbacksRef.current.isWebtoon) {
        // Allow native 2-axis scrolling in webtoon mode
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        // Ctrl + Wheel: pinch zoom with mouse wheel
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.85;
        const newScale = Math.min(Math.max(scaleRef.current * factor, 1), 4);
        scaleRef.current = newScale;
        if (newScale === 1) {
          translateXRef.current = 0;
          translateYRef.current = 0;
        }
        applyTransform(false);
        clampPanWithBounce();
        return;
      }

      // In paginated mode, ALWAYS update lastWheelTimeRef on every wheel event
      const now = Date.now();
      const timeSinceLastWheel = now - lastWheelTimeRef.current;
      lastWheelTimeRef.current = now;

      if (scaleRef.current === 1) {
        // Only accept a page turn if at least WHEEL_COOLDOWN_MS has passed without ANY wheel event
        if (timeSinceLastWheel < WHEEL_COOLDOWN_MS) {
          e.preventDefault();
          return;
        }

        if (Math.abs(e.deltaY) > 30) {
          e.preventDefault();
          if (e.deltaY > 0) {
            callbacksRef.current.onSwipeNext?.();
          } else {
            callbacksRef.current.onSwipePrev?.();
          }
        }
      }
    };

    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerup", handlePointerUp);
    container.addEventListener("pointercancel", handlePointerCancel);
    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", handlePointerUp);
      container.removeEventListener("pointercancel", handlePointerCancel);
      container.removeEventListener("wheel", handleWheel);
      if (tapTimerRef.current) {
        window.clearTimeout(tapTimerRef.current);
      }
    };
  }, [applyTransform, resetZoom, getBounds, clampPanWithBounce, applyWebtoonZoom]);

  return {
    containerRef,
    contentRef,
    resetZoom,
    setPositionToTop,
  };
}
