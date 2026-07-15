import { Link, useLocation } from "wouter";
import { Search, Clock, Trophy, BookMarked, Compass, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export function Header() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const navItems = [
    { path: "/", label: "BUSCAR GIBI", icon: Search },
    { path: "/explorar", label: "EXPLORAR", icon: Compass },
    { path: "/colecao", label: "MINHA COLEÇÃO", icon: BookMarked },
    { path: "/historico", label: "HISTÓRICO", icon: Clock },
    { path: "/ranking", label: "RANKING", icon: Trophy },
  ];

  return (
    <header className="bg-secondary border-b-8 border-black sticky top-0 z-50 animate-in fade-in duration-100">
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

        {/* Auth Actions (Desktop) */}
        <div className="hidden lg:flex items-center gap-2 border-l-4 border-black/10 pl-4 ml-2">
          {user ? (
            <div className="flex items-center gap-3 animate-in fade-in duration-200">
              <Link href="/login" className="flex items-center gap-1.5 font-display text-sm text-black hover:translate-y-[-1px] transition-transform select-none">
                <div className="w-8 h-8 rounded-full bg-primary border-2 border-black flex items-center justify-center text-white font-display text-sm leading-none">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="font-sans font-bold text-black text-sm tracking-wide">{user.username}</span>
              </Link>
              <button 
                onClick={logout}
                className="font-display text-base bg-white hover:bg-red-100 border-4 border-black px-3.5 py-1.5 rounded-lg transition-colors"
              >
                SAIR
              </button>
            </div>
          ) : (
            <Link 
              href="/login"
              className="bg-primary text-white hover:bg-yellow-400 hover:text-black font-display text-base border-4 border-black px-4 py-2 rounded-lg comic-shadow-sm transition-colors uppercase flex items-center justify-center"
            >
              Conectar
            </Link>
          )}
        </div>

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

          {/* Auth Actions (Mobile) */}
          <div className="flex items-center border-l-2 border-black/10 pl-2 ml-1">
            {user ? (
              <Link 
                href="/login"
                className="w-8 h-8 rounded-full bg-primary border-2 border-black flex items-center justify-center text-white text-xs font-display select-none hover:translate-y-[-1px] transition-transform"
                title={`Conta de ${user.username}`}
              >
                {user.username.charAt(0).toUpperCase()}
              </Link>
            ) : (
              <Link 
                href="/login"
                className="p-1.5 border-2 border-black rounded-lg bg-primary text-white hover:bg-yellow-400 transition-colors flex items-center justify-center"
                title="Conectar"
              >
                <User className="w-4.5 h-4.5" strokeWidth={3} />
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
