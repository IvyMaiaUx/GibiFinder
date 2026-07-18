import { useSyncExternalStore, useCallback } from "react";

/**
 * Reader preferences, persisted to localStorage and shared across every reader
 * instance via a tiny external store (no Provider needed). This is the Phase 1
 * foundation for the theming / layout / data-saver settings added in later phases.
 * Nothing here changes behaviour yet — consumers opt in as features land.
 */
export type ReaderTheme = "dark" | "light" | "amoled";
export type FitMode = "width" | "height" | "original";
export type ReadingDirection = "ltr" | "rtl" | "vertical";
export type ImageQuality = "high" | "medium" | "low";

export interface ReaderSettings {
  theme: ReaderTheme;
  fitMode: FitMode;
  direction: ReadingDirection;
  doublePage: boolean;
  /** Gap between pages in cascade/webtoon mode (px). */
  pageGap: number;
  /** Horizontal margin as a % of the reading column. */
  sideMargin: number;
  quality: ImageQuality;
  dataSaver: boolean;
  animations: boolean;
  /** Default zoom applied when a chapter opens. */
  defaultZoom: number;
}

export const READER_SETTINGS_DEFAULTS: ReaderSettings = {
  theme: "dark",
  fitMode: "width",
  direction: "vertical",
  doublePage: false,
  pageGap: 8,
  sideMargin: 0,
  quality: "high",
  dataSaver: false,
  animations: true,
  defaultZoom: 1,
};

const STORAGE_KEY = "gibi-finder:reader-settings";

function load(): ReaderSettings {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return READER_SETTINGS_DEFAULTS;
    // Merge over defaults so new fields are always present.
    return { ...READER_SETTINGS_DEFAULTS, ...(JSON.parse(raw) as Partial<ReaderSettings>) };
  } catch {
    return READER_SETTINGS_DEFAULTS;
  }
}

let current: ReaderSettings = load();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Imperative update usable outside React (e.g. quick toggles). */
export function updateReaderSettings(patch: Partial<ReaderSettings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* ignore quota / private mode */
  }
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): ReaderSettings {
  return current;
}

/**
 * Reactive access to the shared reader settings.
 * Usage: const [settings, update] = useReaderSettings();
 */
export function useReaderSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, () => READER_SETTINGS_DEFAULTS);
  const update = useCallback((patch: Partial<ReaderSettings>) => updateReaderSettings(patch), []);
  return [settings, update] as const;
}
