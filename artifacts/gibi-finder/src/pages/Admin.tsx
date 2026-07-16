import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, BookOpen, Lock, Loader2, Pencil, Trash2, Plus, Eye, MessageSquare, Bug, Lightbulb, Archive, CheckCircle2, AlertCircle, Trophy, AlertTriangle, Database, User } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { useToast } from "@/hooks/use-toast";
import { SafeImage } from "@/components/ui/SafeImage";

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
        {gibi.imagem_url ? <SafeImage src={gibi.imagem_url} alt={gibi.titulo} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-secondary/30"><BookOpen className="w-6 h-6 text-black/40" /></div>}
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
  const [adminKey, setAdminKey] = useState(localStorage.getItem(STORAGE_KEY) || "");
  const [userInput, setUserInput] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [tab, setTab] = useState<"pending" | "approved" | "suggestions" | "ranking" | "providers" | "users">("pending");
  const [confirmClearRanking, setConfirmClearRanking] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);

  const fetchProviders = async () => {
    setLoadingProviders(true);
    try {
      const res = await fetch(`${BASE}/api/providers`);
      if (res.ok) {
        const data = await res.json();
        setProviders(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProviders(false);
    }
  };

  const toggleProvider = async (providerId: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    setProviders(prev => prev.map(p => p.id === providerId ? { ...p, active: nextStatus } : p));
    try {
      const res = await fetch(`${BASE}/api/providers/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, active: nextStatus })
      });
      if (res.ok) {
        toast({ title: nextStatus ? "Provedor ativado!" : "Provedor desativado!" });
      } else {
        throw new Error();
      }
    } catch {
      setProviders(prev => prev.map(p => p.id === providerId ? { ...p, active: currentStatus } : p));
      toast({ title: "Erro ao atualizar provedor", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (tab === "providers" && unlocked) {
      fetchProviders();
    }
  }, [tab, unlocked]);
  const [editModal, setEditModal] = useState<{ open: boolean; gibi?: Gibi }>({ open: false });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [customProviderModal, setCustomProviderModal] = useState(false);

  const deleteProvider = async (providerId: string) => {
    try {
      const res = await fetch(`${BASE}/api/providers/custom/${providerId}`, {
        method: "DELETE",
        headers: { "x-admin-key": adminKey }
      });
      if (res.ok) {
        toast({ title: "Provedor customizado removido!" });
        setProviders(prev => prev.filter(p => p.id !== providerId));
      } else {
        throw new Error();
      }
    } catch {
      toast({ title: "Erro ao remover provedor", variant: "destructive" });
    }
  };

  const verify = async () => {
    if (userInput.trim().toLowerCase() !== "admin") {
      toast({ title: "Usuário incorreto", description: "O usuário administrador deve ser 'admin'", variant: "destructive" });
      return;
    }
    setVerifying(true);
    try {
      const res = await adminRequest("/api/admin/verify", keyInput);
      if (res.valid) {
        localStorage.setItem(STORAGE_KEY, keyInput);
        setAdminKey(keyInput);
        setUnlocked(true);
      } else {
        toast({ title: "Senha inválida", description: "Verifique a senha de administrador", variant: "destructive" });
      }
    } catch {
      toast({ title: "Senha inválida", variant: "destructive" });
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

  const { data: rankingData, isLoading: loadingRanking } = useQuery({
    queryKey: ["admin-ranking", adminKey],
    queryFn: () => adminRequest("/api/admin/ranking", adminKey),
    enabled: unlocked && tab === "ranking",
    select: (d: { items: { revista: string; titulo: string; editora: string; search_count: number; last_searched: string }[]; total: number }) => d,
  });

  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ["admin-users", adminKey],
    queryFn: () => adminRequest("/api/admin/users", adminKey),
    enabled: unlocked && tab === "users",
    select: (d: { items: { id: string; username: string; email?: string; created_at: string }[]; total: number }) => d,
  });

  const deleteRankingEntryMutation = useMutation({
    mutationFn: ({ revista, titulo }: { revista: string; titulo: string }) =>
      adminRequest("/api/admin/ranking/entry", adminKey, "DELETE", { revista, titulo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-ranking"] });
      queryClient.invalidateQueries({ queryKey: ["ranking"] });
      toast({ title: "Entrada removida do ranking!" });
    },
    onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
  });

  const clearRankingMutation = useMutation({
    mutationFn: () => adminRequest("/api/admin/ranking/all", adminKey, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-ranking"] });
      queryClient.invalidateQueries({ queryKey: ["ranking"] });
      toast({ title: "Ranking zerado!" });
      setConfirmClearRanking(false);
    },
    onError: () => toast({ title: "Erro ao zerar ranking", variant: "destructive" }),
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


  const pendingItems = pendingData?.items || [];
  const approvedItems = approvedData?.items || [];
  const suggestionItems = suggestionsData?.items || [];
  const newSuggestions = suggestionItems.filter(s => s.status === "novo");

  if (!unlocked) {
    return (
      <Layout>
        <div className="max-w-md mx-auto mt-16 px-4 animate-in fade-in duration-200">
          <div className="bg-white border-4 border-black p-8 text-center comic-shadow relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 opacity-5 bg-[radial-gradient(black_1px,transparent_1px)] [background-size:6px_6px] pointer-events-none" />
            
            <div className="w-20 h-20 bg-primary border-4 border-black rounded-full flex items-center justify-center mx-auto mb-4 comic-shadow-sm transform -rotate-3">
              <Lock className="w-10 h-10 text-white" strokeWidth={3} />
            </div>
            
            <h1 className="font-display text-4xl text-black mb-1 uppercase tracking-wider">Painel Admin</h1>
            <p className="font-sans font-bold text-xs text-gray-500 mb-8 uppercase">Acesso Restrito do Gibi Finder</p>
            
            <div className="flex flex-col gap-4 text-left">
              <div className="space-y-1.5">
                <span className="font-display text-xs text-gray-500 uppercase">Usuário</span>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" strokeWidth={3} />
                  <input
                    type="text"
                    value={userInput}
                    onChange={e => setUserInput(e.target.value)}
                    placeholder="Nome de usuário..."
                    className="w-full border-4 border-black pl-12 pr-4 py-3.5 font-sans font-bold text-black text-lg focus:outline-none focus:ring-4 focus:ring-secondary"
                  />
                </div>
              </div>

              <div className="space-y-1.5 mb-2">
                <span className="font-display text-xs text-gray-500 uppercase">Senha</span>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" strokeWidth={3} />
                  <input
                    type="password"
                    value={keyInput}
                    onChange={e => setKeyInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && verify()}
                    placeholder="Chave secreta..."
                    className="w-full border-4 border-black pl-12 pr-4 py-3.5 font-sans font-bold text-black text-lg focus:outline-none focus:ring-4 focus:ring-secondary"
                  />
                </div>
              </div>

              <button 
                onClick={verify} 
                disabled={verifying || !userInput || !keyInput}
                className="w-full bg-primary text-white border-4 border-black py-4 font-display text-xl comic-shadow flex items-center justify-center gap-2 hover:bg-yellow-400 hover:text-black transition-colors disabled:opacity-50 mt-4 uppercase tracking-wider"
              >
                {verifying ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    AUTENTICANDO...
                  </>
                ) : (
                  <>
                    <Lock className="w-5 h-5" strokeWidth={3} />
                    ENTRAR NO PAINEL
                  </>
                )}
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
            <button 
              onClick={() => {
                if (tab === "providers") {
                  setCustomProviderModal(true);
                } else {
                  setEditModal({ open: true });
                }
              }}
              className="flex items-center gap-2 bg-primary text-white font-display text-lg px-4 py-3 border-4 border-black comic-shadow hover:translate-y-[-2px] transition-transform"
            >
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
          <button onClick={() => setTab("ranking")}
            className={`flex-1 py-3 font-display text-lg flex items-center justify-center gap-2 border-l-4 border-black transition-colors ${tab === "ranking" ? "bg-secondary text-black" : "bg-white text-gray-500 hover:bg-muted"}`}>
            <Trophy className="w-5 h-5" strokeWidth={3} />
            RANKING
          </button>
          <button onClick={() => setTab("providers")}
            className={`flex-1 py-3 font-display text-lg flex items-center justify-center gap-2 border-l-4 border-black transition-colors ${tab === "providers" ? "bg-secondary text-black" : "bg-white text-gray-500 hover:bg-muted"}`}>
            <Database className="w-5 h-5" strokeWidth={3} />
            PROVEDORES
          </button>
          <button onClick={() => setTab("users")}
            className={`flex-1 py-3 font-display text-lg flex items-center justify-center gap-2 border-l-4 border-black transition-colors ${tab === "users" ? "bg-secondary text-black" : "bg-white text-gray-500 hover:bg-muted"}`}>
            <User className="w-5 h-5" strokeWidth={3} />
            USUÁRIOS
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

        {/* Ranking tab */}
        {tab === "ranking" && (
          <div className="space-y-4">
            {/* Header with clear all */}
            <div className="flex items-center justify-between">
              <p className="font-sans font-bold text-gray-600">
                {rankingData ? `${rankingData.total} título${rankingData.total !== 1 ? "s" : ""} no histórico (todos os tempos)` : ""}
              </p>
              {!confirmClearRanking ? (
                <button
                  onClick={() => setConfirmClearRanking(true)}
                  className="flex items-center gap-2 bg-primary text-white font-display text-base px-4 py-2 border-4 border-black comic-shadow hover:translate-y-[-2px] transition-transform"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={3} /> ZERAR TUDO
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-white border-4 border-primary p-2">
                  <AlertTriangle className="w-5 h-5 text-primary shrink-0" strokeWidth={3} />
                  <span className="font-display text-sm text-black">Confirma zerar?</span>
                  <button onClick={() => clearRankingMutation.mutate()} disabled={clearRankingMutation.isPending}
                    className="bg-primary text-white font-display text-sm px-3 py-1 border-2 border-black flex items-center gap-1 disabled:opacity-50">
                    {clearRankingMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" strokeWidth={3} />} SIM
                  </button>
                  <button onClick={() => setConfirmClearRanking(false)} className="font-display text-sm px-3 py-1 border-2 border-black hover:bg-muted">NÃO</button>
                </div>
              )}
            </div>

            {loadingRanking ? (
              <div className="flex items-center justify-center py-24"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>
            ) : !rankingData || rankingData.items.length === 0 ? (
              <div className="text-center py-24 border-4 border-dashed border-black bg-white">
                <Trophy className="w-16 h-16 mx-auto text-black/30 mb-4" />
                <p className="font-display text-3xl text-black/50">RANKING VAZIO</p>
                <p className="font-sans font-bold text-gray-500">Nenhuma busca registrada ainda.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rankingData.items.map((item, i) => (
                  <div key={`${item.revista}||${item.titulo}`} className="bg-white border-4 border-black flex items-center gap-4 px-4 py-3">
                    <span className={`font-display text-2xl leading-none shrink-0 w-8 text-center ${i < 3 ? "text-secondary" : "text-primary"}`} style={i < 3 ? { WebkitTextStroke: "2px black" } : { WebkitTextStroke: "1px black" }}>
                      #{i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-lg leading-tight truncate">{item.titulo || item.revista}</p>
                      <p className="font-sans font-bold text-gray-500 text-sm">
                        {[item.revista, item.editora].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="bg-secondary border-2 border-black font-display text-lg px-3 py-0.5">
                        {item.search_count}x
                      </span>
                    </div>
                    <button
                      onClick={() => deleteRankingEntryMutation.mutate({ revista: item.revista, titulo: item.titulo })}
                      disabled={deleteRankingEntryMutation.isPending}
                      title="Remover do ranking"
                      className="p-2 border-4 border-black hover:bg-primary hover:text-white transition-colors shrink-0 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={3} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Providers tab */}
        {tab === "providers" && (
          loadingProviders ? (
            <div className="flex items-center justify-center py-24"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {providers.map(p => (
                <div key={p.id} className={`bg-white border-4 border-black p-4 relative flex flex-col justify-between ${p.active ? "comic-shadow-sm" : "opacity-75"}`}>
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    <span className={`w-3.5 h-3.5 rounded-full border-2 border-black inline-block ${p.active ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
                    <span className="font-display text-xs text-gray-500 uppercase">{p.active ? "ON" : "OFF"}</span>
                  </div>
                  <div>
                    <h3 className="font-display text-2xl text-black">{p.name}</h3>
                    <p className="text-2xs text-gray-500 font-bold uppercase mb-2">Idioma: {p.language.toUpperCase()}</p>
                    <p className="text-xs text-gray-600 font-semibold font-sans leading-tight">
                      {p.id === "mangadex" && "Agregador global multilingue de mangás com API integrada em tempo real."}
                      {p.id === "comicextra" && "Fonte de HQs americanas digitalizadas em inglês de forma direta."}
                      {p.id === "mugiwaras" && "Provedor nacional focado em mangás de One Piece e lançamentos populares."}
                      {["bato", "mangafire", "hqnow"].includes(p.id) && `Provedor de contingência para o catálogo do ${p.name} (Plugin inativo).`}
                      {p.isCustom && `Provedor customizado autogerenciado conectado via Madara API em ${p.baseUrl}`}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t-2 border-dashed border-black/10 flex justify-between items-center">
                    <span className="font-sans font-bold text-2xs text-gray-400 uppercase">ID: {p.id}</span>
                    <div className="flex gap-2">
                      {p.isCustom && (
                        <button
                          onClick={() => deleteProvider(p.id)}
                          className="bg-red-100 hover:bg-red-200 text-red-700 font-display text-xs px-3 py-1.5 border-2 border-black rounded transition-colors"
                          title="Remover Provedor Customizado"
                        >
                          EXCLUIR
                        </button>
                      )}
                      <button
                        onClick={() => toggleProvider(p.id, p.active)}
                        className={`font-display text-sm px-4 py-1.5 border-2 border-black rounded transition-all ${p.active ? "bg-primary text-white hover:bg-red-600" : "bg-secondary text-black hover:bg-yellow-400"}`}
                      >
                        {p.active ? "DESATIVAR" : "ATIVAR"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Users tab */}
        {tab === "users" && (
          loadingUsers ? (
            <div className="flex items-center justify-center py-24"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>
          ) : !usersData || usersData.items.length === 0 ? (
            <div className="text-center py-24 border-4 border-dashed border-black bg-white">
              <User className="w-16 h-16 mx-auto text-gray-300 mb-4" strokeWidth={3} />
              <p className="font-display text-3xl text-black/50">NENHUM USUÁRIO</p>
              <p className="font-sans font-bold text-gray-500">Nenhum leitor se cadastrou ainda.</p>
            </div>
          ) : (
            <div className="bg-white border-4 border-black p-6 comic-shadow animate-in fade-in duration-200">
              <div className="overflow-x-auto">
                <table className="w-full text-left font-sans select-none border-collapse">
                  <thead>
                    <tr className="border-b-4 border-black text-xs font-display uppercase tracking-wider text-gray-500">
                      <th className="pb-3 pr-4">Nome de Usuário</th>
                      <th className="pb-3 pr-4">E-mail</th>
                      <th className="pb-3 pr-4 text-right">Data de Cadastro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-dashed divide-gray-200">
                    {usersData.items.map((user: any) => (
                      <tr key={user.id} className="text-black font-bold text-sm">
                        <td className="py-4 pr-4 flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-secondary border-2 border-black flex items-center justify-center">
                            <span className="font-display text-sm leading-none">{user.username.charAt(0).toUpperCase()}</span>
                          </div>
                          <span className="font-sans text-base">{user.username}</span>
                        </td>
                        <td className="py-4 pr-4 font-medium text-gray-600">
                          {user.email || "Não informado"}
                        </td>
                        <td className="py-4 pr-4 text-right font-medium text-gray-500">
                          {new Date(user.created_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

      {/* Add Custom Provider modal */}
      <AnimatePresence>
        {customProviderModal && (
          <CustomProviderModal 
            adminKey={adminKey}
            onClose={() => setCustomProviderModal(false)}
            onSaved={() => fetchProviders()}
          />
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

function CustomProviderModal({ adminKey, onClose, onSaved }: { adminKey: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("pt");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !baseUrl.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/providers/custom`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey
        },
        body: JSON.stringify({
          name: name.trim(),
          language,
          baseUrl: baseUrl.trim()
        })
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Erro ao adicionar");
      }

      toast({ title: "Provedor adicionado com sucesso!" });
      onSaved();
      onClose();
    } catch (err) {
      toast({
        title: "Erro ao adicionar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const inp = "w-full border-4 border-black px-3 py-2 font-sans font-bold text-black bg-white focus:outline-none focus:ring-4 focus:ring-secondary rounded-none";
  const lbl = "block font-display text-base text-black mb-1 uppercase";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-white comic-border comic-shadow max-w-md w-full z-10 text-black">
        <div className="bg-secondary border-b-4 border-black px-6 py-4 flex items-center justify-between">
          <h2 className="font-display text-2xl text-black">ADICIONAR PROVEDOR</h2>
          <button onClick={onClose}><X className="w-6 h-6" strokeWidth={3} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={lbl}>Nome do Provedor *</label>
            <input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="Ex: MangaLivre Oficial, Scan Top" 
              required 
              className={inp} 
            />
          </div>
          <div>
            <label className={lbl}>Idioma *</label>
            <select 
              value={language} 
              onChange={e => setLanguage(e.target.value)} 
              className={inp}
            >
              <option value="pt">Português (pt)</option>
              <option value="en">Inglês (en)</option>
              <option value="multi">Multi-idioma (multi)</option>
            </select>
          </div>
          <div>
            <label className={lbl}>URL do Site (WordPress/Madara) *</label>
            <input 
              value={baseUrl} 
              onChange={e => setBaseUrl(e.target.value)} 
              placeholder="Ex: https://meusite.com/" 
              required 
              className={inp} 
            />
            <p className="text-2xs text-gray-500 font-bold uppercase mt-1">
              Deve ser um site com tema Madara estruturado.
            </p>
          </div>
          
          <div className="pt-2">
            <button 
              type="submit" 
              disabled={saving}
              className="w-full bg-primary text-white border-4 border-black py-3 font-display text-xl comic-shadow hover:translate-y-[-2px] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" strokeWidth={3} />}
              SALVAR PROVEDOR
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
