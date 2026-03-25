import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, Trash2, BookOpen, Search, X, Check, Loader2 } from "lucide-react";
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
  tags?: string[];
  notas?: string;
  created_at?: string;
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
  titulo: "",
  revista: "",
  editora: "",
  ano: "",
  numero: "",
  personagens: "",
  descricao: "",
  imagem_url: "",
  notas: "",
};

function formToBody(form: GibiForm) {
  return {
    titulo: form.titulo.trim(),
    revista: form.revista.trim() || undefined,
    editora: form.editora.trim() || undefined,
    ano: form.ano.trim() || undefined,
    numero: form.numero.trim() || undefined,
    personagens: form.personagens
      ? form.personagens.split(",").map(s => s.trim()).filter(Boolean)
      : [],
    descricao: form.descricao.trim() || undefined,
    imagem_url: form.imagem_url.trim() || undefined,
    notas: form.notas.trim() || undefined,
  };
}

function gibiToForm(g: Gibi): GibiForm {
  return {
    titulo: g.titulo || "",
    revista: g.revista || "",
    editora: g.editora || "",
    ano: g.ano || "",
    numero: g.numero || "",
    personagens: (g.personagens || []).join(", "),
    descricao: g.descricao || "",
    imagem_url: g.imagem_url || "",
    notas: g.notas || "",
  };
}

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

function GibiFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Gibi;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<GibiForm>(initial ? gibiToForm(initial) : emptyForm);
  const [saving, setSaving] = useState(false);

  const set = (field: keyof GibiForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo.trim()) return;
    setSaving(true);
    try {
      const body = formToBody(form);
      if (initial) {
        await apiRequest(`/api/colecao/${initial.id}`, "PUT", body);
        toast({ title: "Gibi atualizado!", description: form.titulo });
      } else {
        await apiRequest("/api/colecao", "POST", body);
        toast({ title: "Gibi adicionado!", description: form.titulo });
      }
      onSaved();
      onClose();
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      });
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
          <h2 className="font-display text-3xl text-black">
            {initial ? "EDITAR GIBI" : "NOVO GIBI"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-black/10 rounded-full">
            <X className="w-6 h-6" strokeWidth={3} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Título *</label>
              <input value={form.titulo} onChange={set("titulo")} required className={inputClass} placeholder="Ex: O Mágico de Oz" />
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
              <input value={form.numero} onChange={set("numero")} className={inputClass} placeholder="Ex: 42" />
            </div>
            <div>
              <label className={labelClass}>Ano</label>
              <input value={form.ano} onChange={set("ano")} className={inputClass} placeholder="Ex: 1992" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Personagens</label>
              <input value={form.personagens} onChange={set("personagens")} className={inputClass} placeholder="Separados por vírgula: Mônica, Cebolinha, Cascão..." />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Descrição / Sinopse</label>
              <textarea value={form.descricao} onChange={set("descricao")} rows={3} className={inputClass} placeholder="Do que se trata este gibi?" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>URL da Capa</label>
              <input value={form.imagem_url} onChange={set("imagem_url")} className={inputClass} placeholder="https://..." type="url" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Notas Pessoais</label>
              <textarea value={form.notas} onChange={set("notas")} rows={2} className={inputClass} placeholder="Observações, estado de conservação, etc..." />
            </div>
          </div>

          <div className="flex gap-4 pt-4 border-t-4 border-black">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border-4 border-black py-3 font-display text-xl hover:bg-muted transition-colors"
            >
              CANCELAR
            </button>
            <button
              type="submit"
              disabled={saving || !form.titulo.trim()}
              className="flex-1 bg-primary text-white border-4 border-black py-3 font-display text-xl comic-shadow hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" strokeWidth={3} />}
              {initial ? "SALVAR" : "ADICIONAR"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function GibiCard({ gibi, onEdit, onDelete }: { gibi: Gibi; onEdit: () => void; onDelete: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="bg-white border-4 border-black flex gap-4 p-4 hover:translate-y-[-2px] transition-transform"
    >
      {/* Cover */}
      <div className="w-16 h-20 border-4 border-black shrink-0 bg-muted overflow-hidden">
        {gibi.imagem_url ? (
          <img src={gibi.imagem_url} alt={gibi.titulo} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-secondary/30">
            <BookOpen className="w-8 h-8 text-black/40" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-display text-xl text-black leading-tight truncate">{gibi.titulo}</h3>
        <p className="font-sans font-bold text-gray-600 text-sm">
          {[gibi.revista, gibi.numero && `#${gibi.numero}`, gibi.editora, gibi.ano].filter(Boolean).join(" · ")}
        </p>
        {gibi.personagens && gibi.personagens.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {gibi.personagens.slice(0, 4).map((p, i) => (
              <span key={i} className="bg-secondary/50 text-black text-xs font-bold px-2 py-0.5 border-2 border-black">
                {p}
              </span>
            ))}
            {gibi.personagens.length > 4 && (
              <span className="text-xs font-bold text-gray-500">+{gibi.personagens.length - 4}</span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 shrink-0">
        <button
          onClick={onEdit}
          className="p-2 border-4 border-black hover:bg-secondary transition-colors"
          title="Editar"
        >
          <Pencil className="w-4 h-4" strokeWidth={3} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 border-4 border-black hover:bg-primary hover:text-white transition-colors"
          title="Remover"
        >
          <Trash2 className="w-4 h-4" strokeWidth={3} />
        </button>
      </div>
    </motion.div>
  );
}

export default function Colecao() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Gibi | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["colecao", search],
    queryFn: () => apiRequest(`/api/colecao?q=${encodeURIComponent(search)}&limit=200`),
    select: (d: { items: Gibi[]; total: number }) => d,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/colecao/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colecao"] });
      toast({ title: "Gibi removido!" });
      setConfirmDelete(null);
    },
    onError: (err) => {
      toast({ title: "Erro ao remover", description: (err as Error).message, variant: "destructive" });
    },
  });

  const gibis: Gibi[] = data?.items || [];
  const total: number = data?.total || 0;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-5xl text-black leading-none">MINHA COLEÇÃO</h1>
            <p className="font-sans font-bold text-gray-600 mt-1">
              {total > 0 ? `${total} gibi${total !== 1 ? "s" : ""} cadastrado${total !== 1 ? "s" : ""}` : "Nenhum gibi cadastrado ainda"}
            </p>
          </div>
          <button
            onClick={() => { setEditing(undefined); setModalOpen(true); }}
            className="flex items-center gap-2 bg-primary text-white font-display text-xl px-6 py-3 border-4 border-black comic-shadow hover:translate-y-[-2px] transition-transform"
          >
            <Plus className="w-6 h-6" strokeWidth={3} />
            ADICIONAR GIBI
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" strokeWidth={3} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrar por título, revista ou editora..."
            className="w-full border-4 border-black pl-12 pr-4 py-3 font-sans font-bold text-black bg-white focus:outline-none focus:ring-4 focus:ring-secondary"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-4 top-1/2 -translate-y-1/2"
            >
              <X className="w-5 h-5" strokeWidth={3} />
            </button>
          )}
        </div>

        {/* List */}
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
              {search ? `Nenhum gibi corresponde a "${search}"` : "Adicione seus HQs usando o botão acima!"}
            </p>
          </div>
        ) : (
          <AnimatePresence>
            <div className="space-y-3">
              {gibis.map(gibi => (
                <GibiCard
                  key={gibi.id}
                  gibi={gibi}
                  onEdit={() => { setEditing(gibi); setModalOpen(true); }}
                  onDelete={() => setConfirmDelete(gibi.id)}
                />
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {modalOpen && (
          <GibiFormModal
            initial={editing}
            onClose={() => { setModalOpen(false); setEditing(undefined); }}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["colecao"] })}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmDelete(null)} />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white comic-border comic-shadow max-w-sm w-full p-6 z-10"
            >
              <h3 className="font-display text-3xl text-black mb-2">CONFIRMAR</h3>
              <p className="font-sans font-bold text-gray-700 mb-6">
                Tem certeza que quer remover este gibi da coleção? Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 border-4 border-black py-3 font-display text-xl hover:bg-muted transition-colors"
                >
                  CANCELAR
                </button>
                <button
                  onClick={() => deleteMutation.mutate(confirmDelete)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 bg-primary text-white border-4 border-black py-3 font-display text-xl hover:brightness-110 transition-all flex items-center justify-center gap-2"
                >
                  {deleteMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" strokeWidth={3} />}
                  REMOVER
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
