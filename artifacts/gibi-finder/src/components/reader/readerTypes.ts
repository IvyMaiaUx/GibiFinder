export type ReaderMode = "paginated" | "webtoon";
export type ReaderDirection = "ltr" | "rtl";
export type ReaderLayout = "single" | "double" | "auto";
export type ReaderTheme = "dark" | "black" | "light" | "sepia";
export type ReaderFit = "fit-screen" | "fit-width" | "fit-height" | "original";

export interface PageItem {
  id?: string;
  url: string;
  width?: number;
  height?: number;
}

export interface ReaderSettings {
  mode: ReaderMode;
  direction: ReaderDirection;
  layout: ReaderLayout;
  fit: ReaderFit;
  theme: ReaderTheme;
}

export interface SpreadGroup {
  pages: PageItem[];
  isSpread: boolean;
  isNativeWide: boolean;
}

export interface ChapterItem {
  id: string;
  chapterNum: string;
  title?: string;
  language?: string;
  providerId?: string;
}

export interface PanelBox {
  x: number;      // 0 to 1 (proportional)
  y: number;      // 0 to 1
  width: number;  // 0 to 1
  height: number; // 0 to 1
}

export interface PanelDetectionResult {
  panels: PanelBox[];
}
