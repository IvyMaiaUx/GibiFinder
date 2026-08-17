import { useState } from "react";
import { 
  useIdentifyComic, 
  useSearchComic, 
  useCharacterSearch, 
  useQuoteSearch,
  type SearchResponse
} from "@workspace/api-client-react";
import { fileToBase64 } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { addSearchHistoryItem } from "@/lib/user-history";

export function useSearchActions() {
  const { toast } = useToast();
  const { user } = useAuth();
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
      addSearchHistoryItem({
        id: data.mainResult.id,
        titulo: data.mainResult.titulo || "",
        revista: data.mainResult.revista || "",
        editora: data.mainResult.editora || "",
        ano: data.mainResult.ano || "",
        images: data.mainResult.images || [],
        search_type: data.mainResult.search_type || "text",
        created_at: new Date().toISOString(),
      }, user?.id);
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
    // Prefer the clean message from the backend's JSON error body (e.g. "A
    // cota diária de análise por IA foi atingida...") over ApiError.message,
    // which is prefixed with "HTTP 429 Too Many Requests: " — accurate, but
    // not something to put in front of a user in a toast.
    const description =
      (typeof error?.data?.message === "string" && error.data.message) ||
      error?.message ||
      "Ocorreu um erro ao buscar o gibi. Tente novamente.";
    toast({
      title: "Erro na busca",
      description,
      variant: "destructive",
    });
  };

  const searchByImage = async (files: File[]) => {
    try {
      // `.map(fileToBase64)` handed the callback its extra arguments: the
      // index landed in `maxPx` and the array in `quality`. The first photo
      // therefore got maxPx=0, which makes fileToBase64 scale it to a 0x0
      // canvas -- the identification request went out carrying an empty
      // image. The second got 1px, the third 2px. Wrapping the call keeps the
      // function's own defaults (1280 / 0.78), which is what it always meant.
      const base64Images = await Promise.all(files.map(file => fileToBase64(file)));
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
