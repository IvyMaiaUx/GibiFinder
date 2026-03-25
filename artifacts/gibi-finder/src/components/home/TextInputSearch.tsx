import { useState } from "react";
import { Search } from "lucide-react";

interface TextInputSearchProps {
  onSearch: (query: string) => void;
  isPending: boolean;
  placeholder: string;
  buttonText: string;
}

export function TextInputSearch({ onSearch, isPending, placeholder, buttonText }: TextInputSearchProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          disabled={isPending}
          className="w-full bg-white font-sans font-bold text-lg md:text-xl p-4 pl-12 comic-border focus:outline-none focus:ring-4 focus:ring-secondary focus:border-black placeholder:text-gray-400 disabled:opacity-50 transition-all"
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-black" strokeWidth={3} />
      </div>

      <button
        type="submit"
        disabled={!query.trim() || isPending}
        className="w-full bg-secondary text-black font-display text-3xl py-4 comic-border comic-shadow comic-hover comic-active disabled:opacity-50 disabled:transform-none disabled:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] disabled:cursor-not-allowed"
      >
        {isPending ? "BUSCANDO..." : buttonText}
      </button>
    </form>
  );
}
