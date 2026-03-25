import { Layout } from "@/components/layout/Layout";
import { Hero } from "@/components/home/Hero";
import { SearchPanel } from "@/components/home/SearchPanel";
import { ResultView } from "@/components/results/ResultView";
import { useSearchActions } from "@/hooks/use-search-actions";

export default function Home() {
  const { 
    results, 
    isPending, 
    searchByImage, 
    searchByText, 
    searchByCharacter, 
    searchByQuote 
  } = useSearchActions();

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
          <div id="results-anchor" className="scroll-mt-24">
            <ResultView results={results} />
          </div>
        )}
      </div>
    </Layout>
  );
}
