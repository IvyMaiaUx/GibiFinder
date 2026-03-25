import { useState } from "react";
import { 
  useIdentifyComic, 
  useSearchComic, 
  useCharacterSearch, 
  useQuoteSearch 
} from "@workspace/api-client-react";
import type { SearchResponse } from "@workspace/api-client-react/src/generated/api.schemas";
import { fileToBase64 } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { addToLocalHistory } from "@/hooks/use-local-history";

export function useSearchActions() {
  const { toast } = useToast();
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [resultSource, setResultSource] = useState<"colecao" | "gemini" | null>(null);
  
  const identifyMutation = useIdentifyComic();
  const textMutation = useSearchComic();
  const characterMutation = useCharacterSearch();
  const quoteMutation = useQuoteSearch();

  const isPending = 
    identifyMutation.isPending || 
    textMutation.isPending || 
    characterMutation.isPending || 
    quoteMutation.isPending;

  const handleSuccess = (data: SearchResponse & { source?: string; search_type?: string }) => {
    setResults(data);
    setResultSource(data.source === "colecao" ? "colecao" : "gemini");

    if (data.mainResult.encontrado && data.mainResult.id) {
      addToLocalHistory({
        id: data.mainResult.id,
        titulo: data.mainResult.titulo || "",
        revista: data.mainResult.revista || "",
        editora: data.mainResult.editora || "",
        ano: data.mainResult.ano || "",
        images: data.mainResult.images || [],
        search_type: data.mainResult.search_type || "text",
        created_at: new Date().toISOString(),
      });
    }

    if (data.mainResult.encontrado) {
      toast({
        title: "BINGO! Gibi Encontrado!",
        description: `Encontramos: ${data.mainResult.titulo || data.mainResult.revista}`,
        variant: "default",
      });
    } else {
      toast({
        title: "Puxa vida...",
        description: "Não conseguimos identificar este gibi com certeza.",
        variant: "destructive",
      });
    }
  };

  const handleError = (error: any) => {
    toast({
      title: "Erro na busca",
      description: error.message || "Ocorreu um erro ao buscar o gibi. Tente novamente.",
      variant: "destructive",
    });
  };

  const searchByImage = async (files: File[]) => {
    try {
      const base64Images = await Promise.all(files.map(fileToBase64));
      identifyMutation.mutate(
        { data: { images: base64Images } },
        { onSuccess: handleSuccess, onError: handleError }
      );
    } catch (e) {
      handleError(e);
    }
  };

  const searchByText = (query: string) => {
    if (!query.trim()) return;
    textMutation.mutate(
      { data: { query } },
      { onSuccess: handleSuccess, onError: handleError }
    );
  };

  const searchByCharacter = (character: string) => {
    if (!character.trim()) return;
    characterMutation.mutate(
      { data: { character } },
      { onSuccess: handleSuccess, onError: handleError }
    );
  };

  const searchByQuote = (quote: string) => {
    if (!quote.trim()) return;
    quoteMutation.mutate(
      { data: { quote } },
      { onSuccess: handleSuccess, onError: handleError }
    );
  };

  const clearResults = () => { setResults(null); setResultSource(null); };

  return {
    results,
    resultSource,
    isPending,
    searchByImage,
    searchByText,
    searchByCharacter,
    searchByQuote,
    clearResults
  };
}
