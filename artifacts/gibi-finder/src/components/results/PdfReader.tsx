import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  Loader2, X, Maximize, Minimize, Layers, FileText,
  ChevronLeft, ChevronRight, AlertCircle, ExternalLink, SlidersHorizontal,
} from "lucide-react";
import { cn, drivePreviewUrl } from "@/lib/utils";
import { saveReadingState, markChapterCompleted, type ReadingProgressItem } from "@/lib/user-history";
import { useReaderSettings, readerThemeVars } from "@/components/reader/useReaderSettings";
import { ReaderSettingsPanel } from "@/components/reader/ReaderSettingsPanel";
import { useReaderZoom } from "@/components/reader/useReaderZoom";
// `?url` makes Vite emit the worker as a hashed asset and hand us its final URL.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// pdf.js worker (bundled by Vite).
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfReaderProps {
  fileUrl: string;        // proxied URL pdf.js will fetch
  rawUrl: string;         // original source URL (for the iframe fallback)
  title: string;
  coverUrl?: string;
  progressKey: string;
  providerId: string;
  mangaId: string;
  chapterId: string;
  chapterNum: string;
  initialPage?: number;   // 0-indexed
  readerMode?: "page" | "scroll";
  userId?: string;
  onClose: () => void;
}

export function PdfReader({
  fileUrl,
  rawUrl,
  title,
  coverUrl,
  progressKey,
  providerId,
  mangaId,
  chapterId,
  chapterNum,
  initialPage = 0,
  readerMode: initialMode = "scroll",
  userId,
  onClose,
}: PdfReaderProps) {
  // Same settings system as the image reader — themes, immersion, zoom, etc. all
  // come from here (per-work override keyed by the work id).
  const workId = progressKey || mangaId;
  const { settings, update: updateSettings } = useReaderSettings(workId);

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [readerMode, setReaderMode] = useState<"page" | "scroll">(initialMode);
  const [pageWidth, setPageWidth] = useState(700);
  const [loadError, setLoadError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false); // true = chrome hidden
  const [showSettings, setShowSettings] = useState(false);
  const [uiActive, setUiActive] = useState(true);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const resumingRef = useRef(initialPage > 0);
  const didResumeRef = useRef(false);

  const immersion = settings.immersion;
  const chromeVisible = immersion === "clean" ? !isFullscreen : false;
  const cursorHidden = immersion !== "clean" && !uiActive;
  const rtl = settings.direction === "rtl";

  const { zoom } = useReaderZoom(scrollRef, {
    enabled: true,
    resetKey: settings.rememberZoom ? "keep" : `${readerMode}`,
    max: settings.maxZoom,
    doubleTap: settings.doubleTapZoom,
  });

  // ---- Fullscreen (desktop / iPad; no-op on iPhone Safari) ----
  const requestReaderFullscreen = useCallback(() => {
    const el = rootRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    if (!el) return;
    const anyDoc = document as Document & { webkitFullscreenElement?: Element };
    if (anyDoc.fullscreenElement || anyDoc.webkitFullscreenElement) return;
    try { (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el); } catch { /* ignore */ }
  }, []);
  const exitReaderFullscreen = useCallback(() => {
    const anyDoc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    if (!(anyDoc.fullscreenElement || anyDoc.webkitFullscreenElement)) return;
    try { (document.exitFullscreen || anyDoc.webkitExitFullscreen)?.call(document); } catch { /* ignore */ }
  }, []);

  // Immersion: block drag/context menu; exit fullscreen on leave.
  useEffect(() => {
    if (immersion !== "immersion") return;
    const el = rootRef.current;
    const stopDrag = (e: Event) => e.preventDefault();
    const stopCtx = (e: Event) => { if (settings.blockContextMenu) e.preventDefault(); };
    el?.addEventListener("dragstart", stopDrag);
    el?.addEventListener("contextmenu", stopCtx);
    return () => {
      el?.removeEventListener("dragstart", stopDrag);
      el?.removeEventListener("contextmenu", stopCtx);
      exitReaderFullscreen();
    };
  }, [immersion, settings.blockContextMenu, exitReaderFullscreen]);

  // Keep the screen awake while reading (Wake Lock).
  useEffect(() => {
    if (!settings.keepAwake) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    if (!nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const acquire = async () => { try { lock = await nav.wakeLock!.request("screen"); } catch { /* ignore */ } };
    acquire();
    const onVis = () => { if (document.visibilityState === "visible" && !cancelled) acquire(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      try { lock?.release?.(); } catch { /* ignore */ }
    };
  }, [settings.keepAwake]);

  // Lock body scroll so only the reader scrolls (steadier on iOS).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Auto-hide chrome in the clean level after a few seconds of inactivity.
  useEffect(() => {
    if (isFullscreen || !settings.autoHideMs || immersion !== "clean") return;
    const t = setTimeout(() => setIsFullscreen(true), settings.autoHideMs);
    return () => clearTimeout(t);
  }, [isFullscreen, settings.autoHideMs, immersion, currentPage]);

  // Activity tracking for cinema/immersion: reveal the floating control briefly.
  useEffect(() => {
    if (immersion === "clean") { setUiActive(true); return; }
    let t: ReturnType<typeof setTimeout>;
    const ping = () => {
      setUiActive(true);
      clearTimeout(t);
      t = setTimeout(() => setUiActive(false), 2500);
    };
    ping();
    const el = rootRef.current;
    el?.addEventListener("pointermove", ping);
    el?.addEventListener("pointerdown", ping);
    return () => { clearTimeout(t); el?.removeEventListener("pointermove", ping); el?.removeEventListener("pointerdown", ping); };
  }, [immersion]);

  // Fit page width to the container.
  useEffect(() => {
    const measure = () => {
      const w = scrollRef.current?.clientWidth ?? 700;
      setPageWidth(Math.min(Math.max(w - 24, 280), 1000));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [numPages]);

  const handleClose = () => { exitReaderFullscreen(); onClose(); };
  const toggleChrome = useCallback(() => setIsFullscreen(prev => !prev), []);
  const haptic = () => { if (settings.haptics && typeof navigator.vibrate === "function") navigator.vibrate(6); };

  // Persist reading progress (page within the PDF).
  const persist = useCallback(
    (page: number, total: number) => {
      const progress: ReadingProgressItem = {
        chapterId, chapterNum, pageNumber: page + 1, totalPages: total,
        title, coverUrl, providerId, mangaId, readerMode,
        updatedAt: new Date().toISOString(),
      };
      const historyEntry = {
        id: `${providerId}-${mangaId}-${chapterId}`,
        title, coverUrl, chapterId, chapterNum, providerId, mangaId,
        pageNumber: page + 1, timestamp: Date.now(),
      };
      saveReadingState(progressKey, progress, historyEntry, userId);
      if (total > 0 && page >= total - 1) {
        markChapterCompleted(
          { providerId, mangaId, title, coverUrl, chapterId, chapterNum, completedAt: new Date().toISOString() },
          userId
        );
      }
    },
    [chapterId, chapterNum, title, coverUrl, providerId, mangaId, readerMode, progressKey, userId]
  );

  useEffect(() => {
    if (numPages === 0 || resumingRef.current) return;
    persist(currentPage, numPages);
  }, [currentPage, numPages, persist]);

  // Track the current page while scrolling in cascade mode.
  useEffect(() => {
    if (readerMode !== "scroll" || numPages === 0) return;
    const container = scrollRef.current;
    if (!container) return;
    let raf = 0;
    const compute = () => {
      raf = 0;
      if (resumingRef.current) return;
      const marker = container.getBoundingClientRect().top + container.clientHeight * 0.3;
      let best = 0;
      for (let i = 0; i < pageRefs.current.length; i++) {
        const el = pageRefs.current[i];
        if (!el) continue;
        if (el.getBoundingClientRect().top <= marker) best = i;
        else break;
      }
      setCurrentPage(prev => (prev === best ? prev : best));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(compute); };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => { container.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [readerMode, numPages]);

  // Resume: once pages are laid out, scroll to the saved page, then release.
  useEffect(() => {
    if (numPages === 0 || !resumingRef.current || didResumeRef.current) return;
    if (readerMode !== "scroll" || initialPage <= 0) { resumingRef.current = false; return; }
    didResumeRef.current = true;
    let cancelled = false, attempts = 0, lastTop = -1, stable = 0;
    const align = () => {
      if (cancelled) return;
      const el = pageRefs.current[initialPage];
      if (el) {
        el.scrollIntoView({ behavior: "auto", block: "start" });
        const top = el.offsetTop;
        stable = Math.abs(top - lastTop) < 2 ? stable + 1 : 0;
        lastTop = top;
      }
      attempts += 1;
      if (stable >= 3 || attempts >= 40) { resumingRef.current = false; return; }
      requestAnimationFrame(() => setTimeout(align, 120));
    };
    const t = setTimeout(align, 80);
    const abort = () => { cancelled = true; resumingRef.current = false; };
    const container = scrollRef.current;
    container?.addEventListener("wheel", abort, { passive: true });
    container?.addEventListener("touchstart", abort, { passive: true });
    return () => {
      cancelled = true; clearTimeout(t);
      container?.removeEventListener("wheel", abort);
      container?.removeEventListener("touchstart", abort);
    };
  }, [numPages, readerMode, initialPage]);

  // Navigation.
  const goRelative = (delta: number) => {
    setCurrentPage(prev => {
      const next = Math.max(0, Math.min(prev + delta, numPages - 1));
      if (next !== prev) {
        haptic();
        if (readerMode === "scroll") pageRefs.current[next]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return next;
    });
  };
  const nextPage = () => goRelative(1);
  const prevPage = () => goRelative(-1);

  // Immersion cycling helpers (used by keyboard + panel gesture).
  const enterImmersion = () => { updateSettings({ immersion: "immersion" }, workId ? "work" : "global"); requestReaderFullscreen(); };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showSettings) { if (e.key === "Escape") setShowSettings(false); return; }
      switch (e.key) {
        case "ArrowRight": rtl ? prevPage() : nextPage(); break;
        case "ArrowLeft": rtl ? nextPage() : prevPage(); break;
        case "ArrowUp": prevPage(); break;
        case "ArrowDown": case " ": e.preventDefault(); nextPage(); break;
        case "f": case "F":
          if (document.fullscreenElement) exitReaderFullscreen(); else requestReaderFullscreen();
          break;
        case "i": case "I":
          if (immersion === "immersion") updateSettings({ immersion: "clean" }, workId ? "work" : "global");
          else enterImmersion();
          break;
        case "s": case "S": setShowSettings(v => !v); break;
        case "Escape":
          if (immersion !== "clean") updateSettings({ immersion: "clean" }, workId ? "work" : "global");
          else handleClose();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages, readerMode, rtl, immersion, showSettings, workId]);

  // Tap zones (page mode): [left, centre, right] -> actions; rtl flips the default.
  const isDefaultZones = settings.tapZones[0] === "prev" && settings.tapZones[1] === "menu" && settings.tapZones[2] === "next";
  const tapZones = (isDefaultZones && rtl) ? (["next", "menu", "prev"] as const) : settings.tapZones;
  const doTap = (a: string) => { if (a === "prev") prevPage(); else if (a === "next") nextPage(); else toggleChrome(); };

  const previewFallback = drivePreviewUrl(rawUrl);
  const pct = numPages > 0 ? ((currentPage + 1) / numPages) * 100 : 0;

  // Themed chrome styles.
  const barStyle: CSSProperties = {
    background: "var(--rd-surface)",
    color: "var(--rd-text)",
    borderColor: "var(--rd-border)",
    backdropFilter: "blur(8px)",
  };

  return (
    <div
      ref={rootRef}
      data-reader-theme={settings.theme}
      className="fixed inset-0 z-[100] flex flex-col select-none"
      style={{ ...readerThemeVars(settings), WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none", cursor: cursorHidden ? "none" : undefined }}
    >
      {/* Brightness dimmer (can only darken). */}
      {settings.brightness < 100 && (
        <div className="fixed inset-0 z-[124] pointer-events-none" style={{ background: "#000", opacity: ((100 - settings.brightness) / 100) * 0.75 }} aria-hidden="true" />
      )}

      {/* Header (clean level) */}
      {chromeVisible && (
        <div className="border-b flex items-center justify-between gap-3 p-3 sm:p-4 animate-in fade-in slide-in-from-top-2 duration-150" style={barStyle}>
          <div className="min-w-0 flex-1">
            <h4 className="font-display text-sm sm:text-xl truncate" title={title}>{title}</h4>
            <p className="font-sans text-3xs sm:text-xs font-bold mt-0.5" style={{ color: "var(--rd-muted)" }}>
              PDF · {numPages > 0 ? `${currentPage + 1} / ${numPages}` : "carregando..."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!loadError && (
              <div className="flex border rounded overflow-hidden" style={{ borderColor: "var(--rd-border)" }}>
                <button onClick={() => setReaderMode("scroll")} title="Modo Cascata"
                  className={cn("px-2 sm:px-3 py-1 font-sans font-bold text-2xs sm:text-xs flex items-center gap-1", readerMode === "scroll" ? "bg-white text-black" : "")}
                  style={readerMode !== "scroll" ? { color: "var(--rd-text)" } : undefined}>
                  <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden xs:inline">Cascata</span>
                </button>
                <button onClick={() => setReaderMode("page")} title="Modo Página"
                  className={cn("px-2 sm:px-3 py-1 font-sans font-bold text-2xs sm:text-xs flex items-center gap-1", readerMode === "page" ? "bg-white text-black" : "")}
                  style={readerMode !== "page" ? { color: "var(--rd-text)" } : undefined}>
                  <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden xs:inline">Página</span>
                </button>
              </div>
            )}
            <button onClick={() => setShowSettings(true)} title="Configurações (S)" className="p-1.5 sm:p-2 border rounded" style={{ borderColor: "var(--rd-border)", color: "var(--rd-text)" }}>
              <SlidersHorizontal className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button onClick={() => (document.fullscreenElement ? exitReaderFullscreen() : requestReaderFullscreen())} title="Tela cheia (F)" className="p-1.5 sm:p-2 border rounded hidden sm:block" style={{ borderColor: "var(--rd-border)", color: "var(--rd-text)" }}>
              <Maximize className="w-5 h-5" />
            </button>
            <button onClick={handleClose} className="bg-primary hover:bg-red-600 text-white p-1.5 sm:p-2 border-2 border-white rounded transition-colors" title="Fechar (Esc)">
              <X className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain flex justify-center p-3 sm:p-4"
        onClick={readerMode === "scroll" ? toggleChrome : undefined}
      >
        {loadError ? (
          <div className="max-w-lg w-full bg-white border-4 border-black p-8 text-center text-black rounded-xl comic-shadow self-center">
            <AlertCircle className="w-12 h-12 text-primary mx-auto mb-3" />
            <h4 className="font-display text-2xl uppercase mb-2">Não deu pra renderizar o PDF</h4>
            <p className="font-sans font-bold text-sm text-gray-600 mb-6">Abrindo no visualizador padrão. (Nesse modo não é possível salvar a página.)</p>
            {previewFallback ? (
              <iframe src={previewFallback} className="w-full h-[60vh] border-4 border-black rounded" title={title} />
            ) : (
              <a href={rawUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-primary text-white font-display px-6 py-3 border-2 border-black rounded hover:bg-yellow-400 hover:text-black">
                ABRIR PDF <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        ) : (
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center", width: pageWidth, maxWidth: "100%" }}>
            <Document
              file={fileUrl}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              onLoadError={() => setLoadError(true)}
              onSourceError={() => setLoadError(true)}
              loading={
                <div className="self-center py-24 text-center" style={{ color: "var(--rd-text)" }}>
                  <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                  <p className="font-display text-xl">CARREGANDO PDF...</p>
                </div>
              }
              error={<div className="self-center py-24 text-center font-display text-xl" style={{ color: "var(--rd-text)" }}>Falha ao carregar o PDF.</div>}
            >
              {numPages > 0 && (
                readerMode === "scroll" ? (
                  <div className="w-full flex flex-col items-center" style={{ gap: settings.pageGap }}>
                    {Array.from({ length: numPages }).map((_, idx) => {
                      const active = Math.abs(idx - currentPage) <= (settings.memorySaver ? 2 : 4);
                      return (
                        <div key={idx} ref={(el) => { pageRefs.current[idx] = el; }} className="relative bg-white w-full" style={{ boxShadow: "var(--rd-shadow)" }}>
                          {active ? (
                            <>
                              <Page pageNumber={idx + 1} width={pageWidth} renderTextLayer={false} renderAnnotationLayer={false}
                                loading={<div style={{ height: pageWidth * 1.4 }} className="flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>} />
                              {settings.showPageNumber && <div className="absolute bottom-2 right-2 bg-black/60 text-white font-sans text-xs px-2 py-1 rounded">{idx + 1}</div>}
                            </>
                          ) : (
                            <div style={{ height: pageWidth * 1.4 }} className="flex items-center justify-center font-display text-2xl" >{idx + 1}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="relative flex flex-col items-center">
                    <div className="bg-white" style={{ boxShadow: "var(--rd-shadow)" }}>
                      <Page pageNumber={currentPage + 1} width={pageWidth} renderTextLayer={false} renderAnnotationLayer={false} />
                    </div>
                    {/* Tap zones (page mode) */}
                    <div className="absolute inset-0 flex" onClick={e => e.stopPropagation()}>
                      <div className="h-full" style={{ width: "33%" }} onClick={() => doTap(tapZones[0])} />
                      <div className="h-full" style={{ width: "34%" }} onClick={() => doTap(tapZones[1])} />
                      <div className="h-full" style={{ width: "33%" }} onClick={() => doTap(tapZones[2])} />
                    </div>
                  </div>
                )
              )}
            </Document>
          </div>
        )}
      </div>

      {/* Bottom bar (clean level): progress + page controls in page mode */}
      {chromeVisible && numPages > 0 && (settings.showProgress || settings.showBottomBar) && (
        <div className="border-t px-4 py-2 animate-in fade-in slide-in-from-bottom-2 duration-150" style={barStyle}>
          {settings.showProgress && (
            <div className="h-1.5 w-full rounded-full overflow-hidden mb-2" style={{ background: "var(--rd-control)" }}>
              <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
            </div>
          )}
          <div className="flex items-center justify-center gap-6">
            <button disabled={currentPage === 0} onClick={() => (rtl ? nextPage() : prevPage())} className="disabled:opacity-30" style={{ color: "var(--rd-text)" }}><ChevronLeft className="w-6 h-6" strokeWidth={3} /></button>
            <span className="font-display text-base" style={{ color: "var(--rd-text)" }}>{currentPage + 1} / {numPages}</span>
            <button disabled={currentPage === numPages - 1} onClick={() => (rtl ? prevPage() : nextPage())} className="disabled:opacity-30" style={{ color: "var(--rd-text)" }}><ChevronRight className="w-6 h-6" strokeWidth={3} /></button>
          </div>
        </div>
      )}

      {/* Floating control (cinema / immersion) */}
      {immersion !== "clean" && uiActive && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[122] flex items-center gap-2 px-3 py-2 rounded-full border animate-in fade-in duration-150" style={barStyle}>
          <button onClick={prevPage} disabled={currentPage === 0} className="disabled:opacity-30" style={{ color: "var(--rd-text)" }}><ChevronLeft className="w-5 h-5" strokeWidth={3} /></button>
          <span className="font-display text-sm px-1" style={{ color: "var(--rd-text)" }}>{currentPage + 1}/{numPages || "…"}</span>
          <button onClick={nextPage} disabled={numPages > 0 && currentPage >= numPages - 1} className="disabled:opacity-30" style={{ color: "var(--rd-text)" }}><ChevronRight className="w-5 h-5" strokeWidth={3} /></button>
          <span className="w-px h-5 mx-1" style={{ background: "var(--rd-border)" }} />
          <button onClick={() => setShowSettings(true)} title="Configurações" style={{ color: "var(--rd-text)" }}><SlidersHorizontal className="w-4 h-4" /></button>
          <button onClick={() => updateSettings({ immersion: "clean" }, workId ? "work" : "global")} title="Sair da imersão" style={{ color: "var(--rd-text)" }}><Minimize className="w-4 h-4" /></button>
          <button onClick={handleClose} title="Fechar" className="text-primary"><X className="w-4 h-4" strokeWidth={3} /></button>
        </div>
      )}

      {/* Reader settings drawer — the SAME panel the image reader uses */}
      <ReaderSettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        workId={workId}
        workTitle={title}
        readingMode={readerMode}
        onSetReadingMode={setReaderMode}
        onEnterImmersion={requestReaderFullscreen}
      />
    </div>
  );
}
