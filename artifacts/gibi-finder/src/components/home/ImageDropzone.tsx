import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const PROGRESS_STEPS = [
  "ANALISANDO A IMAGEM...",
  "COMPARANDO COM O CATÁLOGO...",
  "CONSULTANDO O ARQUIVO...",
  "IDENTIFICANDO PERSONAGENS...",
  "QUASE LÁ...",
];

interface ImageDropzoneProps {
  onImagesReady: (files: File[]) => void;
  isPending: boolean;
}

export function ImageDropzone({ onImagesReady, isPending }: ImageDropzoneProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const stepRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPending) {
      setStepIndex(0);
      stepRef.current = setInterval(() => setStepIndex(i => (i + 1) % PROGRESS_STEPS.length), 3000);
    } else {
      if (stepRef.current) clearInterval(stepRef.current);
    }
    return () => { if (stepRef.current) clearInterval(stepRef.current); };
  }, [isPending]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = [...files, ...acceptedFiles].slice(0, 3);
    setFiles(newFiles);

    // Revoke old object URLs before creating new ones to avoid memory leaks.
    setPreviews(prev => {
      prev.forEach(url => URL.revokeObjectURL(url));
      return newFiles.map(file => URL.createObjectURL(file));
    });
  }, [files]);

  useEffect(() => {
    return () => { previews.forEach(url => URL.revokeObjectURL(url)); };
  }, [previews]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 3,
    disabled: isPending
  });

  const removeFile = (index: number) => {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    setFiles(newFiles);
    
    const newPreviews = [...previews];
    URL.revokeObjectURL(newPreviews[index]);
    newPreviews.splice(index, 1);
    setPreviews(newPreviews);
  };

  const handleIdentify = () => {
    if (files.length > 0) {
      onImagesReady(files);
    }
  };

  return (
    <div className="space-y-6">
      <div 
        {...getRootProps()} 
        className={cn(
          "border-4 border-dashed border-black rounded-xl p-8 text-center cursor-pointer transition-colors",
          isDragActive ? "bg-secondary/20" : "bg-white/50 hover:bg-white",
          isPending && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center border-4 border-black comic-shadow-sm">
            <ImagePlus className="w-8 h-8 text-white" strokeWidth={3} />
          </div>
          <div>
            <p className="font-display text-2xl text-black">Arraste fotos do gibi aqui</p>
            <p className="font-bold text-gray-600 mt-1">ou clique para selecionar (máx. 3 fotos)</p>
          </div>
        </div>
      </div>

      {previews.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
          {previews.map((preview, i) => (
            <div key={i} className="relative flex-shrink-0 w-32 h-40 comic-border bg-white overflow-hidden">
              <img src={preview} alt={`Preview ${i}`} className="w-full h-full object-cover" />
              <button 
                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                disabled={isPending}
                className="absolute top-1 right-1 bg-destructive text-white p-1 border-2 border-black rounded-full hover:scale-110 transition-transform disabled:opacity-50"
              >
                <X className="w-4 h-4" strokeWidth={3} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleIdentify}
        disabled={files.length === 0 || isPending}
        className="w-full bg-primary text-white font-display text-3xl py-4 comic-border comic-shadow comic-hover comic-active disabled:opacity-50 disabled:transform-none disabled:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] disabled:cursor-not-allowed"
      >
        {isPending ? PROGRESS_STEPS[stepIndex] : "IDENTIFICAR GIBI!"}
      </button>
    </div>
  );
}
