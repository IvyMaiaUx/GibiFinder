import { motion } from "framer-motion";
import type { SearchResponse } from "@workspace/api-client-react/src/generated/api.schemas";
import { ComicCard } from "./ComicCard";
import { FeedbackActions } from "./FeedbackActions";

export function ResultView({ results }: { results: SearchResponse }) {
  const { mainResult, relatedResults } = results;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto mt-12 space-y-12"
    >
      {/* Main Result Section */}
      <section>
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-display text-4xl text-black bg-white inline-block px-4 py-2 border-4 border-black comic-shadow-sm transform -rotate-1">
            MISTÉRIO RESOLVIDO!
          </h2>
        </div>
        
        <ComicCard result={mainResult} isMain />
        <FeedbackActions resultId={mainResult.id} />
      </section>

      {/* Related Results Section */}
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
