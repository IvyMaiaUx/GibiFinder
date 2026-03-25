import { motion } from "framer-motion";
import { Sparkles, BookOpen } from "lucide-react";
import type { SearchResponse } from "@workspace/api-client-react/src/generated/api.schemas";
import { ComicCard } from "./ComicCard";
import { FeedbackActions } from "./FeedbackActions";

interface ResultViewProps {
  results: SearchResponse;
  source?: "colecao" | "gemini" | null;
}

export function ResultView({ results, source }: ResultViewProps) {
  const { mainResult, relatedResults } = results;
  const fromGemini = source === "gemini";

  return (
    <motion.div 
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto mt-12 space-y-12"
    >
      {fromGemini && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-secondary border-4 border-black rounded-xl p-4 flex items-start gap-3 comic-shadow-sm"
        >
          <Sparkles className="w-6 h-6 shrink-0 mt-0.5" strokeWidth={2.5} />
          <div>
            <p className="font-display text-lg leading-tight">RESULTADO VIA INTELIGÊNCIA ARTIFICIAL</p>
            <p className="font-sans text-sm font-semibold mt-1 text-gray-800">
              Este HQ ainda não está na nossa coleção — o resultado foi gerado pela IA e pode não ser 100% preciso.
              Encontrou algo errado? Use o botão de feedback abaixo!
            </p>
          </div>
        </motion.div>
      )}

      {!fromGemini && source === "colecao" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-green-100 border-4 border-black rounded-xl p-4 flex items-start gap-3 comic-shadow-sm"
        >
          <BookOpen className="w-6 h-6 shrink-0 mt-0.5" strokeWidth={2.5} />
          <div>
            <p className="font-display text-lg leading-tight">ENCONTRADO NA COLEÇÃO!</p>
            <p className="font-sans text-sm font-semibold mt-1 text-gray-800">
              Este HQ faz parte da nossa coleção verificada.
            </p>
          </div>
        </motion.div>
      )}

      <section>
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-display text-4xl text-black bg-white inline-block px-4 py-2 border-4 border-black comic-shadow-sm transform -rotate-1">
            MISTÉRIO RESOLVIDO!
          </h2>
        </div>
        
        <ComicCard result={mainResult} isMain />
        <FeedbackActions resultId={mainResult.id} />
      </section>

      {relatedResults && relatedResults.length > 0 && (
        <section>
          <h3 className="font-display text-3xl text-black mb-6 flex items-center gap-4 before:content-[''] before:flex-1 before:h-1 before:bg-black after:content-[''] after:flex-1 after:h-1 after:bg-black">
            PISTAS ALTERNATIVAS
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {relatedResults.map((result) => (
              <motion.div 
                key={result.id}
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <ComicCard result={result} />
              </motion.div>
            ))}
          </div>
        </section>
      )}
    </motion.div>
  );
}
