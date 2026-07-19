import { useState } from "react";
import { Settings2, ArrowLeft, Globe, Check, Boxes, Construction, ChevronRight } from "lucide-react";

// Engine metadata. `reusable` = one engine serves many sites (create a provider by
// pointing a URL at it); the rest are single-site/API providers.
const ENGINES: Record<string, { name: string; reusable: boolean; desc: string }> = {
  madara: { name: "Madara / wp-manga", reusable: true, desc: "Tema WordPress Madara (wp-manga) — cobre a maioria dos scans BR. Um provider por site, mesmos seletores." },
  wordpress: { name: "WordPress Comic", reusable: true, desc: "Sites WordPress de HQ (posts + imagens). Genérico: aponta a URL e funciona." },
  orion: { name: "Orion", reusable: true, desc: "Engine Orion para portais compatíveis." },
  slimeread: { name: "SlimeRead", reusable: true, desc: "Integração com a API do SlimeRead." },
  mangadex: { name: "MangaDex API", reusable: false, desc: "API oficial multilíngue do MangaDex, em tempo real." },
  comicextra: { name: "ComicExtra", reusable: false, desc: "Scraper do ComicExtra (HQ americana em inglês)." },
  mangaplus: { name: "MangaPlus", reusable: false, desc: "MangaPlus (Shueisha) — capítulos oficiais." },
  mangafire: { name: "MangaFire", reusable: false, desc: "Provedor MangaFire." },
  curated: { name: "Curated (Drive / Sites)", reusable: false, desc: "Biblioteca curada: crawl de Google Drive + Google Sites (PDFs). É a fonte dos gibis/HQs do acervo." },
  adult: { name: "Adulto (+18)", reusable: false, desc: "Provedores de conteúdo adulto (8Muses / NHentai)." },
  other: { name: "Outros", reusable: false, desc: "Provedores diversos." },
};

const CORE_METHODS = ["search", "getDetails", "getChapters", "getPages", "getCatalog"];

function engineKeyOf(p: any): string {
  switch (p.engine) {
    case "WordPress Comic": return "wordpress";
    case "Orion": return "orion";
    case "SlimeRead": return "slimeread";
    case "Madara/WordPress": return "madara";
  }
  switch (p.id) {
    case "mangadex": return "mangadex";
    case "comicextra": return "comicextra";
    case "mangaplus": return "mangaplus";
    case "mangafire": return "mangafire";
    case "mugiwaras": return "madara";
    case "biblioteca-br": return "curated";
    case "eightmuses": case "nhentai": return "adult";
    default: return "other";
  }
}

function Soon({ title, note }: { title: string; note: string }) {
  return (
    <div className="border-4 border-dashed border-black/40 p-6 text-center">
      <Construction className="w-8 h-8 mx-auto text-black/30 mb-2" />
      <p className="font-display text-xl text-black/40">{title.toUpperCase()}</p>
      <p className="font-sans font-bold text-gray-400 text-xs mt-1 max-w-md mx-auto">{note}</p>
    </div>
  );
}

