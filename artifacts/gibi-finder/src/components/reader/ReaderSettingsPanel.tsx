import { useState } from "react";
import { X, Check, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReaderSettings, type ReaderSettings, type ReadingMode } from "./useReaderSettings";

interface ReaderSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  workId?: string;
  workTitle?: string;
  /** Reading mode is owned by the reader (also drives resume); panel just reflects it. */
  readingMode: "scroll" | "page";
  onSetReadingMode: (mode: "scroll" | "page") => void;
}

/* ---- tiny presentational controls (reader-dark themed) ---- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-4 border-b border-white/10">
      <h4 className="font-display text-2xs uppercase tracking-widest text-white/40 mb-3">{title}</h4>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, children, soon }: { label: string; children: React.ReactNode; soon?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", soon && "opacity-40")}>
      <span className="font-sans text-sm text-white/80 flex items-center gap-1.5">
        {label}
        {soon && <span className="text-3xs uppercase bg-white/10 text-white/60 px-1.5 py-0.5 rounded">em breve</span>}
      </span>
      {children}
    </div>
  );
}

function Segmented<T extends string | number>({
  value, options, onChange, disabled,
}: { value: T; options: { label: string; value: T; disabled?: boolean }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-white/15 bg-black/40 shrink-0">
      {options.map(opt => (
        <button
          key={String(opt.value)}
          disabled={disabled || opt.disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-2.5 py-1.5 font-sans font-bold text-2xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
            value === opt.value ? "bg-primary text-white" : "text-white/70 hover:bg-white/10",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 disabled:opacity-30",
        on ? "bg-primary" : "bg-white/15",
      )}
    >
      <span className={cn("block w-5 h-5 rounded-full bg-white transition-transform", on && "translate-x-5")} />
    </button>
  );
}

export function ReaderSettingsPanel({
  open, onClose, workId, workTitle, readingMode, onSetReadingMode,
}: ReaderSettingsPanelProps) {
  const { settings, update, clearWork, hasWorkOverride } = useReaderSettings(workId);
  // Which layer edits target: global defaults or just this work.
  const [scope, setScope] = useState<"global" | "work">(hasWorkOverride ? "work" : "global");
  const set = <K extends keyof ReaderSettings>(key: K, val: ReaderSettings[K]) =>
    update({ [key]: val } as Partial<ReaderSettings>, workId ? scope : "global");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex justify-end" role="dialog" aria-label="Configurações do leitor">
      <div className="absolute inset-0 bg-black/60 animate-in fade-in duration-150" onClick={onClose} />
      <div className="relative w-full max-w-sm h-full bg-zinc-950 border-l-2 border-white/10 shadow-2xl overflow-y-auto overscroll-contain animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="font-display text-lg text-white uppercase tracking-wide">Configurações</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white p-1" aria-label="Fechar">
            <X className="w-5 h-5" strokeWidth={3} />
          </button>
        </div>

        <div className="px-5 pb-10">
          {/* Scope selector (only when a work is open) */}
          {workId && (
            <div className="py-4 border-b border-white/10">
              <Segmented
                value={scope}
                onChange={(v) => setScope(v)}
                options={[{ label: "Padrão global", value: "global" }, { label: "Só nesta obra", value: "work" }]}
              />
              {scope === "work" && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-2xs text-white/40 font-sans truncate">
                    Ajustes só para <span className="text-white/70">{workTitle || "esta obra"}</span>.
                  </p>
                  {hasWorkOverride && (
                    <button onClick={clearWork} className="text-2xs text-white/60 hover:text-white flex items-center gap-1 shrink-0">
                      <RotateCcw className="w-3 h-3" /> restaurar
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <Section title="Leitura">
            <Row label="Modo">
              <Segmented<ReadingMode>
                value={readingMode}
                onChange={(v) => { if (v === "scroll" || v === "page") onSetReadingMode(v); }}
                options={[
                  { label: "Scroll", value: "scroll" },
                  { label: "Página", value: "page" },
                  { label: "Webtoon", value: "webtoon", disabled: true },
                ]}
              />
            </Row>
            <Row label="Página dupla">
              <Segmented
                value={settings.doublePage}
                onChange={(v) => set("doublePage", v)}
                disabled={readingMode !== "page"}
                options={[
                  { label: "Nunca", value: "never" },
                  { label: "Auto", value: "auto" },
                  { label: "Sempre", value: "always" },
                ]}
              />
            </Row>
            <Row label="Dividir spread">
              <Segmented
                value={settings.splitMode}
                onChange={(v) => set("splitMode", v)}
                options={[
                  { label: "Off", value: "off" },
                  { label: "Manual", value: "manual" },
                ]}
              />
            </Row>
            <Row label="Direção">
              <Segmented
                value={settings.direction}
                onChange={(v) => set("direction", v)}
                options={[{ label: "→ LTR", value: "ltr" }, { label: "Mangá ←", value: "rtl" }]}
              />
            </Row>
            <Row label="Ajuste">
              <Segmented
                value={settings.fitMode}
                onChange={(v) => set("fitMode", v)}
                options={[
                  { label: "Largura", value: "width" },
                  { label: "Altura", value: "height" },
                  { label: "Inteira", value: "whole" },
                  { label: "Auto", value: "auto" },
                ]}
              />
            </Row>
          </Section>

          <Section title="Zoom">
            <Row label="Lembrar último zoom">
              <Toggle on={settings.rememberZoom} onChange={(v) => set("rememberZoom", v)} />
            </Row>
            <Row label="Zoom máximo">
              <Segmented
                value={settings.maxZoom}
                onChange={(v) => set("maxZoom", v)}
                options={[{ label: "2x", value: 2 }, { label: "3x", value: 3 }, { label: "4x", value: 4 }, { label: "5x", value: 5 }]}
              />
            </Row>
            <Row label="Zoom por duplo-toque">
              <Toggle on={settings.doubleTapZoom} onChange={(v) => set("doubleTapZoom", v)} />
            </Row>
          </Section>

          <Section title="Interface">
            <Row label="Auto-ocultar">
              <Segmented
                value={settings.autoHideMs}
                onChange={(v) => set("autoHideMs", v)}
                options={[{ label: "2s", value: 2000 }, { label: "4s", value: 4000 }, { label: "Nunca", value: 0 }]}
              />
            </Row>
            <Row label="Número da página">
              <Toggle on={settings.showPageNumber} onChange={(v) => set("showPageNumber", v)} />
            </Row>
            <Row label="Barra de progresso">
              <Toggle on={settings.showProgress} onChange={(v) => set("showProgress", v)} />
            </Row>
            <Row label="Barra inferior">
              <Toggle on={settings.showBottomBar} onChange={(v) => set("showBottomBar", v)} />
            </Row>
          </Section>

          <Section title="Imersão">
            <Row label="Nível">
              <Segmented
                value={settings.immersion}
                onChange={(v) => set("immersion", v)}
                options={[
                  { label: "Limpa", value: "clean" },
                  { label: "Cinema", value: "cinema" },
                  { label: "Imersão", value: "immersion" },
                ]}
              />
            </Row>
            <Row label="Bloquear menu de contexto">
              <Toggle on={settings.blockContextMenu} onChange={(v) => set("blockContextMenu", v)} />
            </Row>
            <p className="text-3xs text-white/35 font-sans leading-relaxed">
              Atalhos: <b>C</b> cinema · <b>I</b> imersão · <b>F</b> tela cheia · <b>H</b> mostrar/ocultar.
            </p>
          </Section>

          <Section title="Tema">
            <Row label="Tema">
              <Segmented
                value={settings.theme}
                onChange={(v) => set("theme", v)}
                options={[
                  { label: "Claro", value: "light" },
                  { label: "Escuro", value: "dark" },
                  { label: "AMOLED", value: "amoled" },
                  { label: "Custom", value: "custom" },
                ]}
              />
            </Row>
            {settings.theme === "custom" && (
              <>
                <Row label="Cor do fundo">
                  <input type="color" value={settings.customBg} onChange={(e) => set("customBg", e.target.value)}
                    className="w-8 h-8 rounded bg-transparent border border-white/20 cursor-pointer" />
                </Row>
                <Row label="Cor da interface">
                  <input type="color" value={settings.customUi} onChange={(e) => set("customUi", e.target.value)}
                    className="w-8 h-8 rounded bg-transparent border border-white/20 cursor-pointer" />
                </Row>
              </>
            )}
            <Row label="Opacidade das barras">
              <input type="range" min={40} max={100} value={settings.barOpacity}
                onChange={(e) => set("barOpacity", Number(e.target.value))}
                className="w-28 accent-primary cursor-pointer" />
            </Row>
            <Row label="Intensidade das sombras">
              <input type="range" min={0} max={100} value={settings.shadow}
                onChange={(e) => set("shadow", Number(e.target.value))}
                className="w-28 accent-primary cursor-pointer" />
            </Row>
          </Section>

          <Section title="Desempenho">
            <Row label="Pré-carregar páginas">
              <Segmented
                value={settings.preloadAhead}
                onChange={(v) => set("preloadAhead", v)}
                options={[{ label: "3", value: 3 }, { label: "7", value: 7 }, { label: "12", value: 12 }]}
              />
            </Row>
            <Row label="Economia de memória">
              <Toggle on={settings.memorySaver} onChange={(v) => set("memorySaver", v)} />
            </Row>
            <Row label="Qualidade" soon>
              <Segmented
                value={settings.quality}
                onChange={(v) => set("quality", v)}
                disabled
                options={[{ label: "Auto", value: "auto" }, { label: "Alta", value: "high" }, { label: "Original", value: "original" }]}
              />
            </Row>
          </Section>

          <p className="pt-4 text-3xs text-white/30 font-sans flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" /> Modo Webtoon e temas do leitor chegam nas próximas atualizações.
          </p>
        </div>
      </div>
    </div>
  );
}
