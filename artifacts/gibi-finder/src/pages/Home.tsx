import { useEffect, useRef } from "react";
import { Layout } from "@/components/layout/Layout";
import { Hero } from "@/components/home/Hero";
import { SearchPanel } from "@/components/home/SearchPanel";
import { ResultView } from "@/components/results/ResultView";
import { useSearchActions } from "@/hooks/use-search-actions";

export default function Home() {
  const { 
    results,
    resultSource,
    isPending, 
    searchByImage, 
    searchByText, 
    searchByCharacter, 
    searchByQuote 
  } = useSearchActions();

  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (results && resultsRef.current) {
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [results]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto relative z-10">
        <Hero />
        <SearchPanel 
          onSearchImage={searchByImage}
          onSearchText={searchByText}
          onSearchCharacter={searchByCharacter}
          onSearchQuote={searchByQuote}
          isPending={isPending}
        />
        
        {results && (
          <div ref={resultsRef} className="scroll-mt-24 mt-8">
            <ResultView results={results} source={resultSource} />
          </div>
        )}
      </div>
    </Layout>
  );
}
