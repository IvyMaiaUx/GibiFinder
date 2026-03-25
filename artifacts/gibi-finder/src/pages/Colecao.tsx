import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { Plus, BookOpen, Search, X, Check, Loader2, Clock, Filter, ChevronDown, BookOpenCheck, ChevronLeft, ChevronRight, AlignJustify, Layers } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Layout } from "@/components/layout/Layout";
import { useToast } from "@/hooks/use-toast";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Gibi {
  id: string;
  titulo: string;
  revista?: string;
  editora?: string;
  ano?: string;
  numero?: string;
  personagens?: string[];
  descricao?: string;
  imagem_url?: string;
  drive_url?: string;
  status?: string;
}

interface GibiForm {
  titulo: string;
  revista: string;
  editora: string;
  ano: string;
  numero: string;
  personagens: string;
  descricao: string;
  imagem_url: string;
  notas: string;
}

const emptyForm: GibiForm = {
  titulo: "", revista: "", editora: "", ano: "", numero: "",
  personagens: "", descricao: "", imagem_url: "", notas: "",
};

async function apiRequest(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Erro ${res.status}`);
  }
  return res.json();
}

// ── Submit Modal ──────────────────────────────────────────────────────────────

function SubmitModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<GibiForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const set = (field: keyof GibiForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo.trim()) return;
    setSaving(true);
    try {
      await apiRequest("/api/colecao", "POST", {
        titulo: form.titulo.trim(),
        revista: form.revista.trim() || undefined,
        editora: form.editora.trim() || undefined,
        ano: form.ano.trim() || undefined,
        numero: form.numero.trim() || undefined,
        personagens: form.personagens ? form.personagens.split(",").map(s => s.trim()).filter(Boolean) : [],
        descricao: form.descricao.trim() || undefined,
        imagem_url: form.imagem_url.trim() || undefined,
        notas: form.notas.trim() || undefined,
      });
      setDone(true);
      onSubmitted();
    } catch (err) {
      toast({ title: "Erro ao enviar", description: err instanceof Error ? err.message : "Tente novamente", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full border-4 border-black px-3 py-2 font-sans font-bold text-black bg-white focus:outline-none focus:ring-4 focus:ring-secondary rounded-none";
  const labelClass = "block font-display text-lg text-black mb-1 uppercase";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative bg-white comic-border comic-shadow max-w-2xl w-full max-h-[90vh] overflow-y-auto z-10"
      >
        <div className="bg-secondary border-b-4 border-black px-6 py-4 flex items-center justify-between">
          <h2 className="font-display text-3xl text-black">SUGERIR HQ</h2>
          <button onClick={onClose} className="p-2 hover:bg-black/10 rounded-full">
            <X className="w-6 h-6" strokeWidth={3} />
          </button>
        </div>

        {done ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-secondary border-4 border-black rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-black" strokeWidth={3} />
            </div>
            <h3 className="font-display text-3xl text-black mb-2">ENVIADO!</h3>
            <p className="font-sans font-bold text-gray-600 mb-6">
              Seu HQ foi enviado para análise. Assim que for aprovado, aparecerá na coleção.
            </p>
            <button onClick={onClose} className="bg-primary text-white border-4 border-black px-8 py-3 font-display text-xl comic-shadow">
              FECHAR
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="font-sans font-bold text-gray-600 bg-secondary/30 border-l-4 border-black p-3">
              Sua sugestão passará por análise antes de aparecer na coleção.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass}>Título *</label>
                <input value={form.titulo} onChange={set("titulo")} required className={inputClass} placeholder="Ex: Turma da Mônica n° 50" />
              </div>
              <div>
                <label className={labelClass}>Revista / Série</label>
                <input value={form.revista} onChange={set("revista")} className={inputClass} placeholder="Ex: Turma da Mônica" />
              </div>
              <div>
                <label className={labelClass}>Editora</label>
                <input value={form.editora} onChange={set("editora")} className={inputClass} placeholder="Ex: Globo, Panini, MSP..." />
              </div>
              <div>
                <label className={labelClass}>Número</label>
                <input value={form.numero} onChange={set("numero")} className={inputClass} placeholder="Ex: 50" />
              </div>
              <div>
                <label className={labelClass}>Ano</label>
                <input value={form.ano} onChange={set("ano")} className={inputClass} placeholder="Ex: 1985" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Personagens</label>
                <input value={form.personagens} onChange={set("personagens")} className={inputClass} placeholder="Separados por vírgula: Mônica, Cebolinha..." />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Descrição / Sinopse</label>
                <textarea value={form.descricao} onChange={set("descricao")} rows={3} className={inputClass} placeholder="Do que se trata este gibi?" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>URL da Capa</label>
                <input value={form.imagem_url} onChange={set("imagem_url")} className={inputClass} placeholder="https://..." type="url" />
              </div>
            </div>
            <div className="flex gap-4 pt-4 border-t-4 border-black">
              <button type="button" onClick={onClose} className="flex-1 border-4 border-black py-3 font-display text-xl hover:bg-muted transition-colors">
                CANCELAR
              </button>
              <button type="submit" disabled={saving || !form.titulo.trim()}
                className="flex-1 bg-primary text-white border-4 border-black py-3 font-display text-xl comic-shadow hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" strokeWidth={3} />}
                ENVIAR PARA ANÁLISE
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}

// ── Drive Reader Modal ────────────────────────────────────────────────────────

type ReadMode = "scroll" | "page";

function DriveReaderModal({ gibi, onClose }: { gibi: Gibi; onClose: () => void }) {
  const fileIdMatch = gibi.drive_url?.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const fileId = fileIdMatch?.[1];
  const pdfUrl = fileId ? `${BASE}/api/pdf/${fileId}` : null;

  const [mode, setMode] = useState<ReadMode>("scroll");
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageDirection, setPageDirection] = useState<1 | -1>(1);
  const [pdfError, setPdfError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Swipe gesture state
  const dragX = useMotionValue(0);
  const dragOpacity = useTransform(dragX, [-120, 0, 120], [0.4, 1, 0.4]);

  function onDocumentLoad({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  const goNext = useCallback(() => {
    if (pageNumber < numPages) {
      setPageDirection(1);
      setPageNumber(p => p + 1);
    }
  }, [pageNumber, numPages]);

  const goPrev = useCallback(() => {
    if (pageNumber > 1) {
      setPageDirection(-1);
      setPageNumber(p => p - 1);
    }
  }, [pageNumber]);

  useEffect(() => {
    if (mode !== "page") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, goNext, goPrev, onClose]);

  function handleDragEnd(_: unknown, info: { offset: { x: number } }) {
    if (info.offset.x < -60) goNext();
    else if (info.offset.x > 60) goPrev();
    dragX.set(0);
  }

  const pageVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? "-60%" : "60%", opacity: 0 }),
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1a1a1a]">
      {/* Header */}
      <div className="bg-white border-b-4 border-black px-3 py-2 flex items-center gap-3 shrink-0">
        <button onClick={onClose} className="p-2 border-4 border-black hover:bg-muted transition-colors">
          <X className="w-5 h-5" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-lg text-black leading-tight truncate">{gibi.titulo}</h2>
          <p className="font-sans font-bold text-gray-500 text-xs truncate">
            {[gibi.revista, gibi.editora, gibi.ano].filter(Boolean).join(" · ")}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex border-4 border-black shrink-0">
          <button
            onClick={() => setMode("scroll")}
            title="Rolar página"
            className={`flex items-center gap-1.5 px-2 py-1.5 font-display text-xs transition-colors ${mode === "scroll" ? "bg-primary text-white" : "bg-white hover:bg-muted"}`}
          >
            <AlignJustify className="w-4 h-4" strokeWidth={3} />
            <span className="hidden sm:inline">ROLAR</span>
          </button>
          <button
            onClick={() => setMode("page")}
            title="Virar página"
            className={`flex items-center gap-1.5 px-2 py-1.5 font-display text-xs transition-colors border-l-4 border-black ${mode === "page" ? "bg-primary text-white" : "bg-white hover:bg-muted"}`}
          >
            <Layers className="w-4 h-4" strokeWidth={3} />
            <span className="hidden sm:inline">VIRAR</span>
          </button>
        </div>

        {/* Page counter (page mode only) */}
        {mode === "page" && numPages > 0 && (
          <span className="font-display text-sm text-black shrink-0 border-4 border-black px-2 py-1 bg-secondary">
            {pageNumber}/{numPages}
          </span>
        )}
      </div>

      {/* Content */}
      {!pdfUrl ? (
        <div className="flex-1 flex items-center justify-center text-white font-display text-2xl">
          LINK INVÁLIDO
        </div>
      ) : pdfError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white">
          <p className="font-display text-2xl">NÃO FOI POSSÍVEL CARREGAR</p>
          <p className="font-sans text-gray-400 text-sm">Verifique se o arquivo é público</p>
        </div>
      ) : mode === "scroll" ? (
        /* ── SCROLL MODE ── */
        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#1a1a1a] flex flex-col items-center gap-3 py-4 px-2">
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoad}
            onLoadError={() => setPdfError(true)}
            loading={
              <div className="flex items-center gap-3 text-white py-20 font-display text-xl">
                <Loader2 className="w-8 h-8 animate-spin" /> CARREGANDO...
              </div>
            }
            className="flex flex-col items-center gap-3 w-full"
          >
            {Array.from({ length: numPages }, (_, i) => (
              <div key={i} className="shadow-2xl">
                <Page
                  pageNumber={i + 1}
                  width={Math.min(typeof window !== "undefined" ? window.innerWidth - 16 : 600, 800)}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </div>
            ))}
          </Document>
        </div>
      ) : (
        /* ── PAGE FLIP MODE ── */
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-[#1a1a1a]">
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoad}
              onLoadError={() => setPdfError(true)}
              loading={
                <div className="flex items-center gap-3 text-white font-display text-xl">
                  <Loader2 className="w-8 h-8 animate-spin" /> CARREGANDO...
                </div>
              }
            >
              <AnimatePresence mode="popLayout" custom={pageDirection}>
                <motion.div
                  key={pageNumber}
                  custom={pageDirection}
                  variants={pageVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 300, damping: 35 }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDragEnd={handleDragEnd}
                  style={{ x: dragX, opacity: dragOpacity }}
                  className="shadow-2xl cursor-grab active:cursor-grabbing select-none"
                >
                  <Page
                    pageNumber={pageNumber}
                    width={Math.min(typeof window !== "undefined" ? window.innerWidth - 80 : 500, 720)}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </motion.div>
              </AnimatePresence>
            </Document>

            {/* Side arrows */}
            {pageNumber > 1 && (
              <button
                onClick={goPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 border-4 border-black p-2 hover:bg-secondary transition-colors z-10"
              >
                <ChevronLeft className="w-6 h-6" strokeWidth={3} />
              </button>
            )}
            {pageNumber < numPages && (
              <button
                onClick={goNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 border-4 border-black p-2 hover:bg-secondary transition-colors z-10"
              >
                <ChevronRight className="w-6 h-6" strokeWidth={3} />
              </button>
            )}
          </div>

          {/* Page dots (up to 20 visible) */}
          {numPages > 1 && numPages <= 80 && (
            <div className="shrink-0 flex justify-center gap-1 py-2 bg-[#111] flex-wrap px-4">
              {Array.from({ length: numPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setPageDirection(i + 1 > pageNumber ? 1 : -1);
                    setPageNumber(i + 1);
                  }}
                  className={`w-2 h-2 rounded-full border-2 transition-colors ${i + 1 === pageNumber ? "bg-primary border-primary" : "bg-gray-600 border-gray-500 hover:bg-gray-400"}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Gibi Card ─────────────────────────────────────────────────────────────────

function GibiCard({ gibi, onRead }: { gibi: Gibi; onRead: (g: Gibi) => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white border-4 border-black flex gap-4 p-4"
    >
      <div className="w-16 h-20 border-4 border-black shrink-0 bg-muted overflow-hidden">
        {gibi.imagem_url ? (
          <img src={gibi.imagem_url} alt={gibi.titulo} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-secondary/30">
            <BookOpen className="w-8 h-8 text-black/40" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-display text-xl text-black leading-tight">{gibi.titulo}</h3>
        <p className="font-sans font-bold text-gray-600 text-sm">
          {[gibi.revista, gibi.numero && `#${gibi.numero}`, gibi.editora, gibi.ano].filter(Boolean).join(" · ")}
        </p>
        {gibi.personagens && gibi.personagens.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {gibi.personagens.slice(0, 4).map((p, i) => (
              <span key={i} className="bg-secondary/50 text-black text-xs font-bold px-2 py-0.5 border-2 border-black">{p}</span>
            ))}
            {gibi.personagens.length > 4 && <span className="text-xs font-bold text-gray-500">+{gibi.personagens.length - 4}</span>}
          </div>
        )}
      </div>
      {gibi.drive_url && (
        <button
          onClick={() => onRead(gibi)}
          className="shrink-0 flex flex-col items-center justify-center gap-1 bg-primary text-white border-4 border-black px-3 py-2 hover:brightness-110 transition-all comic-shadow"
          title="Ler gibi"
        >
          <BookOpenCheck className="w-5 h-5" strokeWidth={3} />
          <span className="font-display text-xs">LER</span>
        </button>
      )}
    </motion.div>
  );
}

// ── Filter Chip ───────────────────────────────────────────────────────────────

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-primary text-white font-bold text-sm px-3 py-1 border-2 border-black">
      {label}
      <button onClick={onRemove} className="hover:opacity-75">
        <X className="w-3 h-3" strokeWidth={3} />
      </button>
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Colecao() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterEditora, setFilterEditora] = useState("");
  const [filterAno, setFilterAno] = useState("");
  const [filterPersonagem, setFilterPersonagem] = useState("");
  const [personagemInput, setPersonagemInput] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [readerGibi, setReaderGibi] = useState<Gibi | null>(null);

  // Fetch all gibis once (up to 500), filter client-side
  const { data, isLoading } = useQuery({
    queryKey: ["colecao-all"],
    queryFn: () => apiRequest(`/api/colecao?limit=500`),
    select: (d: { items: Gibi[]; total: number }) => d,
    staleTime: 60_000,
  });

  const allGibis: Gibi[] = data?.items || [];

  // Derived filter options from data
  const editoras = useMemo(() => {
    const set = new Set(allGibis.map(g => g.editora).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [allGibis]);

  const anos = useMemo(() => {
    const set = new Set(allGibis.map(g => g.ano).filter(Boolean) as string[]);
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [allGibis]);

  // Apply all filters
  const gibis = useMemo(() => {
    return allGibis.filter(g => {
      if (search) {
        const q = search.toLowerCase();
        const matches = [g.titulo, g.revista, g.editora, g.descricao]
          .some(f => f?.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (filterEditora && g.editora !== filterEditora) return false;
      if (filterAno && g.ano !== filterAno) return false;
      if (filterPersonagem) {
        const q = filterPersonagem.toLowerCase();
        const has = g.personagens?.some(p => p.toLowerCase().includes(q));
        if (!has) return false;
      }
      return true;
    });
  }, [allGibis, search, filterEditora, filterAno, filterPersonagem]);

  const hasActiveFilters = filterEditora || filterAno || filterPersonagem;
  const clearAll = () => { setFilterEditora(""); setFilterAno(""); setFilterPersonagem(""); setPersonagemInput(""); };

  const handlePersonagemSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilterPersonagem(personagemInput.trim());
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto relative z-10">

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-5xl text-black leading-none">COLEÇÃO</h1>
            <p className="font-sans font-bold text-gray-600 mt-1">
              {isLoading ? "Carregando..." : `${gibis.length} de ${allGibis.length} gibi${allGibis.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-primary text-white font-display text-xl px-6 py-3 border-4 border-black comic-shadow hover:translate-y-[-2px] transition-transform"
          >
            <Plus className="w-6 h-6" strokeWidth={3} />
            SUGERIR HQ
          </button>
        </div>

        {/* Search + filter toggle */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" strokeWidth={3} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por título, revista ou editora..."
              className="w-full border-4 border-black pl-12 pr-10 py-3 font-sans font-bold text-black bg-white focus:outline-none focus:ring-4 focus:ring-secondary"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2">
                <X className="w-5 h-5" strokeWidth={3} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-2 px-4 py-3 border-4 border-black font-display text-lg transition-colors ${showFilters || hasActiveFilters ? "bg-primary text-white" : "bg-white"}`}
          >
            <Filter className="w-5 h-5" strokeWidth={3} />
            <span className="hidden sm:inline">FILTROS</span>
            {hasActiveFilters && (
              <span className="bg-white text-primary rounded-full w-5 h-5 text-xs font-bold flex items-center justify-center border-2 border-black">
                {[filterEditora, filterAno, filterPersonagem].filter(Boolean).length}
              </span>
            )}
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? "rotate-180" : ""}`} strokeWidth={3} />
          </button>
        </div>

        {/* Filter panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white border-4 border-black p-4 mb-3 space-y-4">

                {/* Editora */}
                <div>
                  <p className="font-display text-lg mb-2">EDITORA</p>
                  <div className="flex flex-wrap gap-2">
                    {editoras.map(e => (
                      <button
                        key={e}
                        onClick={() => setFilterEditora(prev => prev === e ? "" : e)}
                        className={`px-3 py-1 border-2 border-black font-bold text-sm transition-colors ${filterEditora === e ? "bg-primary text-white" : "bg-white hover:bg-secondary/50"}`}
                      >
                        {e}
                      </button>
                    ))}
                    {editoras.length === 0 && <span className="text-gray-400 font-sans text-sm">Nenhuma editora disponível</span>}
                  </div>
                </div>

                {/* Ano */}
                <div>
                  <p className="font-display text-lg mb-2">ANO</p>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                    {anos.map(a => (
                      <button
                        key={a}
                        onClick={() => setFilterAno(prev => prev === a ? "" : a)}
                        className={`px-3 py-1 border-2 border-black font-bold text-sm transition-colors ${filterAno === a ? "bg-primary text-white" : "bg-white hover:bg-secondary/50"}`}
                      >
                        {a}
                      </button>
                    ))}
                    {anos.length === 0 && <span className="text-gray-400 font-sans text-sm">Nenhum ano disponível</span>}
                  </div>
                </div>

                {/* Personagem */}
                <div>
                  <p className="font-display text-lg mb-2">PERSONAGEM</p>
                  <form onSubmit={handlePersonagemSearch} className="flex gap-2">
                    <input
                      value={personagemInput}
                      onChange={e => setPersonagemInput(e.target.value)}
                      placeholder="Ex: Mônica, Cebolinha..."
                      className="flex-1 border-4 border-black px-3 py-2 font-sans font-bold focus:outline-none focus:ring-4 focus:ring-secondary"
                    />
                    <button type="submit" className="bg-primary text-white border-4 border-black px-4 font-display text-lg comic-hover">
                      OK
                    </button>
                    {filterPersonagem && (
                      <button type="button" onClick={() => { setFilterPersonagem(""); setPersonagemInput(""); }}
                        className="border-4 border-black px-3 hover:bg-red-100">
                        <X className="w-5 h-5" strokeWidth={3} />
                      </button>
                    )}
                  </form>
                </div>

                {hasActiveFilters && (
                  <button onClick={clearAll} className="text-primary font-bold text-sm underline">
                    Limpar todos os filtros
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 mb-4">
            {filterEditora && <FilterChip label={`Editora: ${filterEditora}`} onRemove={() => setFilterEditora("")} />}
            {filterAno && <FilterChip label={`Ano: ${filterAno}`} onRemove={() => setFilterAno("")} />}
            {filterPersonagem && <FilterChip label={`Personagem: ${filterPersonagem}`} onRemove={() => { setFilterPersonagem(""); setPersonagemInput(""); }} />}
          </div>
        )}

        {/* Results */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </div>
        ) : gibis.length === 0 ? (
          <div className="text-center py-24 border-4 border-dashed border-black bg-white">
            <BookOpen className="w-16 h-16 mx-auto text-black/30 mb-4" />
            <p className="font-display text-3xl text-black/50 mb-2">NENHUM RESULTADO</p>
            <p className="font-sans font-bold text-gray-500">
              Tente ajustar os filtros ou a busca.
            </p>
            {hasActiveFilters && (
              <button onClick={clearAll} className="mt-4 text-primary font-bold underline">
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {gibis.map(gibi => <GibiCard key={gibi.id} gibi={gibi} onRead={setReaderGibi} />)}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {modalOpen && (
          <SubmitModal
            onClose={() => setModalOpen(false)}
            onSubmitted={() => queryClient.invalidateQueries({ queryKey: ["colecao-all"] })}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {readerGibi && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
          >
            <DriveReaderModal gibi={readerGibi} onClose={() => setReaderGibi(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
