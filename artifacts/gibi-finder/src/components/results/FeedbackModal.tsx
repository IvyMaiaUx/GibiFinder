import { useState } from "react";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (correction: string) => void;
  isPending: boolean;
}

export function FeedbackModal({ isOpen, onClose, onSubmit, isPending }: FeedbackModalProps) {
  const [correction, setCorrection] = useState("");

  const handleSubmit = () => {
    onSubmit(correction);
    setCorrection("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="comic-border comic-shadow sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl tracking-wider">Qual seria o gibi correto?</DialogTitle>
          <DialogDescription className="font-sans font-bold text-gray-600">
            Seu conhecimento ajuda a treinar nosso detetive! Digite os detalhes corretos abaixo.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="Ex: Turma da Mônica Jovem nº 34, Editora Panini..."
            className="w-full min-h-[120px] p-4 comic-border resize-none focus:outline-none focus:ring-4 focus:ring-secondary font-sans font-bold"
            disabled={isPending}
          />
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <button
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 font-display tracking-wider text-xl border-4 border-black bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
          >
            CANCELAR
          </button>
          <button
            onClick={handleSubmit}
            disabled={!correction.trim() || isPending}
            className="px-6 py-2 font-display tracking-wider text-xl border-4 border-black bg-primary text-white hover:bg-primary/90 rounded-lg transition-colors comic-shadow-sm active:translate-y-1 active:translate-x-1 active:shadow-none disabled:opacity-50"
          >
            {isPending ? "ENVIANDO..." : "ENVIAR CORREÇÃO"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
