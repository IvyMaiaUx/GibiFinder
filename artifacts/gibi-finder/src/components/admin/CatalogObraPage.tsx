import { useState } from "react";
import {
  ArrowLeft, Info, FileText, Image as ImageIcon, ListOrdered, Globe,
  BarChart3, Search, History, ScrollText, Eye, EyeOff, RotateCcw, Save,
  Sparkles, Loader2, Construction,
} from "lucide-react";
import { SafeImage } from "@/components/ui/SafeImage";
import { scoreItem, qualityColor, type QualityResult } from "./quality";

type ObraTab = "info" | "sinopse" | "capas" | "capitulos" | "providers" | "stats" | "seo" | "historico" | "logs";

const TABS: { key: ObraTab; label: string; icon: typeof Info; ready: boolean }[] = [
  { key: "info", label: "Informações", icon: Info, ready: true },
  { key: "sinopse", label: "Sinopse", icon: FileText, ready: true },
  { key: "capas", label: "Capas", icon: ImageIcon, ready: true },
  { key: "capitulos", label: "Capítulos", icon: ListOrdered, ready: false },
  { key: "providers", label: "Providers", icon: Globe, ready: false },
  { key: "stats", label: "Estatísticas", icon: BarChart3, ready: false },
  { key: "seo", label: "SEO", icon: Search, ready: false },
  { key: "historico", label: "Histórico", icon: History, ready: false },
  { key: "logs", label: "Logs", icon: ScrollText, ready: false },
];

export interface ObraSavePatch { title?: string | null; description?: string | null; coverUrl?: string | null }

interface Props {
  item: any;
  override: any;
  type: "hq" | "gibi";
  onBack: () => void;
  onSave: (patch: ObraSavePatch) => Promise<void>;
  onToggleHide: () => Promise<void>;
  onRestore: () => Promise<void>;
}

function Soon({ title, note }: { title: string; note: string }) {
  return (
    <div className="border-4 border-dashed border-black/40 p-8 text-center">
      <Construction className="w-10 h-10 mx-auto text-black/30 mb-2" />
      <p className="font-display text-2xl text-black/40">{title.toUpperCase()}</p>
      <p className="font-sans font-bold text-gray-400 text-sm mt-1 max-w-md mx-auto">{note}</p>
    </div>
  );
}

