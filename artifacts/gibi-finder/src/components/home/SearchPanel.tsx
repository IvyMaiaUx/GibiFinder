import { useState } from "react";
import { Camera, Type, Users, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageDropzone } from "./ImageDropzone";
import { TextInputSearch } from "./TextInputSearch";

type SearchMode = 'image' | 'text' | 'character' | 'quote';

interface SearchPanelProps {
  onSearchImage: (files: File[]) => void;
  onSearchText: (query: string) => void;
  onSearchCharacter: (character: string) => void;
  onSearchQuote: (quote: string) => void;
  isPending: boolean;
}

export function SearchPanel({ 
  onSearchImage, 
  onSearchText, 
  onSearchCharacter, 
  onSearchQuote, 
  isPending 
}: SearchPanelProps) {
  const [mode, setMode] = useState<SearchMode>('image');

  const tabs = [
    { id: 'image', label: 'Por Imagem', icon: Camera },
    { id: 'text', label: 'Por Texto', icon: Type },
    { id: 'character', label: 'Por Personagem', icon: Users },
    { id: 'quote', label: 'Por Fala', icon: MessageSquare },
  ] as const;

  return (
    <div className="comic-panel max-w-4xl mx-auto overflow-hidden">
      {/* Tabs Header */}
      <div className="flex flex-wrap sm:flex-nowrap border-b-4 border-black bg-muted/30">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = mode === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              disabled={isPending}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-4 px-2 font-display text-xl transition-colors border-b-4",
                isActive 
                  ? "bg-white text-black border-primary" 
                  : "text-gray-500 border-transparent hover:bg-white/50 hover:text-black",
                "focus:outline-none"
              )}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 3 : 2} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="p-6 md:p-8 bg-white">
        {mode === 'image' && (
          <ImageDropzone onImagesReady={onSearchImage} isPending={isPending} />
        )}
        
        {mode === 'text' && (
          <TextInputSearch 
            onSearch={onSearchText} 
            isPending={isPending}
            placeholder="Ex: Turma da Mônica número 12 editora Globo..."
            buttonText="BUSCAR POR TEXTO"
          />
        )}

        {mode === 'character' && (
          <TextInputSearch 
            onSearch={onSearchCharacter} 
            isPending={isPending}
            placeholder="Ex: Cebolinha, Astronauta, Menino Maluquinho..."
            buttonText="BUSCAR POR PERSONAGEM"
          />
        )}

        {mode === 'quote' && (
          <TextInputSearch 
            onSearch={onSearchQuote} 
            isPending={isPending}
            placeholder="Ex: 'Mas o que é isso, Cascão?!'"
            buttonText="BUSCAR POR FALA"
          />
        )}
      </div>
    </div>
  );
}
