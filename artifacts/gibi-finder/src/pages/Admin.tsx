import { useState, useEffect, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, BookOpen, Lock, Loader2, Pencil, Trash2, Plus, Eye, EyeOff, MessageSquare, Bug, Lightbulb, Archive, Trophy, AlertTriangle, User, RefreshCw, ChevronLeft, ChevronRight, Search, RotateCcw, Sparkles } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { useToast } from "@/hooks/use-toast";
import { SafeImage } from "@/components/ui/SafeImage";
import { ProviderInspectorPanel } from "@/pages/ProviderInspector";
import { AdminShell, type AdminModule } from "@/components/admin/AdminShell";
import { AdminDashboard, type DashboardStats } from "@/components/admin/AdminDashboard";
import { AdminEngines } from "@/components/admin/AdminEngines";
import { AdminSystem } from "@/components/admin/AdminSystem";
import { scoreItem, qualityColor } from "@/components/admin/quality";
import { CatalogObraPage } from "@/components/admin/CatalogObraPage";

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

function GibiAdminCard({ gibi, onReview, onEdit, onDelete }: { gibi: Gibi; onReview?: (action: "approve" | "reject") => void; onEdit: () => void; onDelete: () => void }) {
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

// Manage live catalog/provider items via the override layer: search, hide/show,
// and replace cover / synopsis / title without touching the source.
const PAGE_SIZE = 48;

// Brazilian-gibi title hints — fallback when an item carries no genre tag.
const GIBI_TITLE_HINTS = ["monica", "mônica", "cebolinha", "magali", "cascao", "cascão", "chico bento", "almanaque", "turma da", "penadinho", "pelezinho", "ronaldinho", "menino maluquinho", "disney", "mickey", "pato donald", "tio patinhas"];

const MANGA_PROVIDER_IDS = ["mangadex", "mangaplus", "mangafire", "mugiwaras", "slimeread", "bato", "hqnow"];

// Mirrors the app's Explore typeOf: a biblioteca-br item is HQ when tagged "hq",
// otherwise it's a Gibi (with a title-hint fallback for untagged items). Items
// from the manga aggregators are classified Mangá.
function itemType(item: any): "gibi" | "hq" | "manga" {
  const provs: string[] = (item?.sources || []).map((s: any) => s?.providerId);
  const genres: string[] = (item?.genres || []).map((x: string) => (x || "").toLowerCase());
  const isBiblioteca = provs.includes("biblioteca-br");
  if (isBiblioteca) {
    // A gibi title hint always wins (fixes Turma da Mônica mistagged as HQ).
    const t = (item?.title || "").toLowerCase();
    if (GIBI_TITLE_HINTS.some(k => t.includes(k))) return "gibi";
    if (genres.includes("hq")) return "hq";
    if (genres.some(g => g.includes("gibi") || g.includes("nacional"))) return "gibi";
    return "hq";
  }
  if (provs.some(p => MANGA_PROVIDER_IDS.includes(p))) return "manga";
  return "hq";
}

const TYPE_LABEL: Record<string, string> = { hq: "HQ", gibi: "Gibi", manga: "Mangá" };

// Near-duplicate key: drops accents, parenthetical/bracket annotations (year,
// scan tags) and punctuation, keeping digits. Catches "The Boys" vs "The Boys
// (2020)" without flagging different issues (#1 vs #2 keep distinct numbers).
function dupeKey(title: string): string {
  return (title || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[[(][^\])]*[\])]/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-4 border-black bg-white p-3">
      <p className="font-display text-xs uppercase tracking-wider text-black/50 mb-2">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function FilterRow({ active, onClick, label, count, dot }: { active: boolean; onClick: () => void; label: string; count?: number; dot?: string }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 border-2 font-sans font-bold text-sm transition-colors ${active ? "bg-secondary border-black text-black" : "border-transparent text-gray-500 hover:bg-muted hover:text-black"}`}>
      {dot && <span>{dot}</span>}
      <span className="flex-1 text-left truncate">{label}</span>
      {count !== undefined && <span className={`text-2xs font-bold px-1.5 border ${active ? "border-black bg-white" : "border-gray-300 bg-muted text-gray-500"}`}>{count}</span>}
    </button>
  );
}

function CatalogManager({ adminKey, items, loading, onReload, byProvider, onRebuild, rebuilding, diag }: { adminKey: string; items: any[]; loading: boolean; onReload: () => void; byProvider: Record<string, number>; onRebuild: () => void; rebuilding: boolean; diag?: any }) {
  const { toast } = useToast();
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [selected, setSelected] = useState<any | null>(null);
  const [confirmDel, setConfirmDel] = useState<any | null>(null);
  // Covers that have a URL but failed to load (broken Drive thumbnails), detected
  // as rows render. Treated as "sem capa" for curation.
  const [brokenCovers, setBrokenCovers] = useState<Set<string>>(new Set());
  const markBroken = (k: string) => setBrokenCovers(prev => prev.has(k) ? prev : new Set(prev).add(k));
  const [filling, setFilling] = useState(false);

  const autofillSynopsis = async () => {
    setFilling(true);
    try {
      const data = await adminRequest("/api/admin/catalog/autofill-synopsis", adminKey, "POST", { limit: 12 });
      toast({
        title: `Sinopses: +${data.filled} de ${data.scanned}`,
        description: data.filled === 0
          ? `A fonte (HQ) não cobre estes títulos. Faltam ~${data.remaining}. Clique de novo — o lote é aleatório e vai achando os HQs.`
          : `Faltam ~${data.remaining}. Clique de novo para continuar.`,
      });
      onReload();
      await loadOverrides();
    } catch (e) {
      toast({ title: "Erro ao completar sinopses", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setFilling(false); }
  };
  // filters
  const [q, setQ] = useState("");
  const [fType, setFType] = useState<"all" | "hq" | "gibi" | "manga">("all");
  const [fProv, setFProv] = useState<string>("all");
  const [fStatus, setFStatus] = useState<"all" | "edited" | "hidden" | "clean" | "no-cover" | "no-synopsis" | "incomplete" | "duplicates">("all");
  const [page, setPage] = useState(0);

  const keyOf = (item: any) => { const s = item?.sources?.[0]; return s ? `${s.providerId}:${s.id}` : ""; };

  const loadOverrides = async () => {
    try {
      const list = await adminRequest("/api/admin/catalog-overrides", adminKey, "GET");
      const map: Record<string, any> = {};
      for (const o of list || []) map[o.id] = o;
      setOverrides(map);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadOverrides(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { setPage(0); }, [q, fType, fProv, fStatus]);

  const save = async (item: any, patch: any) => {
    const s = item?.sources?.[0];
    if (!s) return;
    const cur = overrides[keyOf(item)] || {};
    try {
      await adminRequest("/api/admin/catalog-overrides", adminKey, "PUT", {
        providerId: s.providerId, itemId: s.id,
        hidden: patch.hidden ?? cur.hidden ?? false,
        coverUrl: patch.coverUrl ?? cur.coverUrl ?? null,
        description: patch.description ?? cur.description ?? null,
        title: patch.title ?? cur.title ?? null,
      });
      toast({ title: "Salvo!" });
      await loadOverrides();
    } catch (e) { toast({ title: "Erro ao salvar", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
  };

  const removeOverride = async (item: any) => {
    try { await adminRequest(`/api/admin/catalog-overrides/${encodeURIComponent(keyOf(item))}`, adminKey, "DELETE"); await loadOverrides(); toast({ title: "Restaurado ao original" }); } catch { /* */ }
  };

  // "Deletar" um item de catálogo = esconder permanente (não dá pra apagar o
  // arquivo na origem; some do app pra sempre e continua sumido após reconstruir).
  const deleteItem = async (item: any) => {
    await save(item, { hidden: true });
    setConfirmDel(null);
    toast({ title: "Gibi removido do catálogo" });
  };

  // Provider list for the filter dropdown
  const providers = Array.from(new Set(items.map(it => it.sources?.[0]?.providerId).filter(Boolean))).sort();

  // Near-duplicate detection: items whose base title (year/tags/punctuation
  // stripped) collides with another item's.
  const dupCount: Record<string, number> = {};
  for (const it of items) {
    const dk = dupeKey(overrides[keyOf(it)]?.title || it.title);
    if (dk) dupCount[dk] = (dupCount[dk] || 0) + 1;
  }
  const isDup = (it: any) => { const dk = dupeKey(overrides[keyOf(it)]?.title || it.title); return !!dk && dupCount[dk] > 1; };

  const nq = q.trim().toLowerCase();
  let filtered = items.filter(it => {
    const ov = overrides[keyOf(it)];
    const title = (ov?.title || it.title || "").toLowerCase();
    if (nq && !title.includes(nq)) return false;
    if (fType !== "all" && itemType(it) !== fType) return false;
    if (fProv !== "all" && it.sources?.[0]?.providerId !== fProv) return false;
    if (fStatus === "hidden" && !ov?.hidden) return false;
    if (fStatus === "edited" && !(ov && !ov.hidden)) return false;
    if (fStatus === "clean" && ov) return false;
    if (fStatus === "no-cover" && (ov?.coverUrl || it.coverUrl) && !brokenCovers.has(keyOf(it))) return false;
    if (fStatus === "no-synopsis" && String(ov?.description || it.description || "").trim().length >= 60) return false;
    if (fStatus === "incomplete" && scoreItem(it, ov).score >= 100) return false;
    if (fStatus === "duplicates" && !isDup(it)) return false;
    return true;
  });
  // When viewing duplicates, group identical titles together so pairs are adjacent.
  if (fStatus === "duplicates") {
    filtered = [...filtered].sort((a, b) => dupeKey(overrides[keyOf(a)]?.title || a.title).localeCompare(dupeKey(overrides[keyOf(b)]?.title || b.title)));
  }

  const nHq = items.filter(it => itemType(it) === "hq").length;
  const nGibi = items.filter(it => itemType(it) === "gibi").length;
  const nManga = items.filter(it => itemType(it) === "manga").length;
  const nHidden = items.filter(it => overrides[keyOf(it)]?.hidden).length;
  const nEdited = items.filter(it => { const o = overrides[keyOf(it)]; return o && !o.hidden; }).length;
  // Curation queue counts (Modo Curadoria)
  const nNoCover = items.filter(it => { const o = overrides[keyOf(it)]; return !(o?.coverUrl || it.coverUrl) || brokenCovers.has(keyOf(it)); }).length;
  const nNoSyn = items.filter(it => { const o = overrides[keyOf(it)]; return String(o?.description || it.description || "").trim().length < 60; }).length;
  const nIncomplete = items.filter(it => scoreItem(it, overrides[keyOf(it)]).score < 100).length;
  const nDup = items.filter(isDup).length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // Full-page work editor (no popup) — replaces the list while an item is open.
  if (selected) {
    const ov = overrides[keyOf(selected)];
    return (
      <CatalogObraPage
        item={selected}
        override={ov}
        type={itemType(selected)}
        onBack={() => setSelected(null)}
        onSave={async (patch) => { await save(selected, patch); }}
        onToggleHide={async () => { await save(selected, { hidden: !ov?.hidden }); }}
        onRestore={async () => { await removeOverride(selected); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Stat chips */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="border-4 border-black bg-secondary px-3 py-1.5 font-display text-sm">TOTAL {items.length}</span>
        <span className="border-4 border-black bg-white px-3 py-1.5 font-display text-sm">HQ {nHq}</span>
        <span className="border-4 border-black bg-white px-3 py-1.5 font-display text-sm">GIBI {nGibi}</span>
        <span className="border-4 border-black bg-white px-3 py-1.5 font-display text-sm">EDITADOS {nEdited}</span>
        <span className="border-4 border-black bg-white px-3 py-1.5 font-display text-sm">ESCONDIDOS {nHidden}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={autofillSynopsis} disabled={filling || loading} title="Preenche sinopses reais em lote (fonte externa, 12 por vez)"
            className="border-4 border-black px-3 py-1.5 font-display text-sm bg-white hover:bg-secondary flex items-center gap-2 disabled:opacity-50">
            <Sparkles className={`w-4 h-4 ${filling ? "animate-pulse" : ""}`} /> {filling ? "COMPLETANDO…" : "COMPLETAR SINOPSES"}
          </button>
          <button onClick={() => { onReload(); loadOverrides(); }} disabled={loading || rebuilding}
            className="border-4 border-black px-3 py-1.5 font-display text-sm bg-white hover:bg-muted flex items-center gap-2 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> ATUALIZAR
          </button>
          <button onClick={onRebuild} disabled={rebuilding || loading} title="Força um novo crawl dos Drives + Google Sites"
            className="border-4 border-black px-3 py-1.5 font-display text-sm bg-primary text-white hover:bg-red-600 flex items-center gap-2 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${rebuilding ? "animate-spin" : ""}`} /> {rebuilding ? "RECONSTRUINDO…" : "RECONSTRUIR"}
          </button>
        </div>
      </div>

      {/* Provider breakdown — where the items come from */}
      {Object.keys(byProvider).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(byProvider).sort((a, b) => b[1] - a[1]).map(([pid, n]) => (
            <span key={pid} className="text-2xs font-bold uppercase tracking-wide bg-muted border-2 border-black px-2 py-0.5">{pid} · {n}</span>
          ))}
        </div>
      )}

      {/* Diagnostics — why the curated (Drive) library may be empty */}
      {diag && (() => {
        const bib = diag.cache?.["biblioteca-br"];
        const bibRaw = diag.providerRaw?.["biblioteca-br"] ?? 0;
        const driveKey = !!diag.driveKey;
        const persisted = !!bib?.persisted;
        const problems: string[] = [];
        if (!driveKey) problems.push("Chave da API do Google Drive ausente no servidor (GOOGLE_DRIVE_API_KEY) — sem ela, os Drives não são listados.");
        if (!persisted) problems.push("A tabela curated_cache não está persistindo no Supabase — rode o SQL de schema. Sem cache, cada carga refaz o crawl e pode estourar o tempo limite.");
        if (driveKey && bibRaw === 0) problems.push("O crawl dos Drives retornou 0 itens (pode ter estourado o tempo). Clique RECONSTRUIR para forçar um novo crawl.");
        const ok = problems.length === 0;
        return (
          <div className={`border-4 border-black p-3 ${ok ? "bg-green-50" : "bg-yellow-50"}`}>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-display text-sm">DIAGNÓSTICO</span>
              <span className={`text-2xs font-bold px-2 py-0.5 border-2 border-black ${driveKey ? "bg-green-200" : "bg-red-200"}`}>Drive API {driveKey ? "OK" : "AUSENTE"}</span>
              <span className={`text-2xs font-bold px-2 py-0.5 border-2 border-black ${persisted ? "bg-green-200" : "bg-red-200"}`}>Cache {persisted ? `persistido (${bib?.remoteCount ?? 0})` : "não persistido"}</span>
              <span className="text-2xs font-bold px-2 py-0.5 border-2 border-black bg-white">biblioteca-br cru: {bibRaw}</span>
              {bib?.updatedAt && <span className="text-2xs font-bold text-gray-500">atualizado {new Date(bib.updatedAt).toLocaleString("pt-BR")}</span>}
            </div>
            {ok ? (
              <p className="font-sans font-bold text-green-700 text-xs">Tudo certo com as fontes do catálogo. ✅</p>
            ) : (
              <ul className="list-disc pl-5 space-y-0.5">
                {problems.map((p, i) => <li key={i} className="font-sans font-bold text-yellow-800 text-xs">{p}</li>)}
              </ul>
            )}
            {diag.errors && Object.keys(diag.errors).length > 0 && (
              <p className="font-sans font-bold text-red-600 text-2xs mt-1">Erros: {Object.entries(diag.errors).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
            )}
          </div>
        );
      })()}

      {/* Search (instant) */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por título… (instantâneo)"
          className="w-full border-4 border-black pl-9 pr-3 py-2 font-sans font-bold text-black bg-white focus:outline-none focus:ring-4 focus:ring-secondary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[210px_1fr] gap-4">
        {/* Filter rail */}
        <aside className="space-y-3">
          <FilterSection title="Tipo">
            <FilterRow active={fType === "all"} onClick={() => setFType("all")} label="Todos" count={items.length} />
            <FilterRow active={fType === "hq"} onClick={() => setFType("hq")} label="HQ" count={nHq} />
            <FilterRow active={fType === "gibi"} onClick={() => setFType("gibi")} label="Gibi" count={nGibi} />
            <FilterRow active={fType === "manga"} onClick={() => setFType("manga")} label="Mangá" count={nManga} />
          </FilterSection>
          <FilterSection title="Curadoria">
            <FilterRow active={fStatus === "no-cover"} onClick={() => setFStatus(fStatus === "no-cover" ? "all" : "no-cover")} label="Sem capa" count={nNoCover} dot="🟥" />
            <FilterRow active={fStatus === "no-synopsis"} onClick={() => setFStatus(fStatus === "no-synopsis" ? "all" : "no-synopsis")} label="Sem sinopse" count={nNoSyn} dot="🟧" />
            <FilterRow active={fStatus === "incomplete"} onClick={() => setFStatus(fStatus === "incomplete" ? "all" : "incomplete")} label="Incompletos" count={nIncomplete} dot="🟨" />
            <FilterRow active={fStatus === "duplicates"} onClick={() => setFStatus(fStatus === "duplicates" ? "all" : "duplicates")} label="Duplicados" count={nDup} dot="🟦" />
          </FilterSection>
          <FilterSection title="Status">
            <FilterRow active={fStatus === "all"} onClick={() => setFStatus("all")} label="Todos" />
            <FilterRow active={fStatus === "clean"} onClick={() => setFStatus("clean")} label="Originais" />
            <FilterRow active={fStatus === "edited"} onClick={() => setFStatus("edited")} label="Editados" count={nEdited} />
            <FilterRow active={fStatus === "hidden"} onClick={() => setFStatus("hidden")} label="Ocultos" count={nHidden} />
          </FilterSection>
          <FilterSection title="Provider">
            <FilterRow active={fProv === "all"} onClick={() => setFProv("all")} label="Todos" />
            {providers.map(p => <FilterRow key={p} active={fProv === p} onClick={() => setFProv(p)} label={p} count={byProvider[p]} />)}
          </FilterSection>
        </aside>

        {/* Table */}
        <div className="min-w-0 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-24"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="font-sans font-bold text-gray-500 text-sm">
                  {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
                  {filtered.length > PAGE_SIZE && ` · página ${page + 1}/${totalPages}`}
                </p>
                {(fType !== "all" || fStatus !== "all" || fProv !== "all" || q) && (
                  <button onClick={() => { setFType("all"); setFStatus("all"); setFProv("all"); setQ(""); }}
                    className="text-2xs font-bold uppercase border-2 border-black px-2 py-1 hover:bg-muted">Limpar filtros</button>
                )}
              </div>

              <div className="border-4 border-black bg-white overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[720px]">
                  <thead>
                    <tr className="border-b-4 border-black font-display text-2xs uppercase tracking-wider text-gray-500 bg-muted/50">
                      <th className="py-2 px-2 w-12"></th>
                      <th className="py-2 px-2">Nome</th>
                      <th className="py-2 px-2 w-16">Tipo</th>
                      <th className="py-2 px-2 w-28">Provider</th>
                      <th className="py-2 px-2 w-16 text-center">Score</th>
                      <th className="py-2 px-2 w-16 text-center">Leituras</th>
                      <th className="py-2 px-2 w-16 text-center">Favoritos</th>
                      <th className="py-2 px-2 w-24">Status</th>
                      <th className="py-2 px-2 w-24 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-gray-100">
                    {pageItems.map((item, i) => {
                      const k = keyOf(item);
                      const ov = overrides[k];
                      const cover = ov?.coverUrl || item.coverUrl;
                      const title = ov?.title || item.title;
                      const prov = item.sources?.[0]?.providerId;
                      const nSources = item.sources?.length || 0;
                      const qs = scoreItem(item, ov);
                      const t = itemType(item);
                      return (
                        <tr key={k || i} className={`hover:bg-secondary/10 cursor-pointer ${ov?.hidden ? "opacity-50" : ""}`} onClick={() => setSelected(item)}>
                          <td className="py-1.5 px-2">
                            <div className="w-9 h-12 border-2 border-black bg-muted overflow-hidden">
                              {cover ? <SafeImage src={cover} alt={title} className="w-full h-full object-cover" onBroken={() => markBroken(k)} /> : <div className="w-full h-full bg-secondary/30" />}
                            </div>
                          </td>
                          <td className="py-1.5 px-2 min-w-0">
                            <p className="font-sans font-bold text-black text-sm leading-tight line-clamp-2">{title}</p>
                          </td>
                          <td className="py-1.5 px-2"><span className="text-2xs font-bold uppercase bg-muted border-2 border-black px-1.5 py-0.5">{TYPE_LABEL[t]}</span></td>
                          <td className="py-1.5 px-2">
                            <span className="text-xs font-bold text-gray-600">{prov}</span>
                            {nSources > 1 && <span className="text-2xs text-gray-400"> +{nSources - 1}</span>}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <span className="inline-block text-2xs font-bold border-2 border-black px-1.5 py-0.5 text-white" style={{ background: qualityColor(qs.score) }} title={qs.checks.filter(c => !c.ok).map(c => c.hint).join(" · ") || "Completo"}>{qs.score}%</span>
                          </td>
                          <td className="py-1.5 px-2 text-center text-gray-300 font-bold" title="Com telemetria de leitura">—</td>
                          <td className="py-1.5 px-2 text-center text-gray-300 font-bold" title="Com telemetria de leitura">—</td>
                          <td className="py-1.5 px-2">
                            {ov?.hidden ? <span className="text-2xs font-bold bg-red-200 border-2 border-black px-1.5">Oculto</span>
                              : ov ? <span className="text-2xs font-bold bg-secondary border-2 border-black px-1.5">Editado</span>
                                : <span className="text-2xs font-bold text-gray-400">Original</span>}
                          </td>
                          <td className="py-1.5 px-2" onClick={e => e.stopPropagation()}>
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => save(item, { hidden: !ov?.hidden })} title={ov?.hidden ? "Mostrar" : "Esconder"} className="p-1.5 border-2 border-black hover:bg-secondary">{ov?.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
                              <button onClick={() => setSelected(item)} title="Abrir página da obra" className="p-1.5 border-2 border-black hover:bg-secondary"><Pencil className="w-3.5 h-3.5" /></button>
                              {ov && <button onClick={() => removeOverride(item)} title="Restaurar original" className="p-1.5 border-2 border-black hover:bg-secondary"><RotateCcw className="w-3.5 h-3.5" /></button>}
                              <button onClick={() => setConfirmDel(item)} title="Deletar do catálogo" className="p-1.5 border-2 border-black hover:bg-primary hover:text-white"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filtered.length === 0 && <p className="text-center text-gray-400 py-12 font-display">Nenhum item com esses filtros.</p>}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-1">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="border-4 border-black p-2 hover:bg-muted disabled:opacity-30"><ChevronLeft className="w-5 h-5" /></button>
                  <span className="font-display text-lg">{page + 1} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                    className="border-4 border-black p-2 hover:bg-muted disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirmar deleção (= esconder permanente para itens de catálogo) */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmDel(null)} />
          <div className="relative bg-white border-4 border-black comic-shadow max-w-sm w-full p-6 z-10">
            <h3 className="font-display text-2xl text-black mb-2">DELETAR GIBI</h3>
            <p className="font-sans font-bold text-gray-700 text-sm mb-1">Remover <b>“{overrides[keyOf(confirmDel)]?.title || confirmDel.title}”</b> do catálogo?</p>
            <p className="font-sans text-xs text-gray-500 mb-5">Some do app para todos. Como o arquivo vem do Drive, isso é um "esconder permanente" (continua sumido mesmo após reconstruir). Dá pra reverter em Ocultos → Restaurar.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)} className="flex-1 border-4 border-black py-2 font-display hover:bg-muted">CANCELAR</button>
              <button onClick={() => deleteItem(confirmDel)} className="flex-1 bg-primary text-white border-4 border-black py-2 font-display comic-shadow flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" strokeWidth={3} /> DELETAR</button>
            </div>
          </div>
        </div>
      )}
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
  const [tab, setTab] = useState<AdminModule>("dashboard");
  // Sub-view inside the Catálogo module (library = crawled catalog; pending/sent = manual submissions)
  const [catalogView, setCatalogView] = useState<"library" | "pending" | "sent">("library");
  const [rebuildingCatalog, setRebuildingCatalog] = useState(false);
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

  // Fetch providers once unlocked so the Dashboard can show online/offline counts.
  useEffect(() => {
    if (unlocked) fetchProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);
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
    enabled: unlocked && tab === "analytics",
    select: (d: { items: { revista: string; titulo: string; editora: string; search_count: number; last_searched: string }[]; total: number }) => d,
  });

  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ["admin-users", adminKey],
    queryFn: () => adminRequest("/api/admin/users", adminKey),
    enabled: unlocked,
    select: (d: { items: { id: string; username: string; email?: string; created_at: string; readCount?: number; favCount?: number; lastReadAt?: string | null }[]; total: number }) => d,
  });

  const { data: healthData } = useQuery({
    queryKey: ["admin-system-health", adminKey],
    queryFn: () => adminRequest("/api/admin/system-health", adminKey),
    enabled: unlocked && tab === "system",
    select: (d: { env: Record<string, boolean>; tables: Record<string, boolean>; services?: Record<string, { ok: boolean | null; detail: string }> }) => d,
  });

  const { data: catalogData, isLoading: loadingCatalog } = useQuery({
    queryKey: ["admin-catalog", adminKey],
    queryFn: () => adminRequest("/api/admin/catalog", adminKey),
    enabled: unlocked,
    select: (d: { items: any[]; total: number; byProvider?: Record<string, number> }) => d,
    staleTime: 5 * 60 * 1000,
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
    refetchInterval: tab === "feedback" ? 30000 : false,
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
  const catalogItems = catalogData?.items || [];

  const reloadCatalog = () => queryClient.invalidateQueries({ queryKey: ["admin-catalog"] });

  const rebuildCatalog = async () => {
    setRebuildingCatalog(true);
    try {
      const data = await adminRequest("/api/admin/catalog/rebuild", adminKey, "POST");
      queryClient.setQueryData(["admin-catalog", adminKey], data);
      toast({ title: `Catálogo reconstruído: ${data.total} itens` });
    } catch (e) {
      toast({ title: "Erro ao reconstruir", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setRebuildingCatalog(false); }
  };

  const dashboardStats: DashboardStats = {
    catalogTotal: catalogData?.total ?? null,
    catalogLoading: loadingCatalog,
    pending: pendingItems.length,
    sent: approvedItems.length,
    usersTotal: usersData?.total ?? null,
    feedbackNew: newSuggestions.length,
    feedbackTotal: suggestionItems.length,
    providersOnline: providers.filter(p => p.active).length,
    providersOffline: providers.filter(p => !p.active).length,
    offlineProviders: providers.filter(p => !p.active).map(p => p.name),
  };

  // Per-module header config for the shell
  const moduleMeta: Record<AdminModule, { title: string; subtitle?: string }> = {
    dashboard: { title: "Dashboard", subtitle: "Visão geral do sistema" },
    catalog: { title: "Catálogo", subtitle: "Biblioteca completa, pendentes e enviados" },
    providers: { title: "Providers", subtitle: "Fontes de conteúdo" },
    engines: { title: "Engines", subtitle: "Motores reutilizáveis de scraping" },
    users: { title: "Usuários", subtitle: usersData ? `${usersData.total} cadastrado(s)` : undefined },
    analytics: { title: "Analytics", subtitle: "Métricas e ranking de buscas" },
    feedback: { title: "Feedback", subtitle: "Sugestões e bugs reportados" },
    inspector: { title: "Inspector", subtitle: "Diagnóstico de URLs e engines" },
    system: { title: "Sistema", subtitle: "Jobs, cache, logs e infraestrutura" },
  };

  const headerActions = (() => {
    if (tab === "catalog" && catalogView !== "library") {
      return (
        <button onClick={() => setEditModal({ open: true })}
          className="flex items-center gap-2 bg-primary text-white font-display text-base px-3 py-2 border-4 border-black comic-shadow-sm hover:translate-y-[-2px] transition-transform">
          <Plus className="w-4 h-4" strokeWidth={3} /> ADICIONAR
        </button>
      );
    }
    if (tab === "providers") {
      return (
        <button onClick={() => setCustomProviderModal(true)}
          className="flex items-center gap-2 bg-primary text-white font-display text-base px-3 py-2 border-4 border-black comic-shadow-sm hover:translate-y-[-2px] transition-transform">
          <Plus className="w-4 h-4" strokeWidth={3} /> PROVIDER
        </button>
      );
    }
    return null;
  })();

  const exitAdmin = () => { localStorage.removeItem(STORAGE_KEY); setUnlocked(false); setAdminKey(""); setKeyInput(""); };

  if (!unlocked) {
    return (
      <Layout minimal>
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
    <AdminShell
      active={tab}
      onNavigate={setTab}
      onExit={exitAdmin}
      badges={{ catalog: pendingItems.length || undefined, feedback: newSuggestions.length || undefined }}
      title={moduleMeta[tab].title}
      subtitle={moduleMeta[tab].subtitle}
      actions={headerActions}
    >
      {tab === "dashboard" && <AdminDashboard stats={dashboardStats} onNavigate={setTab} />}

      {tab === "catalog" && (
        <div className="space-y-5">
          <div className="inline-flex border-4 border-black overflow-hidden">
            {([["library", "Biblioteca"], ["pending", pendingItems.length ? `Pendentes (${pendingItems.length})` : "Pendentes"], ["sent", `Enviados (${approvedItems.length})`]] as const).map(([k, label], i) => (
              <button key={k} onClick={() => setCatalogView(k)}
                className={`px-4 py-2 font-display text-base ${i > 0 ? "border-l-4 border-black" : ""} ${catalogView === k ? "bg-secondary text-black" : "bg-white text-gray-500 hover:bg-muted"}`}>
                {label}
              </button>
            ))}
          </div>

          {catalogView === "library" && <CatalogManager adminKey={adminKey} items={catalogItems} loading={loadingCatalog} onReload={reloadCatalog} byProvider={catalogData?.byProvider || {}} onRebuild={rebuildCatalog} rebuilding={rebuildingCatalog} diag={(catalogData as any)?.diag} />}

          {catalogView === "pending" && (
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
                <GibiAdminCard key={gibi.id} gibi={gibi}
                  onReview={(action) => reviewMutation.mutate({ id: gibi.id, action })}
                  onEdit={() => setEditModal({ open: true, gibi })}
                  onDelete={() => setConfirmDelete(gibi.id)}
                />
              ))}
            </div>
          )
        )}

          {catalogView === "sent" && (
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
                <GibiAdminCard key={gibi.id} gibi={{ ...gibi, status: "approved" }}
                  onEdit={() => setEditModal({ open: true, gibi })}
                  onDelete={() => setConfirmDelete(gibi.id)}
                />
              ))}
            </div>
          )
        )}

        </div>
      )}

      {tab === "feedback" && (
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

        {/* Analytics (ranking de buscas) */}
        {tab === "analytics" && (
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
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className={`font-display text-2xs px-2 py-0.5 border-2 border-black rounded uppercase ${p.isCustom ? "bg-secondary text-black" : "bg-muted text-gray-600"}`}>
                        {p.engine || (p.isCustom ? "Madara/WordPress" : "Nativo")}
                      </span>
                      {p.isCustom && (
                        <span className="font-sans font-extrabold text-2xs px-2 py-0.5 border-2 border-black rounded uppercase bg-white text-gray-500">
                          Custom
                        </span>
                      )}
                    </div>
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

        {/* Provider Inspector tab */}
        {tab === "inspector" && (
          <ProviderInspectorPanel initialAdminKey={adminKey} showBackLink={false} />
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
                <table className="w-full text-left font-sans select-none border-collapse min-w-[640px]">
                  <thead>
                    <tr className="border-b-4 border-black text-xs font-display uppercase tracking-wider text-gray-500">
                      <th className="pb-3 pr-4">Nome de Usuário</th>
                      <th className="pb-3 pr-4 text-center">Títulos lidos</th>
                      <th className="pb-3 pr-4 text-center">Favoritos</th>
                      <th className="pb-3 pr-4">E-mail</th>
                      <th className="pb-3 pr-4 text-right">Última leitura</th>
                      <th className="pb-3 pr-4 text-right">Cadastro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-dashed divide-gray-200">
                    {[...usersData.items].sort((a: any, b: any) => (b.readCount || 0) - (a.readCount || 0)).map((user: any) => (
                      <tr key={user.id} className="text-black font-bold text-sm">
                        <td className="py-4 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-secondary border-2 border-black flex items-center justify-center shrink-0">
                              <span className="font-display text-sm leading-none">{user.username.charAt(0).toUpperCase()}</span>
                            </div>
                            <span className="font-sans text-base">{user.username}</span>
                          </div>
                        </td>
                        <td className="py-4 pr-4 text-center">
                          <span className="inline-block font-display text-lg border-2 border-black bg-secondary px-2.5 py-0.5">{user.readCount ?? 0}</span>
                        </td>
                        <td className="py-4 pr-4 text-center font-display text-lg text-gray-700">{user.favCount ?? 0}</td>
                        <td className="py-4 pr-4 font-medium text-gray-600">{user.email || "Não informado"}</td>
                        <td className="py-4 pr-4 text-right font-medium text-gray-500">
                          {user.lastReadAt ? new Date(user.lastReadAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}
                        </td>
                        <td className="py-4 pr-4 text-right font-medium text-gray-500">
                          {new Date(user.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

      {tab === "engines" && (
        <AdminEngines providers={providers} onGoProviders={() => setTab("providers")} />
      )}

      {tab === "system" && (
        <AdminSystem info={{
          diag: (catalogData as any)?.diag,
          catalogTotal: catalogData?.total ?? null,
          usersTotal: usersData?.total ?? null,
          providersOnline: providers.filter(p => p.active).length,
          providersOffline: providers.filter(p => !p.active).length,
          env: healthData?.env,
          tables: healthData?.tables,
          services: healthData?.services,
        }} />
      )}

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
    </AdminShell>
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
            <label className={lbl}>URL do Site *</label>
            <input 
              value={baseUrl} 
              onChange={e => setBaseUrl(e.target.value)} 
              placeholder="Ex: https://meusite.com/" 
              required 
              className={inp} 
            />
            <p className="text-2xs text-gray-500 font-bold uppercase mt-1">
              Use o Inspector para descobrir a engine ideal antes de cadastrar.
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
