import { Link } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <Layout>
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="bg-white border-4 border-black rounded-xl p-12 comic-shadow">
          <SearchX className="w-24 h-24 mx-auto text-primary mb-6" strokeWidth={2} />
          <h1 className="font-display text-7xl text-black mb-4">404!</h1>
          <h2 className="font-display text-3xl text-gray-600 mb-8">PÁGINA NÃO ENCONTRADA</h2>
          <p className="font-sans font-bold text-xl text-gray-800 mb-8">
            Parece que nosso detetive perdeu a pista. Essa página não existe nos nossos arquivos.
          </p>
          <Link 
            href="/"
            className="inline-block bg-primary text-white font-display text-2xl px-8 py-4 border-4 border-black comic-shadow comic-hover comic-active"
          >
            VOLTAR PARA A INVESTIGAÇÃO
          </Link>
        </div>
      </div>
    </Layout>
  );
}
