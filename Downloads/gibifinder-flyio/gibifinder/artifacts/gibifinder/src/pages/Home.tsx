import React, { useState, useRef } from "react";
import { Layout } from "@/components/Layout";
import { ImageUploader, ImageUploaderRef } from "@/components/ImageUploader";
import { ComicResultCard } from "@/components/ComicResultCard";
import { Camera, Search, Quote, Loader2, AlertCircle, FileSearch } from "lucide-react";
import { cn, fileToBase64 } from "@/lib/utils";
import { useIdentifyComic, useSearchComic, useQuoteSearch, useDescriptionSearch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { ComicResult } from "@workspace/api-client-react/src/generated/api.schemas";

type SearchMode = "image" | "text" | "description" | "quote";

export default function Home() {
  const [mode, setMode] = useState<SearchMode>("image");
  const [textQuery, setTextQuery] = useState("");
  const [descQuery, setDescQuery] = useState("");
  const [quoteQuery, setQuoteQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const uploaderRef = useRef<ImageUploaderRef>(null);
  const { toast } = useToast();

  const identifyMutation = useIdentifyComic();
  const searchMutation = useSearchComic();
  const descriptionMutation = useDescriptionSearch();
  const quoteMutation = useQuoteSearch();

  const isPending =
    identifyMutation.isPending ||
    searchMutation.isPending ||
    descriptionMutation.isPending ||
    quoteMutation.isPending;

  const currentResults: ComicResult[] =
    (mode === "image" && identifyMutation.data?.results) ||
    (mode === "text" && searchMutation.data?.results) ||
    (mode === "description" && descriptionMutation.data?.results) ||
    [];

  const currentError =
    (mode === "image" && identifyMutation.error) ||
    (mode === "text" && searchMutation.error) ||
    (mode === "description" && descriptionMutation.error) ||
    (mode === "quote" && quoteMutation.error);

  const handleFilesChange = (files: File[]) => setSelectedFiles(files);

  const handleImageSubmit = async () => {
    if (selectedFiles.length === 0) {
      toast({ title: "Nenhuma imagem selecionada", description: "Adicione pelo menos uma foto do gibi.", variant: "destructive" });
      return;
    }
    try {
      const processed = await Promise.all(selectedFiles.map(fileToBase64));
      identifyMutation.mutate({ data: { images: processed.map(p => p.base64), mimeTypes: processed.map(p => p.mimeType) } });
    } catch {
      toast({ title: "Erro ao processar imagens", description: "Não foi possível preparar as imagens.", variant: "destructive" });
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textQuery.trim()) return;
    searchMutation.mutate({ data: { query: textQuery } });
  };

  const handleDescriptionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!descQuery.trim()) return;
    descriptionMutation.mutate({ data: { description: descQuery } });
  };

  const handleQuoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteQuery.trim()) return;
    quoteMutation.mutate({ data: { quote: quoteQuery } });
  };

  const handleModeChange = (newMode: SearchMode) => {
    setMode(newMode);
    identifyMutation.reset();
    searchMutation.reset();
    descriptionMutation.reset();
    quoteMutation.reset();
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Hero Section */}
        <div className="flex flex-col md:flex-row items-center gap-8 mb-12">
          <div className="md:w-1/3 flex justify-center">
            <div className="comic-panel-sm w-48 h-48 md:w-64 md:h-64 rounded-full overflow-hidden bg-yellow relative">
              <img src="/images/mascot.png" alt="GibiFinder Detective" className="w-full h-full object-cover scale-110" />
            </div>
          </div>
          <div className="md:w-2/3 text-center md:text-left">
            <div className="comic-speech-bubble inline-block mb-4">
              <h1 className="font-display text-4xl md:text-5xl text-red">QUAL É O GIBI?!</h1>
            </div>
            <p className="font-bold text-xl md:text-2xl text-dark bg-white inline-block p-2 border-4 border-dark shadow-[4px_4px_0px_#0a0a0a] transform rotate-1">
              Descubra qualquer quadrinho a partir de fotos, títulos ou falas!
            </p>
          </div>
        </div>

        {/* Search Panel */}
        <div className="comic-panel overflow-hidden p-0">
          <div className="flex border-b-4 border-dark overflow-x-auto no-scrollbar">
            <button
              onClick={() => handleModeChange("image")}
              className={cn(
                "flex-1 min-w-[110px] py-4 px-3 font-display tracking-widest text-lg transition-colors border-r-4 border-dark flex items-center justify-center gap-2",
                mode === "image" ? "bg-yellow shadow-inner" : "bg-white hover:bg-yellow/30"
              )}
            >
              <Camera size={18} strokeWidth={3} /> IMAGEM
            </button>
            <button
              onClick={() => handleModeChange("text")}
              className={cn(
                "flex-1 min-w-[110px] py-4 px-3 font-display tracking-widest text-lg transition-colors border-r-4 border-dark flex items-center justify-center gap-2",
                mode === "text" ? "bg-cyan shadow-inner text-white" : "bg-white hover:bg-cyan/30"
              )}
            >
              <Search size={18} strokeWidth={3} /> TÍTULO
            </button>
            <button
              onClick={() => handleModeChange("description")}
              className={cn(
                "flex-1 min-w-[110px] py-4 px-3 font-display tracking-widest text-lg transition-colors border-r-4 border-dark flex items-center justify-center gap-2",
                mode === "description" ? "bg-[#8B5CF6] shadow-inner text-white" : "bg-white hover:bg-purple-100"
              )}
            >
              <FileSearch size={18} strokeWidth={3} /> DESCRIÇÃO
            </button>
            <button
              onClick={() => handleModeChange("quote")}
              className={cn(
                "flex-1 min-w-[110px] py-4 px-3 font-display tracking-widest text-lg transition-colors flex items-center justify-center gap-2",
                mode === "quote" ? "bg-red shadow-inner text-white" : "bg-white hover:bg-red/30"
              )}
            >
              <Quote size={18} strokeWidth={3} /> BALÃO
            </button>
          </div>

          <div className="p-6 md:p-8 bg-paper space-y-4">
            {mode === "image" && (
              <>
                <ImageUploader ref={uploaderRef} onFilesChange={handleFilesChange} isLoading={isPending} />
                <button
                  type="button"
                  onClick={handleImageSubmit}
                  disabled={isPending || selectedFiles.length === 0}
                  className="comic-button bg-yellow text-dark py-4 w-full text-2xl mt-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isPending ? <><Loader2 className="inline mr-2 animate-spin" size={24} /> ANALISANDO...</> : <><Search className="inline mr-2" size={24} /> IDENTIFICAR GIBI</>}
                </button>
              </>
            )}

            {mode === "text" && (
              <form onSubmit={handleTextSubmit} className="flex flex-col gap-4">
                <div className="space-y-2">
                  <label className="font-display tracking-wider text-xl text-dark">NOME DO PERSONAGEM OU TÍTULO</label>
                  <input
                    type="text"
                    value={textQuery}
                    onChange={(e) => setTextQuery(e.target.value)}
                    placeholder="Ex: Homem-Aranha formatura, Batman vs Venom..."
                    className="w-full comic-input"
                    disabled={isPending}
                  />
                </div>
                <button type="submit" disabled={isPending || !textQuery.trim()} className="comic-button bg-cyan text-white py-4 w-full md:w-auto md:self-end px-12 disabled:opacity-40 disabled:cursor-not-allowed">
                  {isPending ? <><Loader2 className="inline mr-2 animate-spin" size={24} /> BUSCANDO...</> : <><Search className="inline mr-2" size={24} /> INVESTIGAR</>}
                </button>
              </form>
            )}

            {mode === "description" && (
              <form onSubmit={handleDescriptionSubmit} className="flex flex-col gap-4">
                <div className="space-y-2">
                  <label className="font-display tracking-wider text-xl text-dark">DESCREVA A CENA OU A HISTÓRIA</label>
                  <textarea
                    value={descQuery}
                    onChange={(e) => setDescQuery(e.target.value)}
                    placeholder="Ex: Uma cena em que um homem aranha luta contra um vilão com asas num prédio de Nova York..."
                    className="w-full comic-input min-h-[120px] resize-y"
                    disabled={isPending}
                  />
                </div>
                <button type="submit" disabled={isPending || !descQuery.trim()} className="comic-button bg-[#8B5CF6] text-white py-4 w-full md:w-auto md:self-end px-12 disabled:opacity-40 disabled:cursor-not-allowed">
                  {isPending ? <><Loader2 className="inline mr-2 animate-spin" size={24} /> PROCURANDO...</> : <><FileSearch className="inline mr-2" size={24} /> BUSCAR POR DESCRIÇÃO</>}
                </button>
              </form>
            )}

            {mode === "quote" && (
              <form onSubmit={handleQuoteSubmit} className="flex flex-col gap-4">
                <div className="space-y-2">
                  <label className="font-display tracking-wider text-xl text-dark">TEXTO DO BALÃO DE FALA</label>
                  <textarea
                    value={quoteQuery}
                    onChange={(e) => setQuoteQuery(e.target.value)}
                    placeholder="Ex: Com grandes poderes vêm grandes responsabilidades..."
                    className="w-full comic-input min-h-[120px] resize-y"
                    disabled={isPending}
                  />
                </div>
                <button type="submit" disabled={isPending || !quoteQuery.trim()} className="comic-button bg-red text-white py-4 w-full md:w-auto md:self-end px-12 disabled:opacity-40 disabled:cursor-not-allowed">
                  {isPending ? <><Loader2 className="inline mr-2 animate-spin" size={24} /> PROCURANDO...</> : <><Quote className="inline mr-2" size={24} /> PROCURAR CITAÇÃO</>}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Loading State */}
        {isPending && (
          <div className="comic-panel p-12 flex flex-col items-center justify-center bg-white space-y-6">
            <Loader2 className="w-16 h-16 text-red animate-spin" strokeWidth={3} />
            <h2 className="font-display text-3xl animate-pulse">ANALISANDO OS QUADRINHOS...</h2>
            <p className="font-bold text-lg text-dark/70">Consultando o detetive de gibis...</p>
          </div>
        )}

        {/* Error State */}
        {!isPending && currentError && (
          <div className="comic-panel p-8 bg-red/10 border-red flex flex-col items-center text-center space-y-3">
            <AlertCircle className="w-12 h-12 text-red" strokeWidth={2.5} />
            <h2 className="font-display text-3xl text-red">ALGO DEU ERRADO!</h2>
            <p className="font-bold text-lg text-dark">
              Não foi possível realizar a busca. Verifique sua conexão e tente novamente.
            </p>
          </div>
        )}

        {/* 3 Ranked Results for image/text/description */}
        {!isPending && !currentError && currentResults.length > 0 && mode !== "quote" && (
          <div className="pt-4 space-y-6" id="result">
            <div className="bg-dark text-white comic-panel p-4 text-center">
              <h2 className="font-display text-2xl text-yellow tracking-widest">🔍 {currentResults.length} RESULTADO{currentResults.length > 1 ? "S" : ""} ENCONTRADO{currentResults.length > 1 ? "S" : ""}</h2>
            </div>
            {currentResults.map((result) => (
              <ComicResultCard key={result.id ?? result.rank} comic={result} />
            ))}
          </div>
        )}

        {/* Quote Search Results */}
        {!isPending && !currentError && mode === "quote" && quoteMutation.data && (
          <div className="pt-4 space-y-6">
            <div className="bg-white comic-panel p-4 flex justify-between items-center">
              <h3 className="font-display text-2xl">Encontrados: {quoteMutation.data.total}</h3>
            </div>
            {quoteMutation.data.results.map((result) => (
              <ComicResultCard key={result.id} comic={result} />
            ))}
            {quoteMutation.data.results.length === 0 && (
              <div className="comic-panel p-8 text-center bg-white">
                <h2 className="font-display text-3xl text-dark">NENHUM GIBI ENCONTRADO</h2>
                <p className="font-bold text-dark/60 mt-2">Tente usar outras palavras da fala.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </Layout>
  );
}
