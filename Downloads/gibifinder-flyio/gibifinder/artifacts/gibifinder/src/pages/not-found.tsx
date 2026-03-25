import React from "react";
import { Layout } from "@/components/Layout";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <Layout>
      <div className="max-w-2xl mx-auto comic-panel p-12 text-center bg-yellow mt-12 flex flex-col items-center">
        <h1 className="font-display text-8xl text-red drop-shadow-[4px_4px_0px_#0a0a0a] mb-6">BAM! 404!</h1>
        <div className="comic-speech-bubble bg-white inline-block mb-8">
          <p className="font-bold text-2xl text-dark uppercase">Página não encontrada neste universo!</p>
        </div>
        <p className="font-bold text-lg mb-8 text-dark/80">Parece que um vilão apagou essa página da nossa dimensão.</p>
        
        <Link href="/" className="comic-button bg-cyan text-white px-8 py-4 text-2xl w-full sm:w-auto">
          VOLTAR PARA A BASE
        </Link>
      </div>
    </Layout>
  );
}
