import { useRoute } from "wouter";
import { useGetResult } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/Layout";
import { ComicCard } from "@/components/results/ComicCard";
import { FeedbackActions } from "@/components/results/FeedbackActions";
import { Link2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ResultDetail() {
  const [, params] = useRoute("/gibi/:id");
  const id = params?.id || "";
  const { toast } = useToast();

  const { data, isLoading, error } = useGetResult(id, {
    query: { enabled: !!id }
  });

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Link copiado!",
      description: "Compartilhe este gibi com seus amigos.",
    });
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        {isLoading ? (
          <div className="py-32 text-center">
            <div className="inline-block animate-spin font-display text-6xl text-primary">?</div>
            <p className="font-display text-2xl mt-4">ACESSANDO ARQUIVOS SECRETOS...</p>
          </div>
        ) : error || !data ? (
          <div className="bg-destructive/10 border-4 border-destructive p-12 rounded-xl text-center max-w-lg mx-auto mt-12">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" strokeWidth={2} />
            <h2 className="font-display text-4xl text-destructive mb-2">ARQUIVO NÃO ENCONTRADO</h2>
            <p className="font-sans font-bold text-gray-700">Este gibi parece não existir em nossos registros ou o link é inválido.</p>
          </div>
        ) : (
          <div className="space-y-12">
            <div className="flex justify-between items-center bg-white p-4 border-4 border-black rounded-xl comic-shadow">
              <span className="font-display text-2xl text-gray-600">ARQUIVO #{id.slice(0,8).toUpperCase()}</span>
              <button 
                onClick={handleCopyLink}
                className="flex items-center gap-2 font-sans font-extrabold text-sm uppercase bg-secondary px-4 py-2 border-2 border-black rounded hover:bg-secondary/80 transition-colors"
              >
                <Link2 className="w-4 h-4" strokeWidth={3} />
                COPIAR LINK
              </button>
            </div>

            <ComicCard result={data.result} isMain />
            
            <div className="bg-white p-8 border-4 border-black rounded-xl comic-shadow">
              <h3 className="font-display text-3xl mb-4">O que você acha?</h3>
              <p className="font-sans font-bold text-gray-600 mb-6">Esta identificação foi precisa? Ajude-nos a melhorar nosso detetive avaliando este resultado.</p>
              <FeedbackActions resultId={id} />
            </div>

            {/* Display existing feedback if any (optional based on schema, but good for detail page) */}
            {data.feedback && data.feedback.length > 0 && (
              <div className="mt-12">
                <h3 className="font-display text-3xl mb-6">Histórico de Correções</h3>
                <div className="space-y-4">
                  {data.feedback.map(fb => (
                    <div key={fb.id} className="bg-muted p-4 border-l-4 border-black">
                      <div className="flex items-center gap-2 mb-2">
                        {fb.is_correct ? (
                          <span className="text-green-600 font-bold flex items-center gap-1">👍 Confirmado correto</span>
                        ) : (
                          <span className="text-destructive font-bold flex items-center gap-1">👎 Marcado como incorreto</span>
                        )}
                        <span className="text-gray-400 text-sm font-bold">• {new Date(fb.created_at).toLocaleDateString()}</span>
                      </div>
                      {fb.correction_text && (
                        <p className="font-sans text-gray-800">
                          <span className="font-bold">Sugestão:</span> {fb.correction_text}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
