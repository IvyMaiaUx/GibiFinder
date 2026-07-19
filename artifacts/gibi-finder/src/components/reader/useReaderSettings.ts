import { useSyncExternalStore, useCallback, type CSSProperties } from "react";

/**
 * Reader preferences. Two layers, both persisted to localStorage and shared via a
 * tiny external store (no Provider needed):
 *   - GLOBAL defaults
 *   - PER-WORK overrides (e.g. Batman: LTR, One Piece: RTL)
 * The reader consumes the *effective* settings = global merged with the current
 * work's overrides. Changing a setting never re-mounts images — it only changes
 * render behaviour.
 */
export type ReadingMode = "scroll" | "page" | "double" | "webtoon";
export type ReadingDirection = "ltr" | "rtl";
export type FitMode = "width" | "height" | "whole" | "auto";
export type DoublePageMode = "never" | "always" | "auto";
export type ImageQuality = "auto" | "high" | "original";
export type ReaderTheme = "dark" | "amoled" | "light" | "custom";

export interface ReaderSettings {
  readingMode: ReadingMode;
  direction: ReadingDirection;
  fitMode: FitMode;
  doublePage: DoublePageMode;
  // Zoom
  rememberZoom: boolean;
  maxZoom: number;
  doubleTapZoom: boolean;
  // Interface
  autoHideMs: number; // 0 = never hide
  showPageNumber: boolean;
  showProgress: boolean;
  showBottomBar: boolean;
  theme: ReaderTheme;
  // Custom theme knobs (used when theme === "custom").
  customBg: string;   // reading background colour
  customUi: string;   // text / controls tint
  barOpacity: number; // chrome bars opacity, 0-100
  shadow: number;     // shadow intensity, 0-100
  // Performance
  preloadAhead: number;
  memorySaver: boolean;
  quality: ImageQuality;
  // Layout
  pageGap: number;
  animations: boolean;
}

export const READER_SETTINGS_DEFAULTS: ReaderSettings = {
  readingMode: "scroll",
  direction: "ltr",
  fitMode: "width",
  doublePage: "auto",
  rememberZoom: false,
  maxZoom: 4,
  doubleTapZoom: true,
  autoHideMs: 4000,
  showPageNumber: true,
  showProgress: true,
  showBottomBar: true,
  theme: "dark",
  customBg: "#0d0f14",
  customUi: "#e6e6e6",
  barOpacity: 90,
  shadow: 60,
  preloadAhead: 7,
  memorySaver: false,
  quality: "auto",
  pageGap: 8,
  animations: true,
};

function hexToRgb(hex: string): string {
  const m = hex.replace("#", "").match(/.{1,2}/g);
  if (!m || m.length < 3) return "0,0,0";
  const [r, g, b] = m.map(x => parseInt(x, 16));
  return `${r},${g},${b}`;
}

/**
 * Reader theme as CSS custom properties applied to the reader root. Every surface
 * (bars, controls, slider, borders, shadows) reads from these vars, so switching
 * theme is instant and never re-mounts anything. Themes are a design system, not
 * just a background colour.
 */
export function readerThemeVars(s: ReaderSettings): CSSProperties {
  let bg: string, textRgb: string, surfaceRgb: string, scheme: "dark" | "light";
  switch (s.theme) {
    case "light": bg = "#F7F6F2"; textRgb = "27,27,27"; surfaceRgb = "247,246,242"; scheme = "light"; break;
    case "amoled": bg = "#000000"; textRgb = "212,212,212"; surfaceRgb = "0,0,0"; scheme = "dark"; break;
    case "custom": bg = s.customBg; textRgb = hexToRgb(s.customUi); surfaceRgb = hexToRgb(s.customBg); scheme = "dark"; break;
    default: bg = "#121212"; textRgb = "232,232,232"; surfaceRgb = "18,18,18"; scheme = "dark"; break;
  }
  const isLight = scheme === "light";
  const borderRgb = isLight ? "0,0,0" : "255,255,255";
  const shadowA = (s.shadow / 100) * (isLight ? 0.22 : 0.6);
  return {
    ["--rd-bg" as string]: bg,
    ["--rd-text" as string]: `rgb(${textRgb})`,
    ["--rd-muted" as string]: `rgba(${textRgb},0.5)`,
    ["--rd-surface" as string]: `rgba(${surfaceRgb}, ${Math.max(0, Math.min(100, s.barOpacity)) / 100})`,
    ["--rd-control" as string]: `rgba(${borderRgb}, ${isLight ? 0.06 : 0.1})`,
    ["--rd-border" as string]: `rgba(${borderRgb}, 0.15)`,
    ["--rd-shadow" as string]: `0 10px 34px rgba(0,0,0,${shadowA})`,
    background: bg,
    colorScheme: scheme,
  } as CSSProperties;
}

const GLOBAL_KEY = "gibi-finder:reader-settings";
const WORK_KEY = "gibi-finder:reader-work-settings";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

let globalSettings: ReaderSettings = {
  ...READER_SETTINGS_DEFAULTS,
  ...readJson<Partial<ReaderSettings>>(GLOBAL_KEY, {}),
};
let workOverrides: Record<string, Partial<ReaderSettings>> = readJson(WORK_KEY, {});

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Update the global defaults. */
export function updateGlobalSettings(patch: Partial<ReaderSettings>) {
  globalSettings = { ...globalSettings, ...patch };
  try {
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(globalSettings));
  } catch { /* ignore */ }
  emit();
}

/** Update (or clear) the overrides for one work. */
export function updateWorkSettings(workId: string, patch: Partial<ReaderSettings> | null) {
  if (!workId) return;
  if (patch === null) {
    delete workOverrides[workId];
  } else {
    workOverrides = { ...workOverrides, [workId]: { ...workOverrides[workId], ...patch } };
  }
  try {
    localStorage.setItem(WORK_KEY, JSON.stringify(workOverrides));
  } catch { /* ignore */ }
  emit();
}

// Cache the merged object per (globalSettings, workOverrides[workId]) identity so
// useSyncExternalStore doesn't loop on a fresh object every render.
const mergedCache = new WeakMap<object, Record<string, ReaderSettings>>();
function getEffective(workId?: string): ReaderSettings {
  if (!workId) return globalSettings;
  let byWork = mergedCache.get(globalSettings);
  if (!byWork) {
    byWork = {};
    mergedCache.set(globalSettings, byWork);
  }
  const override = workOverrides[workId];
  const cacheKey = workId + ":" + JSON.stringify(override || {});
  if (!byWork[cacheKey]) {
    byWork[cacheKey] = override ? { ...globalSettings, ...override } : globalSettings;
  }
  return byWork[cacheKey];
}

/**
 * Effective reader settings for the given work (global + per-work overrides).
 * Returns [settings, update, hasWorkOverride]. `update(patch, "work")` writes to
 * the per-work layer; `update(patch)` (or "global") writes the global defaults.
 */
export function useReaderSettings(workId?: string) {
  const settings = useSyncExternalStore(
    subscribe,
    () => getEffective(workId),
    () => READER_SETTINGS_DEFAULTS,
  );
  const update = useCallback(
    (patch: Partial<ReaderSettings>, scope: "global" | "work" = "global") => {
      if (scope === "work" && workId) updateWorkSettings(workId, patch);
      else updateGlobalSettings(patch);
    },
    [workId],
  );
  const clearWork = useCallback(() => {
    if (workId) updateWorkSettings(workId, null);
  }, [workId]);
  const hasWorkOverride = !!(workId && workOverrides[workId]);
  return { settings, update, clearWork, hasWorkOverride };
}
