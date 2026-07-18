import { useState, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  Loader2,
  X,
  Maximize,
  Minimize,
  Layers,
  FileText,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { cn, drivePreviewUrl } from "@/lib/utils";
import { saveReadingState, markChapterCompleted, type ReadingProgressItem } from "@/lib/user-history";
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
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [readerMode, setReaderMode] = useState<"page" | "scroll">(initialMode);
  const [pageWidth, setPageWidth] = useState(700);
  const [loadError, setLoadError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const resumingRef = useRef(initialPage > 0);
  const didResumeRef = useRef(false);

  // Fit page width to the container.
  useEffect(() => {
    const measure = () => {
      const w = scrollRef.current?.clientWidth ?? 700;
      setPageWidth(Math.min(Math.max(w - 24, 280), 900));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [numPages]);

  // Fullscreen state sync.
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = () => {
    const el = rootRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen?.();
    }
  };

  const handleClose = () => {
    try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch { /* noop */ }
    setIsFullscreen(false);
    onClose();
  };

  // Persist reading progress (page within the PDF).
  const persist = useCallback(
    (page: number, total: number) => {
      const progress: ReadingProgressItem = {
        chapterId,
        chapterNum,
        pageNumber: page + 1,
        totalPages: total,
        title,
        coverUrl,
        providerId,
        mangaId,
        readerMode,
        updatedAt: new Date().toISOString(),
      };
      const historyEntry = {
        id: `${providerId}-${mangaId}-${chapterId}`,
        title,
        coverUrl,
        chapterId,
        chapterNum,
        providerId,
        mangaId,
        pageNumber: page + 1,
        timestamp: Date.now(),
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

  // Save whenever the current page changes (but not while auto-resuming).
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
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(compute);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [readerMode, numPages]);

  // Resume: once pages are laid out, scroll to the saved page, then release.
  useEffect(() => {
    if (numPages === 0 || !resumingRef.current || didResumeRef.current) return;
    if (readerMode !== "scroll" || initialPage <= 0) {
      resumingRef.current = false;
      return;
    }
    didResumeRef.current = true;
    let cancelled = false;
    let attempts = 0;
    let lastTop = -1;
    let stable = 0;
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
      if (stable >= 3 || attempts >= 40) {
        resumingRef.current = false;
        return;
      }
      requestAnimationFrame(() => setTimeout(align, 120));
    };
    const t = setTimeout(align, 80);
    const abort = () => {
      cancelled = true;
      resumingRef.current = false;
    };
    const container = scrollRef.current;
    container?.addEventListener("wheel", abort, { passive: true });
    container?.addEventListener("touchstart", abort, { passive: true });
    return () => {
      cancelled = true;
      clearTimeout(t);
      container?.removeEventListener("wheel", abort);
      container?.removeEventListener("touchstart", abort);
    };
  }, [numPages, readerMode, initialPage]);

  const goTo = (page: number) => {
    const clamped = Math.max(0, Math.min(page, numPages - 1));
    setCurrentPage(clamped);
  };

  const previewFallback = drivePreviewUrl(rawUrl);

  return (
    <div ref={rootRef} className="fixed inset-0 z-[100] bg-black/95 flex flex-col">
      {/* Header */}
      {!isFullscreen && (
        <div className="bg-black border-b-4 border-white/20 p-3 sm:p-4 text-white flex items-center justify-between gap-3 select-none">
          <div className="min-w-0 flex-1">
            <h4 className="font-display text-sm sm:text-xl truncate" title={title}>{title}</h4>
            <p className="font-sans text-3xs sm:text-xs font-bold text-gray-400 mt-0.5">
              PDF · {numPages > 0 ? `${currentPage + 1} / ${numPages}` : "carregando..."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!loadError && (
              <div className="flex border-2 border-white/20 rounded overflow-hidden">
                <button
                  onClick={() => setReaderMode("scroll")}
                  className={cn("px-2 sm:px-3 py-1 font-sans font-bold text-2xs sm:text-xs flex items-center gap-1", readerMode === "scroll" ? "bg-white text-black" : "bg-black text-white")}
                  title="Modo Cascata"
                >
                  <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden xs:inline">Cascata</span>
                </button>
                <button
                  onClick={() => setReaderMode("page")}
                  className={cn("px-2 sm:px-3 py-1 font-sans font-bold text-2xs sm:text-xs flex items-center gap-1", readerMode === "page" ? "bg-white text-black" : "bg-black text-white")}
                  title="Modo Página"
                >
                  <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden xs:inline">Página</span>
                </button>
              </div>
            )}
            <button onClick={handleClose} className="bg-primary hover:bg-red-600 text-white p-1.5 sm:p-2 border-2 border-white rounded" title="Fechar">
              <X className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto flex justify-center p-3 sm:p-4">
        {loadError ? (
          <div className="max-w-lg w-full bg-white border-4 border-black p-8 text-center text-black rounded-xl comic-shadow self-center">
            <AlertCircle className="w-12 h-12 text-primary mx-auto mb-3" />
            <h4 className="font-display text-2xl uppercase mb-2">Não deu pra renderizar o PDF</h4>
            <p className="font-sans font-bold text-sm text-gray-600 mb-6">
              Abrindo no visualizador padrão. (Nesse modo não é possível salvar a página.)
            </p>
            {previewFallback ? (
              <iframe src={previewFallback} className="w-full h-[60vh] border-4 border-black rounded" title={title} />
            ) : (
              <a href={rawUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-primary text-white font-display px-6 py-3 border-2 border-black rounded hover:bg-yellow-400 hover:text-black">
                ABRIR PDF <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        ) : (
          <Document
            file={fileUrl}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={() => setLoadError(true)}
            onSourceError={() => setLoadError(true)}
            loading={
              <div className="self-center py-24 text-center text-white">
                <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                <p className="font-display text-xl">CARREGANDO PDF...</p>
              </div>
            }
            error={
              <div className="self-center py-24 text-center text-white">
                <p className="font-display text-xl">Falha ao carregar o PDF.</p>
              </div>
            }
          >
            {numPages > 0 && (
              readerMode === "scroll" ? (
                <div className="w-full flex flex-col items-center gap-4" style={{ maxWidth: pageWidth }}>
                  {Array.from({ length: numPages }).map((_, idx) => {
                    // Only render a window of pages around the current one so large
                    // PDFs don't render hundreds of canvases at once and freeze.
                    const active = Math.abs(idx - currentPage) <= 4;
                    return (
                      <div key={idx} ref={(el) => { pageRefs.current[idx] = el; }} className="relative border-4 border-white/10 bg-white w-full">
                        {active ? (
                          <>
                            <Page
                              pageNumber={idx + 1}
                              width={pageWidth}
                              renderTextLayer={false}
                              renderAnnotationLayer={false}
                              loading={<div style={{ height: pageWidth * 1.4 }} className="flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}
                            />
                            <div className="absolute bottom-2 right-2 bg-black/60 text-white font-sans text-xs px-2 py-1">Pág. {idx + 1}</div>
                          </>
                        ) : (
                          <div style={{ height: pageWidth * 1.4 }} className="flex items-center justify-center text-white/20 font-display text-2xl">{idx + 1}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="border-4 border-white/10 bg-white">
                    <Page pageNumber={currentPage + 1} width={pageWidth} renderTextLayer={false} renderAnnotationLayer={false} />
                  </div>
                  <div className="flex items-center gap-6 bg-zinc-900 px-6 py-3 rounded-full border-2 border-white/20 sticky bottom-4">
                    <button disabled={currentPage === 0} onClick={() => goTo(currentPage - 1)} className="text-white hover:text-secondary disabled:opacity-30">
                      <ChevronLeft className="w-8 h-8" strokeWidth={3} />
                    </button>
                    <span className="font-display text-lg text-white">{currentPage + 1} / {numPages}</span>
                    <button disabled={currentPage === numPages - 1} onClick={() => goTo(currentPage + 1)} className="text-white hover:text-secondary disabled:opacity-30">
                      <ChevronRight className="w-8 h-8" strokeWidth={3} />
                    </button>
                  </div>
                </div>
              )
            )}
          </Document>
        )}
      </div>

      {/* Floating controls — always visible, incl. in fullscreen */}
      <div className="fixed bottom-6 right-6 z-[110] flex items-center gap-2">
        <button
          onClick={toggleFullscreen}
          className="bg-black/80 hover:bg-black text-white p-3 border-2 border-white/20 rounded-full"
          title="Tela cheia"
        >
          {isFullscreen ? <Minimize className="w-5 h-5" strokeWidth={3} /> : <Maximize className="w-5 h-5" strokeWidth={3} />}
        </button>
        <button
          onClick={handleClose}
          className="bg-primary hover:bg-red-600 text-white p-3 border-2 border-white rounded-full"
          title="Fechar Leitor"
        >
          <X className="w-5 h-5" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
