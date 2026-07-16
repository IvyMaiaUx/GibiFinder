import { useState } from "react";
import { Link } from "wouter";
import { AlertCircle, CheckCircle2, Loader2, SearchCode, ShieldAlert, XCircle } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const ADMIN_STORAGE_KEY = "gibi_admin_key";

interface InspectResult {
  url: string;
  origin: string;
  status: number;
  ok: boolean;
  contentType: string;
  server: string;
  cloudflare: boolean;
  suggestedEngine: string;
  integrationScore: number;
  verdict?: "readable_provider" | "needs_image_proxy" | "external_reader_links" | "needs_chapter_test" | "catalog_or_external_only" | "manual_or_blocked";
  canReadInsideGibiFinder?: boolean;
  wordpress: {
    detected: boolean;
    restAvailable: boolean;
    postsAvailable: boolean;
    name?: string;
    description?: string;
    namespaces: string[];
    error?: string | null;
  };
  images: {
    totalFound: number;
    uniqueFound: number;
    usefulFound?: number;
    accessibleInSample: number;
    directInSample?: number;
    refererOnlyInSample?: number;
    needsProxy?: boolean;
    sample: Array<{
      url: string;
      selector: string;
      ok: boolean;
      status: number;
      contentType: string;
      accessMode?: "direct" | "referer";
      error?: string;
    }>;
  };
  readingEvidence?: {
    score: number;
    usefulImages: number;
    sequentialImages: number;
    readingSelectors: string[];
    chapterLinks: number;
    likelyReadingImages: number;
  };
  externalReaderLinks?: {
    total: number;
    sample: Array<{ url: string; label: string; kind: string }>;
  };
  selectorCandidates: Array<{ selector: string; count: number }>;
}

const VERDICT_COPY: Record<string, { title: string; description: string; tone: string }> = {
  readable_provider: {
    title: "Dá para ler no Gibi Finder",
    description: "O site mostrou estrutura e imagens acessiveis. Vale criar ou ajustar um provider.",
    tone: "bg-green-100 text-green-900"
  },
  needs_image_proxy: {
    title: "Precisa proxy de imagem",
    description: "As imagens existem, mas dependem de Referer/hotlink. O provider precisa servir as imagens via backend ou proxy.",
    tone: "bg-cyan-100 text-cyan-950"
  },
  external_reader_links: {
    title: "Leitura por link externo",
    description: "A pagina lista links de leitura/download fora do site. Pode virar catalogo, mas nao leitor interno sem tratar a fonte externa.",
    tone: "bg-blue-100 text-blue-950"
  },
  needs_chapter_test: {
    title: "Teste uma pagina de capitulo",
    description: "A home/catalogo tem sinais uteis, mas ainda nao provou o fluxo HQ -> capitulos -> paginas de leitura.",
    tone: "bg-amber-100 text-amber-950"
  },
  catalog_or_external_only: {
    title: "Provavelmente só catálogo/link externo",
    description: "A página abre, mas não mostrou imagens de leitura acessiveis para montar leitor interno.",
    tone: "bg-amber-100 text-amber-950"
  },
  manual_or_blocked: {
    title: "Precisa investigação manual",
    description: "Pode ter bloqueio, fluxo dinâmico, login ou uma estrutura que o inspector ainda não reconhece.",
    tone: "bg-red-100 text-red-900"
  }
};

const ENGINE_COPY: Record<string, string> = {
  "wordpress-comic": "Engine ja usada para posts WordPress com paginas de leitura separadas.",
  madara: "Engine ja usada para temas Madara/WP Manga.",
  "generic-html": "Fallback por seletores HTML; costuma precisar de ajuste manual.",
  "comicextra-like": "Familia parecida com ComicExtra; boa candidata para parser reutilizavel.",
  "readcomics-like": "Familia ReadAllComics/ReadComicOnline; normalmente exige parser proprio.",
  comicfury: "Hospedagem de webcomics; boa para catalogo/episodios se as imagens forem diretas.",
  comicbookplus: "Arquivo publico de HQs; pode exigir fluxo especifico para paginas/downloads.",
  comiccms: "Engine comum de leitor/catalogo; boa candidata para provider por configuracao.",
  foolslide: "Engine de leitor antiga/popular; costuma renderizar capitulos e paginas de forma previsivel.",
  genkan: "Engine/API moderna de manga; geralmente vale procurar endpoints JSON.",
  "mangakakalot-like": "Familia com catalogo e imagens protegidas por Referer; pode precisar de proxy.",
  "mangareader-like": "Familia moderna de manga reader; pode exigir parser de capitulos e imagens.",
  manual: "Sem engine clara; precisa investigacao manual."
};

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded border-2 border-black px-2.5 py-1 font-sans text-xs font-extrabold uppercase",
      ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
    )}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

