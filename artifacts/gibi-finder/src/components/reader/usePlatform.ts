import { useSyncExternalStore } from "react";

/**
 * Single source of truth for the current platform so the ONE settings system can
 * show each option only where it makes sense (no separate mobile panel).
 */
export interface Platform {
  isTouch: boolean;
  isMobile: boolean;
  isDesktop: boolean;
  isIOS: boolean;
  isAndroid: boolean;
}

function detect(): Platform {
  if (typeof window === "undefined") {
    return { isTouch: false, isMobile: false, isDesktop: true, isIOS: false, isAndroid: false };
  }
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const ua = navigator.userAgent || "";
  const isIOS = /iP(hone|ad|od)/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
  const isAndroid = /Android/.test(ua);
  const isMobile = coarse || isIOS || isAndroid;
  return { isTouch: coarse || isMobile, isMobile, isDesktop: !isMobile, isIOS, isAndroid };
}

let snapshot = detect();
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  const onChange = () => { snapshot = detect(); cb(); };
  window.addEventListener("resize", onChange);
  const mq = window.matchMedia?.("(pointer: coarse)");
  mq?.addEventListener?.("change", onChange);
  listeners.add(cb);
  return () => {
    window.removeEventListener("resize", onChange);
    mq?.removeEventListener?.("change", onChange);
    listeners.delete(cb);
  };
}

export function usePlatform(): Platform {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
