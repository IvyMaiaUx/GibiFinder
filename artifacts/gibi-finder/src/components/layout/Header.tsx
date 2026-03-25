import { Link, useLocation } from "wouter";
import { Search, Clock, Trophy, BookMarked } from "lucide-react";
import { cn } from "@/lib/utils";

export function Header() {
  const [location] = useLocation();

  const navItems = [
    { path: "/", label: "BUSCAR GIBI", icon: Search },
    { path: "/colecao", label: "MINHA COLEÇÃO", icon: BookMarked },
    { path: "/historico", label: "HISTÓRICO", icon: Clock },
    { path: "/ranking", label: "RANKING", icon: Trophy },
  ];

  return (
    <header className="bg-secondary border-b-8 border-black sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-24 flex items-center justify-between">
        
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group comic-hover transition-transform">
          <div className="bg-primary text-primary-foreground font-display text-3xl px-4 py-2 rounded-lg border-4 border-black comic-shadow transform -rotate-3 group-hover:rotate-0 transition-all">
            GIBI
          </div>
          <span className="font-display text-4xl text-black tracking-wider group-hover:scale-105 transition-transform drop-shadow-[2px_2px_0_white]">
            FINDER
          </span>
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-4">
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

        {/* Mobile Nav Button (Simplified for this example, usually a drawer) */}
        <div className="md:hidden flex items-center gap-2">
          {navItems.map((item) => (
             <Link
             key={item.path}
             href={item.path}
             className={cn(
               "p-2 border-4 border-black rounded-lg transition-all",
               location === item.path ? "bg-white" : "bg-transparent"
             )}
           >
             <item.icon className="w-6 h-6" strokeWidth={3} />
           </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
