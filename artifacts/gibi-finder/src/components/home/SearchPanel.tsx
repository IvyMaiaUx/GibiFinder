import { useState } from "react";
import { Camera, Type, Users, MessageSquare, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageDropzone } from "./ImageDropzone";
import { TextInputSearch } from "./TextInputSearch";

type SearchMode = 'online' | 'image' | 'text' | 'character' | 'quote';

interface SearchPanelProps {
  onSearchImage: (files: File[]) => void;
  onSearchText: (query: string) => void;
  onSearchCharacter: (character: string) => void;
  onSearchQuote: (quote: string) => void;
  onSearchOnline: (query: string) => void;
  isPending: boolean;
}

export function SearchPanel({ 
  onSearchImage, 
  onSearchText, 
  onSearchCharacter, 
  onSearchQuote, 
  onSearchOnline,
  isPending 
}: SearchPanelProps) {
  const [mode, setMode] = useState<SearchMode>('online');

  // `short` is the phone label. The tabs used to hide their label below `sm`
  // while keeping a 140px minimum width — five unlabelled icons spread across
  // ~700px of horizontal scroll, so a phone showed two anonymous icons and no
  // hint that the rest existed.
  const tabs = [
    { id: 'online', label: 'Busca Direta', short: 'Direta', icon: Globe },
    { id: 'image', label: 'Por Imagem (IA)', short: 'Imagem', icon: Camera },
    { id: 'text', label: 'Por Descrição (IA)', short: 'Descrição', icon: Type },
    { id: 'character', label: 'Por Personagem (IA)', short: 'Personagem', icon: Users },
    { id: 'quote', label: 'Por Fala (IA)', short: 'Fala', icon: MessageSquare },
  ] as const;

  return (
    <div className="comic-panel max-w-4xl mx-auto overflow-hidden">
      {/* Tabs Header */}
      <div
        role="tablist"
        aria-label="Modo de busca"
        className="flex overflow-x-auto flex-nowrap no-scrollbar border-b-4 border-black bg-muted/30 snap-x snap-mandatory"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = mode === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setMode(tab.id)}
              disabled={isPending}
              className={cn(
                "flex-1 flex-shrink-0 snap-start min-w-[84px] sm:min-w-[160px]",
                "flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2",
                "min-h-14 py-2.5 sm:py-4 px-2 sm:px-3 font-display text-2xs sm:text-lg transition-colors border-b-4",
                isActive
                  ? "bg-white text-black border-primary"
                  : "text-gray-500 border-transparent hover:bg-white/50 hover:text-black",
                "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary focus:outline-none"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" strokeWidth={isActive ? 3 : 2} />
              <span className="sm:hidden leading-none">{tab.short}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="p-4 sm:p-6 md:p-8 bg-white">
        {mode === 'online' && (
          <TextInputSearch 
            onSearch={onSearchOnline} 
            isPending={isPending}
            placeholder="Digite o título do mangá, gibi ou HQ (ex: One Piece, Naruto, Spider-Man, Watchmen)..."
            buttonText="BUSCAR"
          />
        )}

        {mode === 'image' && (
          <ImageDropzone onImagesReady={onSearchImage} isPending={isPending} />
        )}
        
        {mode === 'text' && (
          <TextInputSearch 
            onSearch={onSearchText} 
            isPending={isPending}
            placeholder="Ex: gibi da Mônica, mangá do Naruto com capa laranja, HQ do Batman nos anos 90..."
            buttonText="BUSCAR POR DESCRIÇÃO"
            hint="💡 Quanto mais detalhes você der, melhor o resultado! Editora, ano, cor da capa, tema da história — tudo ajuda."
          />
        )}

        {mode === 'character' && (
          <TextInputSearch 
            onSearch={onSearchCharacter} 
            isPending={isPending}
            placeholder="Ex: Cebolinha, Luffy, Goku, Batman, Menino Maluquinho..."
            buttonText="BUSCAR POR PERSONAGEM"
          />
        )}

        {mode === 'quote' && (
          <TextInputSearch 
            onSearch={onSearchQuote} 
            isPending={isPending}
            placeholder="Ex: 'Eu vou ser o Rei dos Piratas!', 'Com grandes poderes...', 'Mas o que é isso, Cascão?!'"
            buttonText="BUSCAR POR FALA"
          />
        )}
      </div>
    </div>
  );
}
