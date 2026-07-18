import { Link, useLocation } from "wouter";
import { Search, Compass, BookMarked, Clock, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { path: "/", label: "Buscar", icon: Search },
  { path: "/explorar", label: "Explorar", icon: Compass },
  { path: "/colecao", label: "Coleção", icon: BookMarked },
  { path: "/historico", label: "Histórico", icon: Clock },
  { path: "/ranking", label: "Ranking", icon: Trophy },
];

// Thumb-friendly bottom tab bar for phones (hidden on desktop, which keeps the
// top nav). Sits above the home indicator via safe-area padding.
export function BottomNav() {
  const [location] = useLocation();
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-secondary border-t-4 border-black flex justify-around"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {ITEMS.map(({ path, label, icon: Icon }) => {
        const active = location === path;
        return (
          <Link
            key={path}
            href={path}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-14 font-display text-3xs uppercase tracking-wide transition-colors",
              active ? "text-primary" : "text-black/60 hover:text-black"
            )}
          >
            <Icon className={cn("w-5 h-5 transition-transform", active && "scale-110")} strokeWidth={active ? 3 : 2.5} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
