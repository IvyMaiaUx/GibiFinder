import React, { useCallback, useState, useImperativeHandle, forwardRef } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploaderProps {
  onFilesChange: (files: File[]) => void;
  maxFiles?: number;
  isLoading?: boolean;
}

export interface ImageUploaderRef {
  getFiles: () => File[];
  clear: () => void;
}

export const ImageUploader = forwardRef<ImageUploaderRef, ImageUploaderProps>(
  ({ onFilesChange, maxFiles = 3, isLoading }, ref) => {
    const [previewFiles, setPreviewFiles] = useState<(File & { preview: string })[]>([]);

    useImperativeHandle(ref, () => ({
      getFiles: () => previewFiles,
      clear: () => {
        setPreviewFiles([]);
        onFilesChange([]);
      }
    }));

    const onDrop = useCallback((acceptedFiles: File[]) => {
      const newFiles = acceptedFiles.map(file =>
        Object.assign(file, { preview: URL.createObjectURL(file) })
      );
      setPreviewFiles(prev => {
        const combined = [...prev, ...newFiles].slice(0, maxFiles);
        setTimeout(() => onFilesChange(combined), 0);
        return combined;
      });
    }, [maxFiles, onFilesChange]);

    const removeFile = (index: number) => {
      setPreviewFiles(prev => {
        const updated = prev.filter((_, i) => i !== index);
        onFilesChange(updated);
        return updated;
      });
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
      onDrop,
      accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
      maxFiles: maxFiles - previewFiles.length,
      disabled: isLoading || previewFiles.length >= maxFiles
    });

    return (
      <div className="w-full space-y-6">
        {previewFiles.length === 0 && (
          <div
            {...getRootProps()}
            className={cn(
              "relative overflow-hidden cursor-pointer comic-panel transition-all duration-300 min-h-[250px] flex flex-col items-center justify-center p-8 text-center group",
              isDragActive ? "bg-cyan border-dashed ring-8 ring-cyan/30 scale-[1.02]" : "bg-paper hover:bg-yellow/20",
              (isLoading) && "opacity-60 cursor-not-allowed"
            )}
          >
            <input {...getInputProps()} />
            <div className="absolute -top-4 -left-4 bg-yellow w-16 h-16 rounded-full border-4 border-dark opacity-0 group-hover:opacity-100 transition-opacity scale-0 group-hover:scale-100 duration-300" />
            <div className="absolute -bottom-6 -right-6 bg-cyan w-24 h-24 rounded-full border-4 border-dark opacity-0 group-hover:opacity-100 transition-opacity scale-0 group-hover:scale-100 duration-500" />
            <div className="bg-white p-4 border-4 border-dark rounded-full mb-4 shadow-[4px_4px_0px_0px_#0a0a0a] group-hover:-translate-y-2 transition-transform duration-300 z-10">
              <UploadCloud className="w-12 h-12 text-red" strokeWidth={2.5} />
            </div>
            <h3 className="font-display text-3xl mb-2 z-10">
              {isDragActive ? "SOLTA AÍ!" : "ARRASTE AS FOTOS AQUI"}
            </h3>
            <p className="font-bold text-lg text-dark/70 z-10 bg-white/80 px-4 py-1 rounded-md border-2 border-dark">
              Ou clique para procurar (Máx: {maxFiles} imagens)
            </p>
          </div>
        )}

        {previewFiles.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {previewFiles.map((file, index) => (
              <div key={file.name + index} className="relative comic-panel-sm group overflow-hidden bg-white aspect-[3/4]">
                <img
                  src={file.preview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  onLoad={() => { URL.revokeObjectURL(file.preview); }}
                />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                  disabled={isLoading}
                  className="absolute top-2 right-2 bg-red text-white p-1.5 border-2 border-dark comic-button opacity-0 group-hover:opacity-100 transition-opacity shadow-none"
                >
                  <X size={16} strokeWidth={3} />
                </button>
              </div>
            ))}

            {previewFiles.length < maxFiles && (
              <div
                {...getRootProps()}
                className="comic-panel-sm border-dashed flex flex-col items-center justify-center bg-paper/50 cursor-pointer hover:bg-yellow/20 aspect-[3/4]"
              >
                <input {...getInputProps()} />
                <ImageIcon size={32} className="text-dark/40 mb-2" />
                <span className="font-display text-xl text-dark/60">ADICIONAR MAIS</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);

ImageUploader.displayName = "ImageUploader";