interface ProviderInspectorPanelProps {
  initialAdminKey?: string;
  showBackLink?: boolean;
}

export function ProviderInspectorPanel({ initialAdminKey, showBackLink = true }: ProviderInspectorPanelProps) {
  const [url, setUrl] = useState("https://jondomingues.com/");
  const [adminKey, setAdminKey] = useState(initialAdminKey ?? (localStorage.getItem(ADMIN_STORAGE_KEY) || ""));
  const [result, setResult] = useState<InspectResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const usesAdminKeyFromParent = initialAdminKey !== undefined;

  const inspect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isLocalhost) {
      setError("O Provider Inspector fica disponivel apenas no localhost.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    if (!usesAdminKeyFromParent) {
      localStorage.setItem(ADMIN_STORAGE_KEY, adminKey);
    }

    try {
      const res = await fetch(`${BASE}/api/providers/inspect?url=${encodeURIComponent(url)}`, {
        headers: { "x-admin-key": adminKey }
      });
      const text = await res.text();
      let data: any = null;
      if (text.trim()) {
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`A API respondeu ${res.status}, mas nao retornou JSON valido. Confira se a API local esta rodando na porta 8080.`);
        }
      }
      if (!res.ok) throw new Error(data?.message || `Falha ao inspecionar URL (HTTP ${res.status})`);
      if (!data) throw new Error("A API respondeu sem conteudo. Tente novamente ou confira o log local.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="border-4 border-black bg-white p-6 comic-shadow">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-display text-sm uppercase tracking-wide text-primary">Ferramenta interna</p>
              <h1 className="font-display text-4xl uppercase text-black">Provider Inspector</h1>
              <p className="mt-2 max-w-2xl font-sans text-sm font-bold text-gray-600">
                Cole uma URL e veja se ela parece integravel: WordPress, API REST, bloqueios, seletores candidatos e imagens acessiveis.
              </p>
            </div>
            {showBackLink && (
              <Link href="/provedores" className="font-display text-sm uppercase text-primary underline">
                Voltar aos provedores
              </Link>
            )}
          </div>

          <form onSubmit={inspect} className={cn(
            "mt-6 grid gap-3",
            usesAdminKeyFromParent ? "md:grid-cols-[1fr_auto]" : "md:grid-cols-[1fr_220px_auto]"
          )}>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://site.com/post-ou-home"
              className="border-4 border-black bg-white px-4 py-3 font-sans font-bold outline-none focus:bg-yellow-50"
            />
            {!usesAdminKeyFromParent && (
              <input
                value={adminKey}
                onChange={(event) => setAdminKey(event.target.value)}
                placeholder="Chave admin"
                type="password"
                className="border-4 border-black bg-white px-4 py-3 font-sans font-bold outline-none focus:bg-yellow-50"
              />
            )}
            <button
              type="submit"
              disabled={loading || !isLocalhost}
              className="inline-flex items-center justify-center gap-2 border-4 border-black bg-primary px-5 py-3 font-display text-sm uppercase text-white comic-shadow transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCode className="h-4 w-4" />}
              Inspecionar
            </button>
          </form>
          {!isLocalhost && (
            <div className="mt-4 border-4 border-black bg-amber-50 p-3 font-sans text-sm font-extrabold text-black">
              Esta ferramenta consulta sites externos pelo servidor e fica ativa apenas em ambiente local.
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-3 border-4 border-red-700 bg-red-50 p-4 font-sans font-bold text-red-800">
            <AlertCircle className="h-5 w-5" />
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="border-4 border-black bg-white p-4">
                <p className="font-display text-xs uppercase text-gray-500">Score</p>
                <p className="font-display text-4xl text-black">{result.integrationScore}/5</p>
              </div>
              <div className="border-4 border-black bg-white p-4 md:col-span-2">
                <p className="font-display text-xs uppercase text-gray-500">Engine sugerida</p>
                <p className="font-display text-2xl uppercase text-black">{result.suggestedEngine}</p>
                {ENGINE_COPY[result.suggestedEngine] && (
                  <p className="mt-1 font-sans text-xs font-bold text-gray-500">
                    {ENGINE_COPY[result.suggestedEngine]}
                  </p>
                )}
              </div>
              <div className="border-4 border-black bg-white p-4 md:col-span-2">
                <p className="font-display text-xs uppercase text-gray-500">Origem</p>
                <p className="truncate font-sans text-sm font-extrabold text-black">{result.origin}</p>
                <p className="mt-1 font-sans text-xs font-bold text-gray-500">HTTP {result.status} - {result.server || "server desconhecido"}</p>
              </div>
            </div>

            {result.verdict && (
              <div className={cn("border-4 border-black p-4", VERDICT_COPY[result.verdict]?.tone || "bg-gray-100 text-black")}>
                <h2 className="font-display text-2xl uppercase">
                  {VERDICT_COPY[result.verdict]?.title || "Veredito"}
                </h2>
                <p className="mt-1 font-sans text-sm font-extrabold">
                  {VERDICT_COPY[result.verdict]?.description || "Resultado calculado pelo inspector."}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <StatusBadge ok={result.ok} label="Pagina acessivel" />
              <StatusBadge ok={!result.cloudflare} label={result.cloudflare ? "Cloudflare detectado" : "Sem Cloudflare forte"} />
              <StatusBadge ok={result.wordpress.detected} label="WordPress detectado" />
              <StatusBadge ok={result.wordpress.restAvailable} label="REST API" />
              <StatusBadge ok={result.wordpress.postsAvailable} label="Posts API" />
              <StatusBadge ok={result.images.accessibleInSample > 0} label={result.images.needsProxy ? "Imagens com referer" : "Imagens acessiveis"} />
            </div>

            {result.readingEvidence && (
              <div className="border-4 border-black bg-white p-5">
                <h2 className="font-display text-2xl uppercase text-black">Evidencia de leitura</h2>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
                  <div className="border-2 border-black p-2">
                    <p className="font-display text-2xl">{result.readingEvidence.score}/6</p>
                    <p className="font-sans text-2xs font-extrabold uppercase text-gray-500">Score</p>
                  </div>
                  <div className="border-2 border-black p-2">
                    <p className="font-display text-2xl">{result.readingEvidence.usefulImages}</p>
                    <p className="font-sans text-2xs font-extrabold uppercase text-gray-500">Uteis</p>
                  </div>
                  <div className="border-2 border-black p-2">
                    <p className="font-display text-2xl">{result.readingEvidence.sequentialImages}</p>
                    <p className="font-sans text-2xs font-extrabold uppercase text-gray-500">Sequenciais</p>
                  </div>
                  <div className="border-2 border-black p-2">
                    <p className="font-display text-2xl">{result.readingEvidence.readingSelectors.length}</p>
                    <p className="font-sans text-2xs font-extrabold uppercase text-gray-500">Seletores</p>
                  </div>
                  <div className="border-2 border-black p-2">
                    <p className="font-display text-2xl">{result.readingEvidence.chapterLinks}</p>
                    <p className="font-sans text-2xs font-extrabold uppercase text-gray-500">Links cap.</p>
                  </div>
                  <div className="border-2 border-black p-2">
                    <p className="font-display text-2xl">{result.readingEvidence.likelyReadingImages}</p>
                    <p className="font-sans text-2xs font-extrabold uppercase text-gray-500">Provaveis</p>
                  </div>
                </div>
                <p className="mt-3 font-sans text-xs font-bold text-gray-500">
                  Para provar leitura, procure score alto em uma URL de capitulo/reader. Home com capa/logo costuma ficar baixo.
                </p>
              </div>
            )}

            {result.wordpress.detected && (
              <div className="border-4 border-black bg-white p-5">
                <h2 className="font-display text-2xl uppercase text-black">WordPress</h2>
                <p className="mt-2 font-sans text-sm font-bold text-gray-700">
                  {result.wordpress.name || "Site WordPress"} {result.wordpress.description ? `- ${result.wordpress.description}` : ""}
                </p>
                <p className="mt-2 font-sans text-xs font-bold text-gray-500">
                  Namespaces: {result.wordpress.namespaces.slice(0, 12).join(", ") || "nenhum listado"}
                </p>
              </div>
            )}

            {result.externalReaderLinks && result.externalReaderLinks.total > 0 && (
              <div className="border-4 border-black bg-white p-5">
                <h2 className="font-display text-2xl uppercase text-black">Links externos de leitura</h2>
                <p className="mt-1 font-sans text-sm font-bold text-gray-600">
                  {result.externalReaderLinks.total} link(s) encontrados. Eles podem exigir login/permissao e normalmente precisam de engine propria.
                </p>
                <div className="mt-4 space-y-2">
                  {result.externalReaderLinks.sample.map(link => (
                    <div key={link.url} className="border-2 border-black bg-gray-50 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-xs uppercase text-primary">{link.kind}</span>
                        <span className="font-sans text-2xs font-extrabold uppercase text-gray-500">{link.label}</span>
                      </div>
                      <p className="mt-1 break-all font-sans text-2xs font-bold text-gray-600">{link.url}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="border-4 border-black bg-white p-5">
                <h2 className="font-display text-2xl uppercase text-black">Seletores candidatos</h2>
                <div className="mt-4 space-y-2">
                  {result.selectorCandidates.length === 0 ? (
                    <p className="font-sans text-sm font-bold text-gray-500">Nenhum seletor forte encontrado.</p>
                  ) : result.selectorCandidates.map(item => (
                    <div key={item.selector} className="flex items-center justify-between border-2 border-black bg-gray-50 px-3 py-2">
                      <code className="text-xs font-bold text-black">{item.selector}</code>
                      <span className="font-display text-sm text-primary">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-4 border-black bg-white p-5">
                <h2 className="font-display text-2xl uppercase text-black">Imagens</h2>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
                  <div className="border-2 border-black p-2">
                    <p className="font-display text-2xl">{result.images.totalFound}</p>
                    <p className="font-sans text-2xs font-extrabold uppercase text-gray-500">Encontradas</p>
                  </div>
                  <div className="border-2 border-black p-2">
                    <p className="font-display text-2xl">{result.images.uniqueFound}</p>
                    <p className="font-sans text-2xs font-extrabold uppercase text-gray-500">Unicas</p>
                  </div>
                  <div className="border-2 border-black p-2">
                    <p className="font-display text-2xl">{result.images.usefulFound ?? result.images.uniqueFound}</p>
                    <p className="font-sans text-2xs font-extrabold uppercase text-gray-500">Uteis</p>
                  </div>
                  <div className="border-2 border-black p-2">
                    <p className="font-display text-2xl">{result.images.accessibleInSample}</p>
                    <p className="font-sans text-2xs font-extrabold uppercase text-gray-500">OK amostra</p>
                  </div>
                  <div className="border-2 border-black p-2">
                    <p className="font-display text-2xl">{result.images.directInSample ?? result.images.accessibleInSample}</p>
                    <p className="font-sans text-2xs font-extrabold uppercase text-gray-500">Diretas</p>
                  </div>
                  <div className="border-2 border-black p-2">
                    <p className="font-display text-2xl">{result.images.refererOnlyInSample ?? 0}</p>
                    <p className="font-sans text-2xs font-extrabold uppercase text-gray-500">Referer</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {result.images.sample.map(image => (
                    <div key={image.url} className="border-2 border-black bg-gray-50 p-2">
                      <div className="flex items-center gap-2">
                        {image.ok ? <CheckCircle2 className="h-4 w-4 text-green-700" /> : <ShieldAlert className="h-4 w-4 text-red-700" />}
                        <span className="font-display text-xs uppercase">
                          HTTP {image.status || "erro"} - {image.selector}{image.accessMode === "referer" ? " - referer" : ""}
                        </span>
                      </div>
                      <p className="mt-1 break-all font-sans text-2xs font-bold text-gray-600">{image.url}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}

export default function ProviderInspector() {
  return (
    <Layout>
      <ProviderInspectorPanel />
    </Layout>
  );
}
