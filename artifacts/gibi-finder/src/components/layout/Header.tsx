import { Link, useLocation } from "wouter";
import { Search, Clock, Trophy, BookMarked, Compass } from "lucide-react";
import { cn } from "@/lib/utils";

export function Header() {
  const [location] = useLocation();

  const navItems = [
    { path: "/", label: "BUSCAR GIBI", icon: Search },
    { path: "/explorar", label: "EXPLORAR", icon: Compass },
    { path: "/colecao", label: "MINHA COLEÇÃO", icon: BookMarked },
    { path: "/historico", label: "HISTÓRICO", icon: Clock },
    { path: "/ranking", label: "RANKING", icon: Trophy },
  ];

  return (
    <header className="bg-secondary border-b-8 border-black sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-20 md:h-24 flex items-center justify-between gap-2">
        
        {/* Logo */}
        <Link href="/" className="flex items-center gap-1.5 group comic-hover transition-transform shrink-0">
          <div className="bg-primary text-primary-foreground font-display text-lg sm:text-xl md:text-3xl px-2 md:px-4 py-1 md:py-2 rounded-lg border-2 sm:border-4 border-black comic-shadow transform -rotate-3 group-hover:rotate-0 transition-all">
            GIBI
          </div>
          <span className="hidden sm:inline font-display text-2xl md:text-4xl text-black tracking-wider group-hover:scale-105 transition-transform drop-shadow-[2px_2px_0_white]">
            FINDER
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-4">
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "flex items-center gap-2 font-display text-xl px-4 py-2 border-4 border-black rounded-lg transition-all comic-shadow-sm comic-hover comic-active",
                  isActive 
                    ? "bg-white text-black translate-y-[-2px] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" 
                    : "bg-transparent text-black hover:bg-white/50"
                )}
              >
                <Icon className="w-5 h-5" strokeWidth={3} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile Navigation — icon only, compact */}
        <nav className="lg:hidden flex items-center gap-0.5 sm:gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "p-1.5 sm:p-2 border-2 sm:border-[3px] border-black rounded-lg transition-all",
                  location === item.path ? "bg-white" : "bg-transparent hover:bg-white/50"
                )}
                title={item.label}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