function QualityCard({ q }: { q: QualityResult }) {
  return (
    <div className="border-4 border-black p-4 bg-white">
      <div className="flex items-center gap-3 mb-3">
        <div className="font-display text-3xl leading-none px-3 py-1.5 border-4 border-black text-white" style={{ background: qualityColor(q.score) }}>{q.score}%</div>
        <div>
          <p className="font-display text-lg leading-none">Qualidade</p>
          <p className="font-sans font-bold text-gray-500 text-xs">{q.checks.filter(c => c.ok).length}/{q.checks.length} itens completos</p>
        </div>
      </div>
      <div className="space-y-1">
        {q.checks.map(c => (
          <div key={c.label} className="flex items-center gap-2 text-sm">
            <span className={`inline-block w-4 text-center font-bold ${c.ok ? "text-green-600" : "text-red-500"}`}>{c.ok ? "✔" : "✘"}</span>
            <span className="font-sans font-bold text-black">{c.label}</span>
            {!c.ok && <span className="font-sans text-gray-400 text-xs">— {c.hint}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CatalogObraPage({ item, override, type, onBack, onSave, onToggleHide, onRestore }: Props) {
  const [tab, setTab] = useState<ObraTab>("info");
  const [saving, setSaving] = useState(false);

  const curTitle = override?.title ?? item?.title ?? "";
  const curDesc = override?.description ?? item?.description ?? "";
  const curCover = override?.coverUrl ?? item?.coverUrl ?? "";

  const [title, setTitle] = useState(curTitle);
  const [desc, setDesc] = useState(curDesc);
  const [cover, setCover] = useState(curCover);

  const q = scoreItem(item, override);
  const sources: any[] = item?.sources || [];
  const slug = String(item?.id || "").replace(/^drive-/, "");
  const hidden = !!override?.hidden;

  const doSave = async (patch: ObraSavePatch) => {
    setSaving(true);
    try { await onSave(patch); } finally { setSaving(false); }
  };

  const inp = "w-full border-4 border-black px-3 py-2 font-sans font-bold text-black bg-white focus:outline-none focus:ring-4 focus:ring-secondary";
  const lbl = "block font-display text-sm mb-1 uppercase text-black/70";
  const saveBtn = "bg-primary text-white border-4 border-black px-4 py-2 font-display comic-shadow-sm hover:translate-y-[-2px] transition-transform flex items-center gap-2 disabled:opacity-50";

  return (
    <div className="space-y-4">
      {/* Back + header */}
      <button onClick={onBack} className="flex items-center gap-2 font-display text-base border-4 border-black px-3 py-1.5 bg-white hover:bg-muted">
        <ArrowLeft className="w-4 h-4" strokeWidth={3} /> Voltar ao catálogo
      </button>

      <div className="bg-white border-4 border-black comic-shadow p-4 flex gap-4 items-start">
        <div className="w-20 h-28 border-2 border-black shrink-0 bg-muted overflow-hidden">
          {cover ? <SafeImage src={cover} alt={curTitle} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-secondary/30" />}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-3xl text-black leading-tight break-words">{curTitle || "(sem título)"}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-2xs font-bold uppercase bg-muted border-2 border-black px-2 py-0.5">{type === "gibi" ? "Gibi" : "HQ"}</span>
            <span className="text-2xs font-bold uppercase border-2 border-black px-2 py-0.5 text-white" style={{ background: qualityColor(q.score) }}>{q.score}%</span>
            {hidden && <span className="text-2xs font-bold uppercase bg-red-200 border-2 border-black px-2 py-0.5">Escondida</span>}
            {override && !hidden && <span className="text-2xs font-bold uppercase bg-secondary border-2 border-black px-2 py-0.5">Editada</span>}
            <span className="text-2xs font-bold text-gray-400">{sources.length} fonte(s)</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button onClick={onToggleHide} className="flex items-center gap-1.5 border-4 border-black px-3 py-1.5 font-display text-sm hover:bg-secondary">
            {hidden ? <><Eye className="w-4 h-4" /> Mostrar</> : <><EyeOff className="w-4 h-4" /> Esconder</>}
          </button>
          {override && (
            <button onClick={onRestore} className="flex items-center gap-1.5 border-4 border-black px-3 py-1.5 font-display text-sm hover:bg-primary hover:text-white">
              <RotateCcw className="w-4 h-4" /> Restaurar
            </button>
          )}
        </div>
      </div>

      {/* Two-column: submenu + content */}
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
        {/* Submenu */}
        <nav className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible">
          {TABS.map(({ key, label, icon: Icon, ready }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-3 py-2 border-4 font-display text-base whitespace-nowrap transition-all ${
                tab === key ? "bg-secondary border-black text-black" : "bg-white border-transparent text-gray-500 hover:border-black hover:text-black"
              }`}>
              <Icon className="w-4 h-4 shrink-0" strokeWidth={2.5} />
              <span>{label}</span>
              {!ready && <span className="text-2xs bg-muted border border-black px-1 ml-auto">soon</span>}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="min-w-0 space-y-4">
          {tab === "info" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border-4 border-black p-4 space-y-3">
                <div>
                  <label className={lbl}>Título</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} className={inp} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className={lbl}>Tipo</span><p className="font-sans font-bold">{type === "gibi" ? "Gibi" : "HQ"}</p></div>
                  <div><span className={lbl}>Slug</span><p className="font-mono text-xs break-all">{slug}</p></div>
                </div>
                <div>
                  <label className={lbl}>Fontes (providers)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {sources.map((s, i) => <span key={i} className="text-2xs font-bold uppercase bg-muted border-2 border-black px-2 py-0.5">{s.providerId}</span>)}
                  </div>
                </div>
                <button disabled={saving || title === curTitle} onClick={() => doSave({ title: title.trim() || null })} className={saveBtn}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar título
                </button>
                <p className="text-2xs font-bold text-gray-400">Tipo, tags, +18, provider principal e banner precisam de novos campos no banco — chegam na próxima fase.</p>
              </div>
              <QualityCard q={q} />
            </div>
          )}

          {tab === "sinopse" && (
            <div className="bg-white border-4 border-black p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className={lbl}>Sinopse</label>
                <span className="text-2xs font-bold text-gray-400">{desc.length} caracteres</span>
              </div>
              <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={8} className={inp} />
              {desc && (
                <div className="border-4 border-dashed border-black/30 p-3">
                  <p className="text-2xs font-bold uppercase text-gray-400 mb-1">Preview</p>
                  <p className="font-sans text-sm text-gray-800 whitespace-pre-wrap">{desc}</p>
                </div>
              )}
              <div className="flex gap-2">
                <button disabled={saving || desc === curDesc} onClick={() => doSave({ description: desc.trim() || null })} className={saveBtn}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar sinopse
                </button>
                <button disabled title="Em breve" className="border-4 border-black px-4 py-2 font-display flex items-center gap-2 opacity-50">
                  <Sparkles className="w-4 h-4" /> Gerar com IA
                </button>
              </div>
            </div>
          )}

          {tab === "capas" && (
            <div className="grid grid-cols-1 lg:grid-cols-[160px_1fr] gap-4">
              <div className="bg-white border-4 border-black p-2">
                <div className="aspect-[2/3] border-2 border-black bg-muted overflow-hidden">
                  {cover ? <SafeImage src={cover} alt={curTitle} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-secondary/30" />}
                </div>
                <p className="text-2xs font-bold uppercase text-center text-gray-400 mt-1">Capa atual</p>
              </div>
              <div className="bg-white border-4 border-black p-4 space-y-3">
                <div>
                  <label className={lbl}>URL da capa</label>
                  <input value={cover} onChange={e => setCover(e.target.value)} type="url" placeholder="https://…" className={inp} />
                </div>
                <div className="flex gap-2">
                  <button disabled={saving || cover === curCover} onClick={() => doSave({ coverUrl: cover.trim() || null })} className={saveBtn}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar capa
                  </button>
                  <button disabled title="Em breve" className="border-4 border-black px-4 py-2 font-display flex items-center gap-2 opacity-50">
                    <Search className="w-4 h-4" /> Buscar automaticamente
                  </button>
                </div>
                <p className="text-2xs font-bold text-gray-400">Upload, recorte e banner (desktop/mobile) chegam com o storage dedicado.</p>
              </div>
            </div>
          )}

          {tab === "capitulos" && <Soon title="Capítulos" note="Lista de capítulos por provider (páginas, status, reimportar). Depende de puxar os capítulos ao vivo de cada fonte." />}
          {tab === "providers" && <Soon title="Providers da obra" note="Quais fontes servem esta obra, com health (busca/detalhes/capítulos/páginas) e tempo médio. Depende do módulo de monitoramento de providers." />}
          {tab === "stats" && <Soon title="Estatísticas" note="Leituras, favoritos, tempo médio, conclusão e abandono — depende da telemetria de leitura." />}
          {tab === "seo" && <Soon title="SEO" note="Título alternativo, slug, meta descrição e Open Graph. Depende de campos novos no banco." />}
          {tab === "historico" && <Soon title="Histórico" note="Auditoria de alterações (quem mudou o quê, quando) com restaurar versão — depende do log de auditoria." />}
          {tab === "logs" && <Soon title="Logs" note="Eventos técnicos desta obra (importação, sincronização, erros de provider)." />}
        </div>
      </div>
    </div>
  );
}
