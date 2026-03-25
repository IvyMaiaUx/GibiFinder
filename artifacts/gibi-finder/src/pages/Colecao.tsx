import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, BookOpen, Search, X, Check, Loader2, Clock } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { useToast } from "@/hooks/use-toast";

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

function GibiCard({ gibi }: { gibi: Gibi }) {
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
        <h3 className="font-display text-xl text-black leading-tight truncate">{gibi.titulo}</h3>
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
    </motion.div>
  );
}

export default function Colecao() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["colecao", search],
    queryFn: () => apiRequest(`/api/colecao?q=${encodeURIComponent(search)}&limit=200`),
    select: (d: { items: Gibi[]; total: number }) => d,
  });

  const gibis: Gibi[] = data?.items || [];
  const total: number = data?.total || 0;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto relative z-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-5xl text-black leading-none">COLEÇÃO</h1>
            <p className="font-sans font-bold text-gray-600 mt-1">
              {total > 0 ? `${total} gibi${total !== 1 ? "s" : ""} na coleção` : "Nenhum gibi ainda"}
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

        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" strokeWidth={3} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrar por título, revista ou editora..."
            className="w-full border-4 border-black pl-12 pr-4 py-3 font-sans font-bold text-black bg-white focus:outline-none focus:ring-4 focus:ring-secondary"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2">
              <X className="w-5 h-5" strokeWidth={3} />
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </div>
        ) : gibis.length === 0 ? (
          <div className="text-center py-24 border-4 border-dashed border-black bg-white">
            <BookOpen className="w-16 h-16 mx-auto text-black/30 mb-4" />
            <p className="font-display text-3xl text-black/50 mb-2">
              {search ? "NENHUM RESULTADO" : "COLEÇÃO VAZIA"}
            </p>
            <p className="font-sans font-bold text-gray-500">
              {search ? `Nenhum gibi corresponde a "${search}"` : "Seja o primeiro a sugerir um HQ!"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {gibis.map(gibi => <GibiCard key={gibi.id} gibi={gibi} />)}
          </div>
        )}
      </div>

      <AnimatePresence>
        {modalOpen && (
          <SubmitModal
            onClose={() => setModalOpen(false)}
            onSubmitted={() => queryClient.invalidateQueries({ queryKey: ["colecao"] })}
          />
        )}
      </AnimatePresence>
    </Layout>
  );
}
