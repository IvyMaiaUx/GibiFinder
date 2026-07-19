import { useSyncExternalStore, useCallback, useEffect, useRef, type CSSProperties } from "react";

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
export type SplitMode = "off" | "manual";
export type ImmersionLevel = "clean" | "cinema" | "immersion";
export type TapAction = "prev" | "next" | "menu";
export type ImageQuality = "auto" | "high" | "original";
export type ReaderTheme = "dark" | "amoled" | "light" | "custom";

export interface ReaderSettings {
  readingMode: ReadingMode;
  direction: ReadingDirection;
  fitMode: FitMode;
  doublePage: DoublePageMode;
  splitMode: SplitMode;
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
  immersion: ImmersionLevel;
  blockContextMenu: boolean;
  // Custom theme knobs (used when theme === "custom").
  customBg: string;   // reading background colour
  customUi: string;   // text / controls tint
  barOpacity: number; // chrome bars opacity, 0-100
  shadow: number;     // shadow intensity, 0-100
  // Performance
  preloadAhead: number;
  memorySaver: boolean;
  quality: ImageQuality;
  /** Keep the screen on while reading (Wake Lock, mobile + desktop). */
  keepAwake: boolean;
  /** Haptic feedback on page turn / actions (mobile). */
  haptics: boolean;
  /** In-reader brightness 0-100 (100 = normal; lower dims via an overlay). */
  brightness: number;
  /** Tap zones for page mode: [left, centre, right]. */
  tapZones: [TapAction, TapAction, TapAction];
  // Layout
  pageGap: number;
  animations: boolean;
}

export const READER_SETTINGS_DEFAULTS: ReaderSettings = {
  readingMode: "scroll",
  direction: "ltr",
  fitMode: "width",
  doublePage: "auto",
  splitMode: "manual",
  rememberZoom: false,
  maxZoom: 4,
  doubleTapZoom: true,
  autoHideMs: 4000,
  showPageNumber: true,
  showProgress: true,
  showBottomBar: true,
  theme: "dark",
  immersion: "clean",
  blockContextMenu: false,
  customBg: "#0d0f14",
  customUi: "#e6e6e6",
  barOpacity: 90,
  shadow: 60,
  preloadAhead: 7,
  memorySaver: false,
  quality: "auto",
  keepAwake: false,
  haptics: true,
  brightness: 100,
  tapZones: ["prev", "menu", "next"],
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
/* ---- Reading profiles (presets) ---- */
export interface ReaderProfile {
  id: string;
  name: string;
  icon?: string;
  builtin?: boolean;
  settings: Partial<ReaderSettings>;
}

export const BUILTIN_PROFILES: ReaderProfile[] = [
  { id: "manga", name: "Mangá", icon: "📖", builtin: true, settings: { readingMode: "page", direction: "rtl", theme: "amoled", fitMode: "width", immersion: "cinema", doublePage: "auto" } },
  { id: "hq", name: "HQ", icon: "📚", builtin: true, settings: { readingMode: "page", direction: "ltr", theme: "dark", doublePage: "always", fitMode: "whole" } },
  { id: "webtoon", name: "Webtoon", icon: "📱", builtin: true, settings: { readingMode: "scroll", direction: "ltr", theme: "dark", fitMode: "width" } },
  { id: "night", name: "Noturno", icon: "🌙", builtin: true, settings: { theme: "amoled", autoHideMs: 2000 } },
  { id: "day", name: "Dia", icon: "☀️", builtin: true, settings: { theme: "light", autoHideMs: 4000 } },
];

const PROFILES_KEY = "gibi-finder:reader-profiles";
const PROFILE_FIELDS: (keyof ReaderSettings)[] = [
  "readingMode", "direction", "fitMode", "doublePage", "splitMode", "theme",
  "autoHideMs", "maxZoom", "rememberZoom", "doubleTapZoom", "preloadAhead",
  "immersion", "customBg", "customUi", "barOpacity", "shadow",
];

export function getCustomProfiles(): ReaderProfile[] {
  return readJson<ReaderProfile[]>(PROFILES_KEY, []);
}
export function saveCustomProfile(name: string, id: string): ReaderProfile {
  const snapshot: Partial<ReaderSettings> = {};
  for (const f of PROFILE_FIELDS) (snapshot as Record<string, unknown>)[f] = globalSettings[f];
  const profile: ReaderProfile = { id, name, settings: snapshot };
  const list = getCustomProfiles().filter(p => p.id !== id);
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify([...list, profile])); } catch { /* ignore */ }
  return profile;
}
export function deleteCustomProfile(id: string) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(getCustomProfiles().filter(p => p.id !== id))); } catch { /* ignore */ }
}

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

/* ---- Cross-device sync (account) ---- */
// Device-specific settings stay local; everything else syncs.
const LOCAL_ONLY_FIELDS: (keyof ReaderSettings)[] = ["haptics", "tapZones", "brightness", "keepAwake"];

function getSyncableSettings(): Partial<ReaderSettings> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(globalSettings) as (keyof ReaderSettings)[]) {
    if (!LOCAL_ONLY_FIELDS.includes(k)) out[k as string] = globalSettings[k];
  }
  return out as Partial<ReaderSettings>;
}

export function getSyncPayload() {
  return { settings: getSyncableSettings(), profiles: getCustomProfiles(), workOverrides };
}

let hydrating = false;
export function hydrateFromAccount(data: {
  settings?: Partial<ReaderSettings>;
  profiles?: ReaderProfile[];
  workOverrides?: Record<string, Partial<ReaderSettings>>;
}) {
  hydrating = true;
  try {
    if (data.settings) {
      globalSettings = { ...globalSettings, ...data.settings };
      try { localStorage.setItem(GLOBAL_KEY, JSON.stringify(globalSettings)); } catch { /* ignore */ }
    }
    if (Array.isArray(data.profiles)) {
      try { localStorage.setItem(PROFILES_KEY, JSON.stringify(data.profiles)); } catch { /* ignore */ }
    }
    if (data.workOverrides) {
      workOverrides = data.workOverrides;
      try { localStorage.setItem(WORK_KEY, JSON.stringify(workOverrides)); } catch { /* ignore */ }
    }
    emit();
  } finally {
    hydrating = false;
  }
}

const SYNC_BASE = typeof window !== "undefined" ? (import.meta.env.BASE_URL || "").replace(/\/$/, "") : "";

/**
 * Keeps the (cross-platform) reader settings + profiles + per-work overrides in
 * sync with the account. Call once with the logged-in user id. Hydrates on login
 * and pushes changes (debounced). Device-specific options stay local.
 */
export function useSettingsSync(userId?: string) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${SYNC_BASE}/api/auth/reader-settings?userId=${encodeURIComponent(userId)}`);
        if (res.ok && active) hydrateFromAccount(await res.json());
      } catch { /* ignore */ }
    })();
    const push = () => {
      if (hydrating) return; // don't echo our own hydrate back
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        fetch(`${SYNC_BASE}/api/auth/reader-settings/upsert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, ...getSyncPayload() }),
        }).catch(() => { /* ignore */ });
      }, 1500);
    };
    listeners.add(push);
    return () => {
      active = false;
      if (timer.current) clearTimeout(timer.current);
      listeners.delete(push);
    };
  }, [userId]);
}
