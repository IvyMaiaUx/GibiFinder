import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, BookOpen, Lock, Loader2, Pencil, Trash2, Plus, Eye, MessageSquare, Bug, Lightbulb, Archive, FolderOpen, CheckCircle2, AlertCircle } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const STORAGE_KEY = "gibi_admin_key";

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
  notas?: string;
  status?: string;
  created_at?: string;
}

interface Suggestion {
  id: string;
  type: "bug" | "sugestao";
  message: string;
  nome?: string;
  email?: string;
  status: "novo" | "visto" | "arquivado";
  created_at: string;
}

interface GibiForm {
  titulo: string; revista: string; editora: string; ano: string;
  numero: string; personagens: string; descricao: string; imagem_url: string; drive_url: string; notas: string;
}

const emptyForm: GibiForm = { titulo: "", revista: "", editora: "", ano: "", numero: "", personagens: "", descricao: "", imagem_url: "", drive_url: "", notas: "" };

function gibiToForm(g: Gibi): GibiForm {
  return { titulo: g.titulo || "", revista: g.revista || "", editora: g.editora || "", ano: g.ano || "", numero: g.numero || "", personagens: (g.personagens || []).join(", "), descricao: g.descricao || "", imagem_url: g.imagem_url || "", drive_url: g.drive_url || "", notas: g.notas || "" };
}

async function adminRequest(path: string, adminKey: string, method = "GET", body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-admin-key": adminKey, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Erro ${res.status}`);
  }
  return res.json();
}

