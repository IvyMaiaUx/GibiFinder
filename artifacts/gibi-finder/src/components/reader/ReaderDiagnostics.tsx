import { useEffect, useRef, useState } from "react";
import { X, Copy, RefreshCw, Trash2, Activity, Download, Check } from "lucide-react";
import { readerStats, resetReaderStats, reqLog } from "./readerStats";

export interface DiagInfo {
  mode: string;
  direction: string;
  fit: string;
  theme: string;
  zoom: number;
  page: number;
  total: number;
  chapterNum?: string;
  provider?: string;
  engine?: string;
  pageUrl?: string;
  rendered: number;
  virtualized: number;
  preload: number;
  scrollVirtualized: boolean;
  doublePage: string;
  spreadDetected: boolean;
  aspect: number;
  orientation: string;
  resume: boolean;
  perWork: boolean;
  imgW?: number;
  imgH?: number;
  imgFormat?: string;
  lastFetchMs?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  diag: DiagInfo;
  onReloadChapter: () => void;
  onClearCache: () => void;
  onTestProvider: () => void;
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 leading-5">
      <span className="text-emerald-300/60">{k}</span>
      <span className="text-emerald-100 text-right tabular-nums truncate max-w-[60%]">{v}</span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <div className="text-emerald-400 uppercase tracking-widest text-[9px] mb-1">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function ReaderDiagnostics({ open, onClose, diag, onReloadChapter, onClearCache, onTestProvider }: Props) {
  const [tab, setTab] = useState<"reader" | "developer">("reader");
  const [fps, setFps] = useState(0);
  const [mem, setMem] = useState(0);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState({ x: 16, y: 64 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const [, force] = useState(0);

  // FPS + memory sampling while open.
  useEffect(() => {
    if (!open) return;
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (t: number) => {
      frames++;
      if (t - last >= 1000) {
        setFps(frames);
        frames = 0;
        last = t;
        const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        if (m) setMem(Math.round(m.usedJSHeapSize / 1048576));
        force(n => n + 1); // refresh stats/reqLog view
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy });
  };
  const onPointerUp = () => { dragRef.current = null; };

  const buildReport = () =>
    [
      "=== Gibi Finder — Diagnóstico ===",
      `Provider: ${diag.provider ?? "-"} (engine ${diag.engine ?? "-"})`,
      `Modo: ${diag.mode} | Direção: ${diag.direction} | Ajuste: ${diag.fit} | Tema: ${diag.theme}`,
      `Capítulo: ${diag.chapterNum ?? "-"} | Página: ${diag.page}/${diag.total} | Zoom: ${Math.round(diag.zoom * 100)}%`,
      `Página dupla: ${diag.doublePage} | Spread: ${diag.spreadDetected ? "Sim" : "Não"} | Aspect: ${diag.aspect.toFixed(2)} (${diag.orientation})`,
      `FPS: ${fps} | Memória: ${mem ? mem + " MB" : "N/D"} | Render: ${diag.rendered} | Virtualizadas: ${diag.virtualized} | Preload: ${diag.preload}`,
      `Imagem: ${diag.imgW ?? "?"}x${diag.imgH ?? "?"} ${diag.imgFormat ?? ""} | Última req: ${diag.lastFetchMs ?? "?"} ms`,
      `Carregadas: ${readerStats.loaded} | Falhas: ${readerStats.failed} | Retries: ${readerStats.retried}`,
      `Resume: ${diag.resume ? "Ativo" : "—"} | Persistência: ${diag.perWork ? "Por obra" : "Global"}`,
      `URL: ${diag.pageUrl ?? "-"}`,
    ].join("\n");

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(buildReport());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const exportLog = () => {
    const blob = new Blob([buildReport() + "\n\n--- Requests ---\n" + reqLog.map(r => `${r.kind} ${r.status} ${r.ms}ms ${r.url}`).join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gibi-diagnostico.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  return (
    <div
      className="fixed z-[140] w-[300px] max-w-[92vw] bg-black/92 border border-emerald-500/30 rounded-lg shadow-2xl backdrop-blur-sm font-mono text-[11px] text-emerald-100 select-none"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Draggable header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-emerald-500/20 cursor-move"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="flex items-center gap-1.5 text-emerald-400 font-bold uppercase tracking-wider text-[10px]">
          <Activity className="w-3.5 h-3.5" /> Diagnóstico
        </span>
        <button onClick={onClose} className="text-emerald-300/60 hover:text-emerald-100" aria-label="Fechar"><X className="w-4 h-4" /></button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-emerald-500/20 text-[10px]">
        {(["reader", "developer"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 uppercase tracking-wide ${tab === t ? "bg-emerald-500/15 text-emerald-200" : "text-emerald-300/50 hover:text-emerald-200"}`}
          >
            {t === "reader" ? "Leitor" : "Developer"}
          </button>
        ))}
      </div>

      <div className="p-3 max-h-[60vh] overflow-y-auto overscroll-contain">
        {tab === "reader" ? (
          <>
            <Group title="Leitor">
              <Line k="Modo" v={diag.mode} />
              <Line k="Direção" v={diag.direction.toUpperCase()} />
              <Line k="Ajuste" v={diag.fit} />
              <Line k="Tema" v={diag.theme} />
              <Line k="Zoom" v={`${Math.round(diag.zoom * 100)}%`} />
              <Line k="Página" v={`${diag.page} / ${diag.total}`} />
              <Line k="Capítulo" v={diag.chapterNum ?? "-"} />
            </Group>
            <Group title="Performance">
              <Line k="FPS" v={<span className={fps >= 50 ? "text-emerald-300" : fps >= 30 ? "text-yellow-300" : "text-red-400"}>{fps}</span>} />
              <Line k="Renderizadas" v={diag.rendered} />
              <Line k="Virtualizadas" v={diag.virtualized} />
              <Line k="Preload" v={`${diag.preload} pág.`} />
              <Line k="Memória JS" v={mem ? `${mem} MB` : "N/D"} />
              <Line k="Lazy/Virtual." v={diag.scrollVirtualized ? "Ativo" : "—"} />
            </Group>
            <Group title="Imagem atual">
              <Line k="Resolução" v={diag.imgW ? `${diag.imgW} x ${diag.imgH}` : "N/D"} />
              <Line k="Formato" v={diag.imgFormat ?? "N/D"} />
              <Line k="Aspect" v={diag.aspect ? diag.aspect.toFixed(2) : "N/D"} />
              <Line k="Orientação" v={diag.orientation} />
            </Group>
            <Group title="Página dupla">
              <Line k="Modo" v={diag.doublePage} />
              <Line k="Spread detect." v={diag.spreadDetected ? "Sim" : "Não"} />
            </Group>
            <Group title="Rede / Provider">
              <Line k="Provider" v={diag.provider ?? "-"} />
              <Line k="Engine" v={diag.engine ?? "-"} />
              <Line k="Páginas" v={diag.total} />
              <Line k="Última req" v={diag.lastFetchMs != null ? `${diag.lastFetchMs} ms` : "N/D"} />
              <Line k="Carregadas" v={readerStats.loaded} />
              <Line k="Falhas" v={<span className={readerStats.failed ? "text-red-400" : ""}>{readerStats.failed}</span>} />
              <Line k="Retries" v={readerStats.retried} />
            </Group>
            <Group title="Estado">
              <Line k="Resume" v={diag.resume ? "Ativo" : "—"} />
              <Line k="Persistência" v={diag.perWork ? "Por obra" : "Global"} />
              <Line k="RTL" v={diag.direction === "rtl" ? "Sim" : "Não"} />
            </Group>
          </>
        ) : (
          <div className="space-y-1">
            <div className="text-emerald-400 uppercase tracking-widest text-[9px] mb-1">Requests ({reqLog.length})</div>
            {reqLog.length === 0 && <div className="text-emerald-300/40">Nenhuma requisição registrada.</div>}
            {reqLog.map((r, i) => (
              <div key={i} className="flex justify-between gap-2 border-b border-emerald-500/10 py-0.5">
                <span className="text-emerald-300/70">{r.kind}</span>
                <span className={typeof r.status === "number" && r.status >= 400 ? "text-red-400" : "text-emerald-200"}>{r.status}</span>
                <span className="text-emerald-100 tabular-nums">{r.ms}ms</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-1 p-2 border-t border-emerald-500/20 text-[10px]">
        <button onClick={onReloadChapter} className="flex items-center justify-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 py-1.5 rounded"><RefreshCw className="w-3 h-3" /> Recarregar</button>
        <button onClick={() => { onClearCache(); resetReaderStats(); }} className="flex items-center justify-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 py-1.5 rounded"><Trash2 className="w-3 h-3" /> Limpar cache</button>
        <button onClick={onTestProvider} className="flex items-center justify-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 py-1.5 rounded"><Activity className="w-3 h-3" /> Testar provider</button>
        <button onClick={exportLog} className="flex items-center justify-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 py-1.5 rounded"><Download className="w-3 h-3" /> Exportar log</button>
        <button onClick={copyReport} className="col-span-2 flex items-center justify-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 py-1.5 rounded font-bold">
          {copied ? <><Check className="w-3.5 h-3.5" /> Copiado!</> : <><Copy className="w-3.5 h-3.5" /> Copiar diagnóstico</>}
        </button>
      </div>
    </div>
  );
}
