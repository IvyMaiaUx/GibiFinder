import { useState } from "react";
import { ThumbsUp, ThumbsDown, Edit3 } from "lucide-react";
import { useSubmitFeedback } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { FeedbackModal } from "./FeedbackModal";

export function FeedbackActions({ resultId }: { resultId: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const { toast } = useToast();
  const feedbackMutation = useSubmitFeedback();

  const handleVote = (isCorrect: boolean) => {
    if (hasVoted) return;
    
    feedbackMutation.mutate(
      { data: { result_id: resultId, is_correct: isCorrect } },
      {
        onSuccess: () => {
          setHasVoted(true);
          toast({
            title: "Obrigado!",
            description: "Seu feedback ajuda a melhorar nossas buscas.",
          });
        }
      }
    );
  };

  const handleCorrection = (correctionText: string) => {
    feedbackMutation.mutate(
      { data: { result_id: resultId, is_correct: false, correction_text: correctionText } },
      {
        onSuccess: () => {
          setHasVoted(true);
          setIsModalOpen(false);
          toast({
            title: "Correção enviada!",
            description: "Nossos detetives vão analisar sua sugestão.",
          });
        }
      }
    );
  };

  if (hasVoted) {
    return (
      <div className="mt-6 p-4 bg-secondary/20 border-4 border-dashed border-secondary rounded-xl text-center">
        <p className="font-display text-xl tracking-wider text-black">Feedback registrado. Valeu!</p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={() => handleVote(true)}
          disabled={feedbackMutation.isPending}
          className="flex-1 min-w-[120px] flex items-center justify-center gap-2 bg-green-500 text-white font-display text-xl py-3 comic-border comic-shadow-sm comic-hover comic-active disabled:opacity-50"
        >
          <ThumbsUp strokeWidth={3} className="w-5 h-5" />
          CORRETO
        </button>
        
        <button
          onClick={() => handleVote(false)}
          disabled={feedbackMutation.isPending}
          className="flex-1 min-w-[120px] flex items-center justify-center gap-2 bg-destructive text-white font-display text-xl py-3 comic-border comic-shadow-sm comic-hover comic-active disabled:opacity-50"
        >
          <ThumbsDown strokeWidth={3} className="w-5 h-5" />
          ERRADO
        </button>
        
        <button
          onClick={() => setIsModalOpen(true)}
          disabled={feedbackMutation.isPending}
          className="flex-1 min-w-[120px] flex items-center justify-center gap-2 bg-white text-black font-display text-xl py-3 comic-border comic-shadow-sm comic-hover comic-active disabled:opacity-50"
        >
          <Edit3 strokeWidth={3} className="w-5 h-5" />
          CORRIGIR
        </button>
      </div>

      <FeedbackModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCorrection}
        isPending={feedbackMutation.isPending}
      />
    </>
  );
}
