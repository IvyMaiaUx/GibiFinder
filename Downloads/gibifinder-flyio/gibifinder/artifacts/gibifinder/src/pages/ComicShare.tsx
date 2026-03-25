import React from "react";
import { Layout } from "@/components/Layout";
import { ComicResultCard } from "@/components/ComicResultCard";
import { useGetComic } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { Loader2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function ComicShare() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  
  const { data, isLoading, error } = useGetComic(id, {
    query: {
      enabled: id > 0
    }
  });

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        
        <Link href="/" className="inline-flex items-center gap-2 font-bold text-dark hover:text-red transition-colors bg-white px-4 py-2 border-4 border-dark shadow-[4px_4px_0px_#0a0a0a]">
          <ArrowLeft size={20} strokeWidth={3} /> NOVA BUSCA
        </Link>

        {isLoading && (
          <div className="comic-panel p-12 flex flex-col items-center justify-center bg-white space-y-4">
            <Loader2 className="w-16 h-16 text-red animate-spin" strokeWidth={3} />
            <h2 className="font-display text-3xl">CARREGANDO ARQUIVOS SECRETOS...</h2>
          </div>
        )}

        {error && (
          <div className="comic-panel p-12 text-center bg-red/10 border-red">
            <h2 className="font-display text-5xl text-red mb-2">ERRO 404!</h2>
            <p className="font-bold text-xl">Esse gibi não existe no nosso multiverso ou foi apagado.</p>
          </div>
        )}

        {!isLoading && !error && data && (
          <ComicResultCard comic={data} />
        )}

      </div>
    </Layout>
  );
}
