import { useToast } from "@/hooks/use-toast";
import { X } from "lucide-react";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]">
      {toasts.map(function ({ id, title, description, variant, action }) {
        return (
          <div
            key={id}
            className={`comic-panel p-4 mb-4 relative ${
              variant === "destructive" ? "bg-red text-white" : "bg-yellow text-dark"
            } animate-in slide-in-from-bottom-5`}
          >
            <div className="grid gap-1">
              {title && <div className="font-display tracking-wide text-xl">{title}</div>}
              {description && <div className="text-sm font-bold">{description}</div>}
            </div>
            {action}
            <button
              onClick={() => dismiss(id)}
              className="absolute right-2 top-2 rounded-md p-1 opacity-70 hover:opacity-100 comic-button border-2 border-dark"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