export function AdminEngines({ providers, onGoProviders }: { providers: any[]; onGoProviders?: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);

  // Group providers by engine.
  const groups: Record<string, any[]> = {};
  for (const p of providers) {
    const k = engineKeyOf(p);
    (groups[k] ??= []).push(p);
  }
  const engineList = Object.keys(groups)
    .map(k => ({ key: k, meta: ENGINES[k] || ENGINES.other, providers: groups[k] }))
    .sort((a, b) => b.providers.length - a.providers.length);

  // ---- Engine detail ----
  if (selected) {
    const meta = ENGINES[selected] || ENGINES.other;
    const provs = groups[selected] || [];
    const online = provs.filter(p => p.active).length;
    return (
      <div className="space-y-4">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 font-display text-base border-4 border-black px-3 py-1.5 bg-white hover:bg-muted">
          <ArrowLeft className="w-4 h-4" strokeWidth={3} /> Voltar às engines
        </button>

        <div className="bg-white border-4 border-black comic-shadow p-4">
          <div className="flex items-center gap-3">
            <div className="bg-secondary border-4 border-black p-2"><Settings2 className="w-6 h-6" strokeWidth={2.5} /></div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-3xl text-black leading-none">{meta.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {meta.reusable && <span className="text-2xs font-bold uppercase bg-secondary border-2 border-black px-2 py-0.5">Reutilizável</span>}
                <span className="text-2xs font-bold uppercase bg-muted border-2 border-black px-2 py-0.5">{provs.length} provider(s)</span>
                <span className="text-2xs font-bold uppercase border-2 border-black px-2 py-0.5 bg-white">{online} on · {provs.length - online} off</span>
              </div>
            </div>
          </div>
          <p className="font-sans font-bold text-gray-600 text-sm mt-3">{meta.desc}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Providers usando esta engine */}
          <div className="bg-white border-4 border-black p-4">
            <h3 className="font-display text-lg mb-2 flex items-center gap-2"><Globe className="w-4 h-4" /> Providers usando</h3>
            <div className="space-y-1.5">
              {provs.map(p => (
                <button key={p.id} onClick={onGoProviders}
                  className="w-full flex items-center gap-2 border-2 border-black px-2 py-1.5 hover:bg-secondary text-left">
                  <span className={`w-2.5 h-2.5 rounded-full border border-black shrink-0 ${p.active ? "bg-green-500" : "bg-gray-400"}`} />
                  <span className="font-sans font-bold text-sm flex-1 truncate">{p.name}</span>
                  <span className="text-2xs font-bold text-gray-400 uppercase">{p.language}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              ))}
            </div>
          </div>

          {/* Métodos implementados */}
          <div className="bg-white border-4 border-black p-4">
            <h3 className="font-display text-lg mb-2 flex items-center gap-2"><Boxes className="w-4 h-4" /> Parser (métodos)</h3>
            <div className="space-y-1">
              {CORE_METHODS.map(m => (
                <div key={m} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-600 shrink-0" strokeWidth={3} />
                  <span className="font-mono text-xs">{m}()</span>
                </div>
              ))}
            </div>
            <p className="text-2xs font-bold text-gray-400 mt-2">Todos os providers implementam o contrato base do Provider.</p>
          </div>
        </div>

        <Soon title="Seletores · Helpers · Compatibilidade · Logs · Testes" note="Introspecção de seletores/parser, testes em lote por engine e logs por site dependem de instrumentação do runtime — próxima fase." />
      </div>
    );
  }

  // ---- Dashboard ----
  const reusableCount = engineList.filter(e => e.meta.reusable).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <span className="border-4 border-black bg-secondary px-3 py-1.5 font-display text-sm">ENGINES {engineList.length}</span>
        <span className="border-4 border-black bg-white px-3 py-1.5 font-display text-sm">REUTILIZÁVEIS {reusableCount}</span>
        <span className="border-4 border-black bg-white px-3 py-1.5 font-display text-sm">PROVIDERS {providers.length}</span>
      </div>

      {providers.length === 0 ? (
        <p className="text-center text-gray-400 py-12 font-display">Carregando providers…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {engineList.map(({ key, meta, providers: provs }) => {
            const online = provs.filter(p => p.active).length;
            return (
              <button key={key} onClick={() => setSelected(key)}
                className="text-left bg-white border-4 border-black comic-shadow-sm p-4 hover:translate-y-[-3px] transition-transform">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display text-lg leading-tight">{meta.name}</span>
                  {meta.reusable && <span className="text-2xs font-bold uppercase bg-secondary border-2 border-black px-1.5">reuso</span>}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-display text-3xl">{provs.length}</span>
                  <span className="text-xs font-bold text-gray-500 uppercase">provider(s)<br />{online} on · {provs.length - online} off</span>
                </div>
                <p className="font-sans font-bold text-gray-500 text-2xs line-clamp-2">{meta.desc}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
