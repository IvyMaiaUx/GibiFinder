import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Loader2, AlertCircle, Database, ShieldAlert, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ProviderItem {
  id: string;
  name: string;
  language: string;
  active: boolean;
  isCustom?: boolean;
  engine?: string;
  baseUrl?: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Providers() {
  const { toast } = useToast();
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/providers`);
      if (!res.ok) throw new Error("Erro ao carregar fontes");
      const data = await res.json() as ProviderItem[];
      setProviders(data);
    } catch (err) {
      console.error(err);
      setError("Falha ao se conectar com a API de Provedores.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (providerId: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    
    // Optimistic UI update
    setProviders(prev => prev.map(p => p.id === providerId ? { ...p, active: nextStatus } : p));

    try {
      const res = await fetch(`${BASE}/api/providers/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, active: nextStatus })
      });
      if (!res.ok) throw new Error();
      
      toast({
        title: nextStatus ? "Fonte ativada!" : "Fonte desativada!",
        description: `O provedor ${providerId.toUpperCase()} foi atualizado no agregador.`,
      });
    } catch (err) {
      // Revert UI on failure
      setProviders(prev => prev.map(p => p.id === providerId ? { ...p, active: currentStatus } : p));
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível alterar a ativação do provedor.",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8 select-none">
        
        {/* Banner Title */}
        <div className="bg-primary text-white border-4 border-black p-6 rounded-xl comic-shadow relative overflow-hidden transform -rotate-1">
          <div className="absolute top-0 right-0 w-24 h-24 opacity-10 bg-[radial-gradient(white_1px,transparent_1px)] [background-size:6px_6px] pointer-events-none" />
          <h2 className="font-display text-4xl tracking-wider uppercase drop-shadow-[2px_2px_0_black]">
            Gerenciador de Provedores (Fontes)
          </h2>
          <p className="font-sans font-extrabold text-sm uppercase mt-2 text-white/90">
            Habilite ou desabilite conexões externas. Gibi Finder funciona agregando resultados destas fontes em tempo real.
          </p>
        </div>

        {loading ? (
          <div className="py-24 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <h3 className="font-display text-2xl">CARREGANDO FONTES DO AGREGADOR...</h3>
          </div>
        ) : error ? (
          <div className="bg-destructive/10 border-4 border-destructive p-8 rounded-xl text-center max-w-md mx-auto">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h3 className="font-display text-2xl text-destructive mb-2">ERRO DE CONEXÃO</h3>
            <p className="font-sans font-bold text-gray-700">{error}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {providers.map((p) => {
              const isStub = ["bato", "mangafire", "hqnow"].includes(p.id);
              return (
                <div 
                  key={p.id}
                  className={cn(
                    "bg-white border-4 border-black p-6 rounded-xl flex flex-col justify-between transition-all relative",
                    p.active ? "comic-shadow" : "opacity-75"
                  )}
                >
                  {/* Status Bulb */}
                  <div className="absolute top-4 right-4 flex items-center gap-1.5">
                    <span className={cn(
                      "w-3.5 h-3.5 rounded-full border-2 border-black inline-block",
                      p.active ? "bg-green-500 animate-pulse" : "bg-gray-400"
                    )} />
                    <span className="font-display text-xs text-gray-500 uppercase">
                      {p.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0 pr-16">
                    <h3 className="font-display text-2xl text-black truncate mb-1">
                      {p.name}
                    </h3>
                    <p className="font-sans font-bold text-gray-500 text-xs uppercase mb-3 tracking-wide">
                      Idioma: {p.language === "multi" ? "🌐 Multi-idioma" : p.language === "pt" ? "🇧🇷 Português" : "🇺🇸 Inglês"}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className={cn(
                        "font-display text-2xs px-2 py-0.5 border-2 border-black rounded uppercase",
                        p.isCustom ? "bg-secondary text-black" : "bg-muted text-gray-600"
                      )}>
                        {p.engine || (p.isCustom ? "Madara/WordPress" : "Nativo")}
                      </span>
                      {p.isCustom && (
                        <span className="font-sans font-extrabold text-2xs px-2 py-0.5 border-2 border-black rounded uppercase bg-white text-gray-500">
                          Custom
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 font-semibold font-sans leading-relaxed">
                      {p.id === "mangadex" && "Provedor oficial com milhões de capítulos e traduções geradas por grupos de scanlation."}
                      {p.id === "comicextra" && "Fonte de gibis e HQs da Marvel e DC digitalizadas em inglês de forma direta."}
                      {isStub && `Integração nativa de ${p.name}. Ligue para disponibilizar na busca global.`}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t-2 border-dashed border-gray-200 flex justify-between items-center">
                    <span className="font-sans font-extrabold text-2xs text-gray-400 uppercase">
                      ID: {p.id}
                    </span>
                    
                    {/* Toggle Button */}
                    <button
                      onClick={() => handleToggle(p.id, p.active)}
                      className={cn(
                        "font-display text-sm px-4 py-1.5 border-2 border-black rounded transition-all",
                        p.active 
                          ? "bg-primary text-white hover:bg-red-600" 
                          : "bg-secondary text-black hover:bg-yellow-400"
                      )}
                    >
                      {p.active ? "DESATIVAR" : "ATIVAR"}
                    </button>
                  </div>
                </div>
              );
            })}

          </div>
        )}

        {/* Warning card mimicking Hydra Launcher style */}
        <div className="bg-amber-50 border-4 border-black p-5 rounded-xl flex gap-4 items-start relative overflow-hidden">
          <ShieldAlert className="w-8 h-8 text-black shrink-0 mt-1" />
          <div>
            <h4 className="font-display text-lg text-black uppercase">Isenção de Responsabilidade</h4>
            <p className="font-sans font-bold text-xs text-gray-700 leading-snug mt-1">
              Gibi Finder é um agregador descentralizado. O software apenas lê e unifica APIs externas públicas em tempo real. Nenhum arquivo ou imagem de propriedade intelectual é hospedado, copiado ou distribuído em nossos servidores.
            </p>
          </div>
        </div>

      </div>
    </Layout>
  );
}
