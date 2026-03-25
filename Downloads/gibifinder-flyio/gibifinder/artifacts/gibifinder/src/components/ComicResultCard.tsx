import React, { useState } from "react";
import { Share2, ThumbsUp, ThumbsDown, ShieldAlert, BookOpen, User, Hash, Calendar, FileText, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSubmitRating } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import type { ComicResult, ComicDetail, HistoryItem } from "@workspace/api-client-react/src/generated/api.schemas";

const RANK_MEDALS: Record<number, { emoji: string; label: string; bg: string; border: string }> = {
  1: { emoji: "🥇", label: "1º MAIS PROVÁVEL", bg: "bg-yellow", border: "border-yellow" },
  2: { emoji: "🥈", label: "2ª ALTERNATIVA", bg: "bg-[#C0C0C0]", border: "border-[#C0C0C0]" },
  3: { emoji: "🥉", label: "3ª ALTERNATIVA", bg: "bg-[#CD7F32]", border: "border-[#CD7F32]" },
};

interface ComicResultCardProps {
  comic: ComicResult | ComicDetail | HistoryItem;
  mini?: boolean;
  onClick?: () => void;
}

export function ComicResultCard({ comic, mini = false, onClick }: ComicResultCardProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const submitRatingMutation = useSubmitRating();
  const { toast } = useToast();

  const rank = (comic as ComicResult).rank ?? 1;
  const medal = RANK_MEDALS[rank] ?? RANK_MEDALS[1]!;
  const anoLancamento = (comic as ComicResult).anoLancamento;
  const numeroPagina = (comic as ComicResult).numeroPagina;

  const handleRating = (value: 0 | 1) => {
    if (!comic.id) return;
    if (value === 0) {
      setRating(0);
      setShowFeedback(true);
      return;
    }
    submitRatingWithFeedback(value, "");
  };

  const submitRatingWithFeedback = (value: 0 | 1, feedback: string) => {
    if (!comic.id) return;
    setRating(value);
    setShowFeedback(false);
    submitRatingMutation.mutate(
      { data: { comicId: comic.id, rating: value, feedback } },
      {
        onSuccess: () => {
          toast({
            title: value === 1 ? "POW! Acertou!" : "Obrigado pelo feedback!",
            description: value === 1
              ? "Que bom que identificamos corretamente!"
              : "Vamos usar essa informação para melhorar.",
          });
        },
        onError: () => {
          setRating(null);
          toast({
            title: "Oops!",
            description: "Ocorreu um erro ao enviar sua avaliação.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!comic.id) return;
    const url = `${window.location.origin}/gibi/${comic.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Copiado!", description: "Link copiado para a área de transferência." });
  };

  if (!comic.encontrado && "encontrado" in comic && comic.encontrado === false) {
    return (
      <div className="comic-panel p-8 text-center bg-red/10 border-red">
        <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-red" strokeWidth={2} />
        <h2 className="font-display text-4xl text-red mb-2">Não encontramos esse gibi!</h2>
        <p className="font-bold text-lg">Tente enviar fotos mais nítidas da capa ou de quadros famosos.</p>
      </div>
    );
  }

  if (mini) {
    return (
      <div
        onClick={onClick}
        className="comic-panel-sm p-0 overflow-hidden flex flex-col h-full cursor-pointer hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_#0a0a0a] transition-all bg-white group"
      >
        <div className="h-48 w-full bg-dark relative overflow-hidden border-b-4 border-dark">
          {comic.imageThumbnail ? (
            <img src={`data:image/jpeg;base64,${comic.imageThumbnail}`} alt={comic.titulo} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-yellow/20">
              <BookOpen size={48} className="text-yellow" />
            </div>
          )}
          <div className="absolute top-2 right-2 bg-yellow border-2 border-dark px-2 py-1 font-display tracking-widest text-sm shadow-[2px_2px_0px_#0a0a0a]">
            {comic.confianca}% MATCH
          </div>
        </div>
        <div className="p-4 flex-1 flex flex-col">
          <h3 className="font-display text-2xl leading-none mb-1 line-clamp-2">{comic.titulo}</h3>
          <p className="text-dark/70 font-bold uppercase text-sm mb-4">{comic.editora}</p>
          <div className="mt-auto flex justify-between items-center pt-4 border-t-2 border-dark/10">
            <div className="flex items-center gap-1 font-bold text-sm">
              <ThumbsUp size={16} className={comic.averageRating && comic.averageRating > 0.5 ? "text-cyan fill-cyan" : "text-dark/40"} />
              <span>{comic.totalRatings || 0} avaliações</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="comic-panel overflow-hidden bg-white animate-in slide-in-from-bottom-8 duration-500">
      {/* Header with rank medal */}
      <div className={cn("text-dark p-3 border-b-4 border-dark flex justify-between items-center", medal.bg)}>
        <h2 className="font-display text-2xl tracking-widest flex items-center gap-2">
          <span className="text-3xl">{medal.emoji}</span> {medal.label}
        </h2>
        <div className="bg-dark text-white px-3 py-1 border-2 border-dark font-display text-xl shadow-[2px_2px_0px_#06D6A0]">
          {comic.confianca}% CONFIANÇA
        </div>
      </div>

      <div className="p-6 md:p-8 flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-1/3 flex-shrink-0">
          <div className="comic-panel-sm overflow-hidden aspect-[2/3] bg-paper">
            {comic.imageThumbnail ? (
              <img src={`data:image/jpeg;base64,${comic.imageThumbnail}`} alt={comic.titulo} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-dark/30">
                <BookOpen size={64} strokeWidth={1} />
                <span className="mt-4 font-display text-xl tracking-widest">SEM IMAGEM</span>
              </div>
            )}
          </div>
        </div>

        <div className="w-full md:w-2/3 space-y-5">
          <div>
            <h1 className="font-display text-4xl md:text-5xl leading-none uppercase mb-3 bg-yellow inline-block px-2 border-2 border-dark shadow-[4px_4px_0px_#0a0a0a] -rotate-1">{comic.titulo}</h1>

            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4">
              <p className="text-lg font-bold uppercase text-dark/80 flex items-center gap-2">
                <BookOpen size={18} /> <span className="text-red">{comic.editora || "Editora desconhecida"}</span>
              </p>
              {anoLancamento && (
                <p className="text-lg font-bold uppercase text-dark/80 flex items-center gap-2">
                  <Calendar size={18} /> <span className="text-cyan">{anoLancamento}</span>
                </p>
              )}
              {numeroPagina && (
                <p className="text-lg font-bold uppercase text-dark/80 flex items-center gap-2">
                  <FileText size={18} /> PÁGINA <span className="text-red">{numeroPagina}</span>
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-display text-2xl flex items-center gap-2">
              <User size={24} /> PERSONAGENS
            </h3>
            <div className="flex flex-wrap gap-2">
              {comic.personagens && comic.personagens.map((p, i) => (
                <span key={i} className="comic-badge bg-cyan/20">{p}</span>
              ))}
              {(!comic.personagens || comic.personagens.length === 0) && (
                <span className="italic text-dark/50 font-bold">Nenhum personagem detectado</span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-display text-2xl flex items-center gap-2">
              <Hash size={24} /> SINOPSE
            </h3>
            <p className="font-bold text-lg bg-paper p-4 border-2 border-dark rounded-br-2xl">{comic.descricao}</p>
          </div>

          {comic.balloonText && (
            <div className="pt-2">
              <div className="comic-speech-bubble">
                "{comic.balloonText}"
              </div>
            </div>
          )}

          {/* Rating */}
          {comic.id && rating === null && (
            <div className="pt-4 mt-4 border-t-4 border-dashed border-dark/20">
              <p className="font-display text-xl mb-3">A IDENTIFICAÇÃO ESTÁ CORRETA?</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => handleRating(1)}
                  className="comic-button bg-cyan text-white py-3 px-6 flex items-center justify-center gap-2 flex-1"
                >
                  <ThumbsUp size={22} /> SIM, ACERTOU!
                </button>
                <button
                  onClick={() => handleRating(0)}
                  className="comic-button bg-white hover:bg-red/10 py-3 px-6 flex items-center justify-center gap-2 flex-1"
                >
                  <ThumbsDown size={22} /> NÃO, ERROU
                </button>
              </div>
            </div>
          )}

          {/* Dislike feedback form */}
          {showFeedback && rating === 0 && (
            <div className="pt-2 space-y-3 bg-red/5 border-2 border-red p-4">
              <p className="font-display text-xl text-red">QUAL SERIA O CORRETO?</p>
              <input
                type="text"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Ex: Turma da Mônica nº 45 (1975)"
                className="w-full comic-input text-base"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => submitRatingWithFeedback(0, feedbackText)}
                  className="comic-button bg-red text-white py-2 px-5 flex items-center gap-2"
                >
                  <Send size={18} /> ENVIAR FEEDBACK
                </button>
                <button
                  onClick={() => { setShowFeedback(false); setRating(null); }}
                  className="comic-button bg-white py-2 px-4 text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Rating given */}
          {rating !== null && !showFeedback && (
            <div className={cn(
              "pt-4 mt-4 border-t-4 border-dashed border-dark/20 font-display text-xl flex items-center gap-2",
              rating === 1 ? "text-cyan" : "text-red"
            )}>
              {rating === 1 ? <><ThumbsUp size={22} className="fill-cyan" /> AVALIADO COMO CORRETO!</> : <><ThumbsDown size={22} className="fill-red" /> FEEDBACK ENVIADO!</>}
            </div>
          )}

          {comic.id && (
            <button
              onClick={handleShare}
              className="comic-button bg-yellow py-3 px-6 flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <Share2 size={20} strokeWidth={3} /> COMPARTILHAR
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
