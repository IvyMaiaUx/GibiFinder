import { useGetRanking } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/Layout";
import { Trophy, Flame, Search } from "lucide-react";
import { formatComicDate } from "@/lib/utils";

export default function Ranking() {
  const { data, isLoading, error } = useGetRanking();

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-block relative">
            <Trophy className="absolute -top-6 -left-8 w-12 h-12 text-secondary fill-secondary transform -rotate-12" strokeWidth={2} />
            <h1 className="font-display text-5xl md:text-6xl text-black bg-white px-8 py-3 border-4 border-black comic-shadow inline-block">
              TOP GIBIS DA SEMANA
            </h1>
            <Flame className="absolute -bottom-4 -right-6 w-10 h-10 text-primary fill-primary transform rotate-12" strokeWidth={2} />
          </div>
          {data?.week_start && (
            <p className="font-sans font-bold text-xl mt-6 uppercase tracking-widest text-gray-700">
              Semana de {formatComicDate(data.week_start)}
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="py-20 text-center">
            <div className="inline-block animate-spin font-display text-6xl text-secondary">?</div>
            <p className="font-display text-2xl mt-4">APURANDO OS DADOS...</p>
          </div>
        ) : error ? (
          <div className="bg-destructive/10 border-4 border-destructive p-8 rounded-xl text-center">
            <p className="font-display text-2xl text-destructive">Não foi possível carregar o ranking.</p>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="bg-white border-4 border-dashed border-black p-16 rounded-xl text-center">
            <p className="font-display text-3xl text-gray-500">NENHUM DADO NESTA SEMANA</p>
          </div>
        ) : (
          <div className="space-y-6">
            {data.items.map((item, index) => (
              <div 
                key={index}
                className="bg-white border-4 border-black rounded-xl overflow-hidden comic-shadow flex items-center p-4 relative"
              >
                {/* Rank Number */}
                <div className="w-16 md:w-24 shrink-0 flex justify-center">
                  <span className="font-display text-5xl md:text-6xl" style={{
                    color: index === 0 ? '#F4D03F' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : '#E63946',
                    WebkitTextStroke: '2px black',
                    textShadow: '3px 3px 0px black'
                  }}>
                    #{index + 1}
                  </span>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-2xl md:text-3xl leading-tight truncate">
                    {item.titulo || item.revista}
                  </h3>
                  <p className="font-sans font-bold text-gray-500 text-sm md:text-base truncate mb-2">
                    {item.editora}
                  </p>
                  <div className="inline-flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-full border-2 border-primary text-primary font-bold text-sm">
                    <Search className="w-4 h-4" strokeWidth={3} />
                    {item.search_count} BUSCAS
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