function EditModal({ gibi, adminKey, onClose, onSaved }: { gibi?: Gibi; adminKey: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<GibiForm>(gibi ? gibiToForm(gibi) : emptyForm);
  const [saving, setSaving] = useState(false);
  const set = (f: keyof GibiForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [f]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { titulo: form.titulo.trim(), revista: form.revista.trim() || undefined, editora: form.editora.trim() || undefined, ano: form.ano.trim() || undefined, numero: form.numero.trim() || undefined, personagens: form.personagens ? form.personagens.split(",").map(s => s.trim()).filter(Boolean) : [], descricao: form.descricao.trim() || undefined, imagem_url: form.imagem_url.trim() || undefined, drive_url: form.drive_url.trim() || undefined, notas: form.notas.trim() || undefined };
      if (gibi) {
        await adminRequest(`/api/colecao/${gibi.id}`, adminKey, "PUT", body);
        toast({ title: "Gibi atualizado!" });
      } else {
        await adminRequest("/api/colecao", adminKey, "POST", body);
        toast({ title: "Gibi adicionado!" });
      }
      onSaved(); onClose();
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro ao salvar", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const inp = "w-full border-4 border-black px-3 py-2 font-sans font-bold text-black bg-white focus:outline-none focus:ring-4 focus:ring-secondary rounded-none";
  const lbl = "block font-display text-base text-black mb-1 uppercase";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-white comic-border comic-shadow max-w-2xl w-full max-h-[90vh] overflow-y-auto z-10">
        <div className="bg-secondary border-b-4 border-black px-6 py-4 flex items-center justify-between">
          <h2 className="font-display text-2xl text-black">{gibi ? "EDITAR GIBI" : "ADICIONAR GIBI"}</h2>
          <button onClick={onClose}><X className="w-6 h-6" strokeWidth={3} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><label className={lbl}>Título *</label><input value={form.titulo} onChange={set("titulo")} required className={inp} /></div>
            <div><label className={lbl}>Revista / Série</label><input value={form.revista} onChange={set("revista")} className={inp} /></div>
            <div><label className={lbl}>Editora</label><input value={form.editora} onChange={set("editora")} className={inp} /></div>
            <div><label className={lbl}>Número</label><input value={form.numero} onChange={set("numero")} className={inp} /></div>
            <div><label className={lbl}>Ano</label><input value={form.ano} onChange={set("ano")} className={inp} /></div>
            <div className="sm:col-span-2"><label className={lbl}>Personagens (vírgula)</label><input value={form.personagens} onChange={set("personagens")} className={inp} /></div>
            <div className="sm:col-span-2"><label className={lbl}>Descrição</label><textarea value={form.descricao} onChange={set("descricao")} rows={3} className={inp} /></div>
            <div className="sm:col-span-2"><label className={lbl}>URL da Capa</label><input value={form.imagem_url} onChange={set("imagem_url")} className={inp} type="url" /></div>
            <div className="sm:col-span-2"><label className={lbl}>Link do Drive (PDF)</label><input value={form.drive_url} onChange={set("drive_url")} className={inp} type="url" placeholder="https://drive.google.com/file/d/..." /></div>
            <div className="sm:col-span-2"><label className={lbl}>Notas</label><textarea value={form.notas} onChange={set("notas")} rows={2} className={inp} /></div>
          </div>
          <div className="flex gap-4 pt-4 border-t-4 border-black">
            <button type="button" onClick={onClose} className="flex-1 border-4 border-black py-3 font-display text-lg hover:bg-muted">CANCELAR</button>
            <button type="submit" disabled={saving || !form.titulo.trim()} className="flex-1 bg-primary text-white border-4 border-black py-3 font-display text-lg comic-shadow flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" strokeWidth={3} />}
              SALVAR
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function GibiAdminCard({ gibi, adminKey, onReview, onEdit, onDelete }: { gibi: Gibi; adminKey: string; onReview?: (action: "approve" | "reject") => void; onEdit: () => void; onDelete: () => void }) {
  const isPending = gibi.status === "pending";
  return (
    <div className={`bg-white border-4 border-black flex gap-3 p-4 ${isPending ? "border-secondary" : ""}`}>
      <div className="w-14 h-18 border-4 border-black shrink-0 bg-muted overflow-hidden" style={{ height: "4.5rem" }}>
        {gibi.imagem_url ? <img src={gibi.imagem_url} alt={gibi.titulo} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-secondary/30"><BookOpen className="w-6 h-6 text-black/40" /></div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <h3 className="font-display text-lg text-black leading-tight truncate flex-1">{gibi.titulo}</h3>
          {isPending && <span className="bg-secondary border-2 border-black text-black text-xs font-bold px-2 py-0.5 shrink-0">PENDENTE</span>}
          {gibi.status === "approved" && <span className="bg-green-100 border-2 border-black text-black text-xs font-bold px-2 py-0.5 shrink-0">APROVADO</span>}
        </div>
        <p className="font-sans font-bold text-gray-600 text-sm">{[gibi.revista, gibi.numero && `#${gibi.numero}`, gibi.editora, gibi.ano].filter(Boolean).join(" · ")}</p>
        {gibi.personagens && gibi.personagens.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {gibi.personagens.slice(0, 3).map((p, i) => <span key={i} className="bg-secondary/50 text-black text-xs font-bold px-1.5 py-0.5 border-2 border-black">{p}</span>)}
            {gibi.personagens.length > 3 && <span className="text-xs font-bold text-gray-500">+{gibi.personagens.length - 3}</span>}
          </div>
        )}
        {gibi.descricao && <p className="text-xs text-gray-500 font-medium mt-1 truncate">{gibi.descricao}</p>}
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        {isPending && onReview && (
          <>
            <button onClick={() => onReview("approve")} title="Aprovar" className="p-2 border-4 border-black bg-green-100 hover:bg-green-200 transition-colors">
              <Check className="w-4 h-4" strokeWidth={3} />
            </button>
            <button onClick={() => onReview("reject")} title="Rejeitar" className="p-2 border-4 border-black bg-red-100 hover:bg-red-200 transition-colors">
              <X className="w-4 h-4" strokeWidth={3} />
            </button>
          </>
        )}
        <button onClick={onEdit} title="Editar" className="p-2 border-4 border-black hover:bg-secondary transition-colors">
          <Pencil className="w-4 h-4" strokeWidth={3} />
        </button>
        <button onClick={onDelete} title="Remover" className="p-2 border-4 border-black hover:bg-primary hover:text-white transition-colors">
          <Trash2 className="w-4 h-4" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

export default function Admin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [keyInput, setKeyInput] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [tab, setTab] = useState<"pending" | "approved" | "suggestions" | "drive">("pending");
  const [driveUrl, setDriveUrl] = useState("");
  const [driveStatus, setDriveStatus] = useState<"pending" | "approved">("pending");
  const [driveImporting, setDriveImporting] = useState(false);
  const [driveResult, setDriveResult] = useState<{ imported: number; skipped: number; results: { file: string; titulo: string; status: string; error?: string }[]; message?: string } | null>(null);
  const [editModal, setEditModal] = useState<{ open: boolean; gibi?: Gibi }>({ open: false });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const verify = async () => {
    setVerifying(true);
    try {
      const res = await adminRequest("/api/admin/verify", keyInput);
      if (res.valid) {
        localStorage.setItem(STORAGE_KEY, keyInput);
        setAdminKey(keyInput);
        setUnlocked(true);
      } else {
        toast({ title: "Chave inválida", description: "Verifique a chave de administrador", variant: "destructive" });
      }
    } catch {
      toast({ title: "Chave inválida", variant: "destructive" });
    } finally { setVerifying(false); }
  };

  // Try auto-unlock with stored key
  const tryAutoUnlock = async () => {
    if (!adminKey || unlocked) return;
    try {
      const res = await adminRequest("/api/admin/verify", adminKey);
      if (res.valid) setUnlocked(true);
      else { localStorage.removeItem(STORAGE_KEY); setAdminKey(""); }
    } catch { localStorage.removeItem(STORAGE_KEY); setAdminKey(""); }
  };

  // Run auto-unlock once on mount
  useEffect(() => { tryAutoUnlock(); }, []);

  const { data: pendingData, isLoading: loadingPending } = useQuery({
    queryKey: ["admin-pending", adminKey],
    queryFn: () => adminRequest("/api/admin/pending", adminKey),
    enabled: unlocked,
    select: (d: { items: Gibi[]; total: number }) => d,
  });

  const { data: approvedData, isLoading: loadingApproved } = useQuery({
    queryKey: ["colecao-all", adminKey],
    queryFn: () => apiRequestWithKey(`/api/colecao?limit=200`, adminKey),
    enabled: unlocked,
    select: (d: { items: Gibi[]; total: number }) => d,
  });

  const { data: suggestionsData, isLoading: loadingSuggestions } = useQuery({
    queryKey: ["admin-suggestions", adminKey],
    queryFn: () => adminRequest("/api/admin/suggestions", adminKey),
    enabled: unlocked,
    select: (d: { items: Suggestion[]; total: number }) => d,
    refetchInterval: tab === "suggestions" ? 30000 : false,
  });

  const updateSuggestionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminRequest(`/api/admin/suggestions/${id}`, adminKey, "PUT", { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-suggestions"] }); },
    onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
  });

  const deleteSuggestionMutation = useMutation({
    mutationFn: (id: string) => adminRequest(`/api/admin/suggestions/${id}`, adminKey, "DELETE"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-suggestions"] }); toast({ title: "Removido!" }); },
    onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      adminRequest(`/api/admin/review/${id}`, adminKey, "PUT", { action }),
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-pending"] });
      queryClient.invalidateQueries({ queryKey: ["colecao-all"] });
      queryClient.invalidateQueries({ queryKey: ["colecao"] });
      toast({ title: action === "approve" ? "HQ Aprovado!" : "HQ Rejeitado" });
    },
    onError: () => toast({ title: "Erro ao revisar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminRequest(`/api/colecao/${id}`, adminKey, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pending"] });
      queryClient.invalidateQueries({ queryKey: ["colecao-all"] });
      queryClient.invalidateQueries({ queryKey: ["colecao"] });
      toast({ title: "Gibi removido!" });
      setConfirmDelete(null);
    },
    onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
  });

  const handleDriveImport = async () => {
    if (!driveUrl.trim()) return;
    setDriveImporting(true);
    setDriveResult(null);
    try {
      const res = await adminRequest("/api/admin/import-drive", adminKey, "POST", {
        folderUrl: driveUrl.trim(),
        importStatus: driveStatus,
      });
      setDriveResult(res);
      queryClient.invalidateQueries({ queryKey: ["admin-pending"] });
      queryClient.invalidateQueries({ queryKey: ["colecao-all"] });
      queryClient.invalidateQueries({ queryKey: ["colecao"] });
    } catch (err) {
      toast({ title: "Erro na importação", description: err instanceof Error ? err.message : "Tente novamente", variant: "destructive" });
    } finally {
      setDriveImporting(false);
    }
  };

  const pendingItems = pendingData?.items || [];
  const approvedItems = approvedData?.items || [];
  const suggestionItems = suggestionsData?.items || [];
  const newSuggestions = suggestionItems.filter(s => s.status === "novo");

  if (!unlocked) {
    return (
      <Layout>
        <div className="max-w-md mx-auto mt-16">
          <div className="bg-white comic-border comic-shadow p-8 text-center">
            <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-white" strokeWidth={3} />
            </div>
            <h1 className="font-display text-4xl text-black mb-2">ADMIN</h1>
            <p className="font-sans font-bold text-gray-600 mb-6">Digite a chave de administrador para continuar</p>
            <div className="flex flex-col gap-4">
              <input
                type="password"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && verify()}
                placeholder="Chave de admin..."
                className="w-full border-4 border-black px-4 py-3 font-sans font-bold text-black text-center text-xl focus:outline-none focus:ring-4 focus:ring-secondary"
              />
              <button onClick={verify} disabled={verifying || !keyInput}
                className="w-full bg-primary text-white border-4 border-black py-3 font-display text-xl comic-shadow flex items-center justify-center gap-2 disabled:opacity-50">
                {verifying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" strokeWidth={3} />}
                ENTRAR
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto relative z-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-5xl text-black leading-none">PAINEL ADMIN</h1>
            <p className="font-sans font-bold text-gray-600 mt-1">
              {pendingItems.length > 0 ? `${pendingItems.length} pendente${pendingItems.length !== 1 ? "s" : ""} aguardando análise` : "Nenhuma submissão pendente"}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setEditModal({ open: true })}
              className="flex items-center gap-2 bg-primary text-white font-display text-lg px-4 py-3 border-4 border-black comic-shadow hover:translate-y-[-2px] transition-transform">
              <Plus className="w-5 h-5" strokeWidth={3} /> ADICIONAR
            </button>
            <button onClick={() => { localStorage.removeItem(STORAGE_KEY); setUnlocked(false); setAdminKey(""); setKeyInput(""); }}
              className="border-4 border-black px-4 py-3 font-display text-lg hover:bg-muted transition-colors">
              SAIR
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-4 border-black mb-6 overflow-hidden">
          <button onClick={() => setTab("pending")}
            className={`flex-1 py-3 font-display text-lg flex items-center justify-center gap-2 transition-colors ${tab === "pending" ? "bg-secondary text-black" : "bg-white text-gray-500 hover:bg-muted"}`}>
            <Eye className="w-5 h-5" strokeWidth={3} />
            PENDENTES {pendingItems.length > 0 && <span className="bg-primary text-white text-sm font-bold px-2 py-0.5 rounded-full">{pendingItems.length}</span>}
          </button>
          <button onClick={() => setTab("approved")}
            className={`flex-1 py-3 font-display text-lg flex items-center justify-center gap-2 border-l-4 border-black transition-colors ${tab === "approved" ? "bg-secondary text-black" : "bg-white text-gray-500 hover:bg-muted"}`}>
            <Check className="w-5 h-5" strokeWidth={3} />
            APROVADOS ({approvedItems.length})
          </button>
          <button onClick={() => setTab("suggestions")}
            className={`flex-1 py-3 font-display text-lg flex items-center justify-center gap-2 border-l-4 border-black transition-colors ${tab === "suggestions" ? "bg-secondary text-black" : "bg-white text-gray-500 hover:bg-muted"}`}>
            <MessageSquare className="w-5 h-5" strokeWidth={3} />
            FEEDBACK {newSuggestions.length > 0 && <span className="bg-primary text-white text-sm font-bold px-2 py-0.5 rounded-full">{newSuggestions.length}</span>}
          </button>
          <button onClick={() => setTab("drive")}
            className={`flex-1 py-3 font-display text-lg flex items-center justify-center gap-2 border-l-4 border-black transition-colors ${tab === "drive" ? "bg-secondary text-black" : "bg-white text-gray-500 hover:bg-muted"}`}>
            <FolderOpen className="w-5 h-5" strokeWidth={3} />
            DRIVE
          </button>
        </div>

        {/* Pending tab */}
        {tab === "pending" && (
          loadingPending ? (
            <div className="flex items-center justify-center py-24"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>
          ) : pendingItems.length === 0 ? (
            <div className="text-center py-24 border-4 border-dashed border-black bg-white">
              <Check className="w-16 h-16 mx-auto text-green-400 mb-4" strokeWidth={3} />
              <p className="font-display text-3xl text-black/50">TUDO EM DIA!</p>
              <p className="font-sans font-bold text-gray-500">Nenhuma submissão pendente.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingItems.map(gibi => (
                <GibiAdminCard key={gibi.id} gibi={gibi} adminKey={adminKey}
                  onReview={(action) => reviewMutation.mutate({ id: gibi.id, action })}
                  onEdit={() => setEditModal({ open: true, gibi })}
                  onDelete={() => setConfirmDelete(gibi.id)}
                />
              ))}
            </div>
          )
        )}

        {/* Approved tab */}
        {tab === "approved" && (
          loadingApproved ? (
            <div className="flex items-center justify-center py-24"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>
          ) : approvedItems.length === 0 ? (
            <div className="text-center py-24 border-4 border-dashed border-black bg-white">
              <BookOpen className="w-16 h-16 mx-auto text-black/30 mb-4" />
              <p className="font-display text-3xl text-black/50">COLEÇÃO VAZIA</p>
            </div>
          ) : (
            <div className="space-y-3">
              {approvedItems.map(gibi => (
                <GibiAdminCard key={gibi.id} gibi={{ ...gibi, status: "approved" }} adminKey={adminKey}
                  onEdit={() => setEditModal({ open: true, gibi })}
                  onDelete={() => setConfirmDelete(gibi.id)}
                />
              ))}
            </div>
          )
        )}
        {/* Drive import tab */}
        {tab === "drive" && (
          <div className="space-y-6">
            <div className="bg-white border-4 border-black p-6 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <FolderOpen className="w-8 h-8" strokeWidth={3} />
                <div>
                  <h2 className="font-display text-2xl leading-none">IMPORTAR DO GOOGLE DRIVE</h2>
                  <p className="font-sans font-bold text-gray-500 text-sm mt-1">Cole o link de uma pasta pública com PDFs de gibis. O Gemini identificará cada um automaticamente.</p>
                </div>
              </div>

              <div className="bg-secondary/30 border-l-4 border-black p-3 text-sm font-sans font-bold text-gray-700 space-y-1">
                <p>📋 <strong>Pré-requisitos:</strong></p>
                <p>1. A pasta deve ser pública ("qualquer pessoa com o link pode ver")</p>
                <p>2. <code className="bg-black text-white px-1">GOOGLE_DRIVE_API_KEY</code> deve estar configurada nas variáveis de ambiente</p>
                <p>3. Máximo de 20 PDFs por importação</p>
              </div>

              <div>
                <label className="block font-display text-lg mb-1 uppercase">Link da Pasta do Drive</label>
                <input
                  value={driveUrl}
                  onChange={e => setDriveUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full border-4 border-black px-3 py-2 font-sans font-bold focus:outline-none focus:ring-4 focus:ring-secondary"
                />
              </div>

              <div>
                <label className="block font-display text-lg mb-2 uppercase">Status dos Gibis Importados</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDriveStatus("pending")}
                    className={`flex-1 py-2 border-4 border-black font-display text-base transition-colors ${driveStatus === "pending" ? "bg-secondary" : "bg-white hover:bg-muted"}`}
                  >
                    PENDENTE (revisar depois)
                  </button>
                  <button
                    onClick={() => setDriveStatus("approved")}
                    className={`flex-1 py-2 border-4 border-black font-display text-base transition-colors ${driveStatus === "approved" ? "bg-green-100" : "bg-white hover:bg-muted"}`}
                  >
                    APROVADO (publicar direto)
                  </button>
                </div>
              </div>

              <button
                onClick={handleDriveImport}
                disabled={driveImporting || !driveUrl.trim()}
                className="w-full bg-primary text-white border-4 border-black py-3 font-display text-xl comic-shadow flex items-center justify-center gap-2 disabled:opacity-50 hover:brightness-110 transition-all"
              >
                {driveImporting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    ANALISANDO COM GEMINI... (pode demorar)
                  </>
                ) : (
                  <>
                    <FolderOpen className="w-5 h-5" strokeWidth={3} />
                    INICIAR IMPORTAÇÃO
                  </>
                )}
              </button>
            </div>

            {driveResult && (
              <div className="bg-white border-4 border-black p-6">
                <h3 className="font-display text-2xl mb-4">
                  RESULTADO: {driveResult.imported} importado{driveResult.imported !== 1 ? "s" : ""}, {driveResult.skipped} ignorado{driveResult.skipped !== 1 ? "s" : ""}
                </h3>
                {driveResult.message && (
                  <p className="font-sans font-bold text-amber-700 bg-amber-50 border-2 border-black p-2 mb-4 text-sm">{driveResult.message}</p>
                )}
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {driveResult.results.map((r, i) => (
                    <div key={i} className={`flex items-start gap-3 p-3 border-2 border-black text-sm ${r.status === "ok" ? "bg-green-50" : "bg-red-50"}`}>
                      {r.status === "ok" ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" strokeWidth={3} />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" strokeWidth={3} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-base leading-tight">{r.titulo || r.file}</p>
                        {r.error && <p className="font-sans text-red-600 text-xs mt-0.5">{r.error}</p>}
                        <p className="font-sans text-gray-400 text-xs truncate">{r.file}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Suggestions tab */}
        {tab === "suggestions" && (
          loadingSuggestions ? (
            <div className="flex items-center justify-center py-24"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>
          ) : suggestionItems.length === 0 ? (
            <div className="text-center py-24 border-4 border-dashed border-black bg-white">
              <MessageSquare className="w-16 h-16 mx-auto text-black/30 mb-4" />
              <p className="font-display text-3xl text-black/50">SEM FEEDBACKS</p>
              <p className="font-sans font-bold text-gray-500">Nenhuma sugestão ou bug reportado ainda.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {suggestionItems.map(s => (
                <div key={s.id} className={`bg-white border-4 border-black p-4 flex flex-col sm:flex-row gap-4 ${s.status === "novo" ? "border-l-8 border-l-primary" : s.status === "arquivado" ? "opacity-60" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {s.type === "bug" ? (
                        <span className="flex items-center gap-1 bg-red-100 border-2 border-black text-black text-xs font-bold px-2 py-0.5">
                          <Bug className="w-3 h-3" /> BUG
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 bg-secondary border-2 border-black text-black text-xs font-bold px-2 py-0.5">
                          <Lightbulb className="w-3 h-3" /> SUGESTÃO
                        </span>
                      )}
                      {s.status === "novo" && <span className="bg-primary text-white text-xs font-bold px-2 py-0.5 border-2 border-black">NOVO</span>}
                      {s.status === "visto" && <span className="bg-green-100 text-black text-xs font-bold px-2 py-0.5 border-2 border-black">VISTO</span>}
                      {s.status === "arquivado" && <span className="bg-gray-100 text-black text-xs font-bold px-2 py-0.5 border-2 border-black">ARQUIVADO</span>}
                      <span className="text-xs font-bold text-gray-400 ml-auto">{new Date(s.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p className="font-sans font-semibold text-gray-800 text-sm leading-relaxed">{s.message}</p>
                    {(s.nome || s.email) && (
                      <p className="font-sans font-bold text-gray-500 text-xs mt-2">
                        De: {s.nome || "Anônimo"}{s.email ? ` · ${s.email}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex sm:flex-col gap-2 shrink-0">
                    {s.status !== "visto" && (
                      <button onClick={() => updateSuggestionMutation.mutate({ id: s.id, status: "visto" })}
                        title="Marcar como visto" className="p-2 border-4 border-black bg-green-100 hover:bg-green-200 transition-colors flex items-center gap-1">
                        <Eye className="w-4 h-4" strokeWidth={3} />
                      </button>
                    )}
                    {s.status !== "arquivado" && (
                      <button onClick={() => updateSuggestionMutation.mutate({ id: s.id, status: "arquivado" })}
                        title="Arquivar" className="p-2 border-4 border-black bg-gray-100 hover:bg-gray-200 transition-colors">
                        <Archive className="w-4 h-4" strokeWidth={3} />
                      </button>
                    )}
                    <button onClick={() => deleteSuggestionMutation.mutate(s.id)}
                      title="Remover" className="p-2 border-4 border-black hover:bg-primary hover:text-white transition-colors">
                      <Trash2 className="w-4 h-4" strokeWidth={3} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Edit/Add modal */}
      <AnimatePresence>
        {editModal.open && (
          <EditModal gibi={editModal.gibi} adminKey={adminKey}
            onClose={() => setEditModal({ open: false })}
            onSaved={() => { queryClient.invalidateQueries({ queryKey: ["admin-pending"] }); queryClient.invalidateQueries({ queryKey: ["colecao-all"] }); queryClient.invalidateQueries({ queryKey: ["colecao"] }); }}
          />
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmDelete(null)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white comic-border comic-shadow max-w-sm w-full p-6 z-10">
              <h3 className="font-display text-3xl text-black mb-2">CONFIRMAR</h3>
              <p className="font-sans font-bold text-gray-700 mb-6">Remover este gibi da coleção permanentemente?</p>
              <div className="flex gap-4">
                <button onClick={() => setConfirmDelete(null)} className="flex-1 border-4 border-black py-3 font-display text-xl hover:bg-muted">CANCELAR</button>
                <button onClick={() => deleteMutation.mutate(confirmDelete)} disabled={deleteMutation.isPending}
                  className="flex-1 bg-primary text-white border-4 border-black py-3 font-display text-xl flex items-center justify-center gap-2">
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

async function apiRequestWithKey(path: string, adminKey: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { "x-admin-key": adminKey } });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}
